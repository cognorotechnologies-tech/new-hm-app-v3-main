'use server';

import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const DepartmentSchema = z.object({
    name: z.string().min(2, "Department name must be at least 2 characters"),
    description: z.string().optional(),
    headDoctorId: z.string().optional().nullable(),
    tenantId: z.string(),
});

export type DepartmentFormState = {
    errors?: {
        name?: string[];
        description?: string[];
        headDoctorId?: string[];
        _form?: string[];
    };
    message?: string;
};

export async function createDepartment(
    prevState: DepartmentFormState,
    formData: FormData
): Promise<DepartmentFormState> {
    const rawData = {
        name: formData.get("name"),
        description: formData.get("description"),
        headDoctorId: formData.get("headDoctorId"),
        tenantId: formData.get("tenantId"),
    };

    const validatedFields = DepartmentSchema.safeParse(rawData);

    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: "Missing Fields. Failed to Create Department.",
        };
    }

    const { name, description, headDoctorId, tenantId } = validatedFields.data;

    try {
        await prisma.department.create({
            data: {
                name,
                description,
                headDoctorId: headDoctorId || null,
                tenantId,
            },
        });

        revalidatePath(`/${tenantId}/departments`);
        return { message: "Department created successfully." };
    } catch (error: any) {
        if (error.code === 'P2002') {
            return {
                message: "Department with this name already exists.",
            }
        }
        return {
            message: "Database Error: Failed to Create Department.",
        };
    }
}

export async function updateDepartment(departmentId: string, data: any) {
    try {
        await prisma.department.update({
            where: { id: departmentId },
            data: {
                name: data.name,
                description: data.description,
                headDoctorId: data.headDoctorId || null,
            }
        });
        revalidatePath(`/departments`);
        return { success: true, message: "Department updated successfully!" };
    } catch (error) {
        console.error("Update Department Error:", error);
        return { success: false, message: "Failed to update department." };
    }
}

export async function deleteDepartment(departmentId: string) {
    try {
        await prisma.department.delete({
            where: { id: departmentId }
        });
        revalidatePath(`/departments`);
        return { success: true, message: "Department deleted successfully!" };
    } catch (error) {
        console.error("Delete Department Error:", error);
        return { success: false, message: "Failed to delete department." };
    }
}
