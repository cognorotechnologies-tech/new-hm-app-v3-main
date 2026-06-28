'use server'

import { z } from 'zod';
import prisma from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';

const BillSchema = z.object({
    amount: z.number().nonnegative(),
    patientId: z.string().optional().nullable(),
    doctorId: z.string().optional().nullable(),
    tenantId: z.string().uuid(),
    paymentMethod: z.string().optional(),
    status: z.string().default("PAID"),
    items: z.array(z.object({
        name: z.string(),
        quantity: z.number(),
        price: z.number(),
        total: z.number()
    }))
});

export type BillState = {
    errors?: {
        amount?: string[];
        general?: string[];
    };
    message?: string;
    success?: boolean;
};

export async function createBill(
    prevState: any,
    formData: FormData
): Promise<BillState> {
    const session = await auth();
    if (!session?.user || !['ADMIN', 'SUPER_ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST'].includes(session.user.role)) {
        return { message: "Unauthorized." };
    }

    const itemsRaw = formData.get('items') as string;
    const items = JSON.parse(itemsRaw);
    const totalAmount = items.reduce((acc: number, item: any) => acc + item.total, 0);

    const rawData = {
        amount: totalAmount,
        patientId: formData.get('patientId') || null,
        doctorId: formData.get('doctorId') || null,
        tenantId: formData.get('tenantId'),
        paymentMethod: formData.get('paymentMethod'),
        status: formData.get('status') || "PAID",
        items,
    };

    const validatedFields = BillSchema.safeParse(rawData);

    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: 'Validation failed.',
        };
    }

    const { amount, patientId, doctorId, tenantId, paymentMethod, status, items: validatedItems } = validatedFields.data;

    try {
        // Transaction to create bill and optionally update inventory if needed
        // For now, just create the bill
        await prisma.bill.create({
            data: {
                amount,
                patientId,
                doctorId,
                tenantId,
                paymentMethod,
                status,
                items: validatedItems as any
            }
        });

        revalidatePath(`/${tenantId}/billing`);
        return { success: true, message: "Bill created successfully." };
    } catch (error) {
        console.error('Billing Error:', error);
        return { message: "Database Error: Failed to Create Bill." };
    }
}
export async function deleteBill(billId: string) {
    try {
        await prisma.bill.delete({
            where: { id: billId }
        });
        revalidatePath(`/billing`);
        return { success: true, message: "Invoice deleted successfully!" };
    } catch (error) {
        console.error("Delete Bill Error:", error);
        return { success: false, message: "Failed to delete bill." };
    }
}
