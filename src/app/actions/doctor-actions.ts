'use server';

import prisma from "@/lib/prisma";
import { UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import bcrypt from "bcryptjs";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

const CreateDoctorSchema = z.object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    email: z.string().email("Invalid email address"),
    phone: z.string().min(10, "Phone number must be at least 10 characters"),
    specialization: z.string().min(2, "Specialization is required"),
    departmentId: z.string().min(1, "Department is required"),
    licenseNumber: z.string().optional(),
    password: z.string().min(6, "Password must be at least 6 characters"),
    availability: z.any().optional(), // JSON
    tenantId: z.string(),
});

export type DoctorFormState = {
    errors?: {
        name?: string[];
        email?: string[];
        phone?: string[];
        specialization?: string[];
        password?: string[];
        _form?: string[];
    };
    message?: string;
};

export async function createDoctor(
    prevState: DoctorFormState,
    formData: FormData
): Promise<DoctorFormState> {
    const rawData = {
        name: formData.get("name"),
        email: formData.get("email"),
        phone: formData.get("phone"),
        specialization: formData.get("specialization"),
        departmentId: formData.get("departmentId"),
        licenseNumber: formData.get("licenseNumber"),
        password: formData.get("password"),
        tenantId: formData.get("tenantId"),
    };

    const validatedFields = CreateDoctorSchema.safeParse(rawData);

    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: "Missing Fields. Failed to Create Doctor.",
        };
    }

    const { name, email, phone, specialization, departmentId, licenseNumber, password, tenantId } = validatedFields.data;

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        await prisma.$transaction(async (tx) => {
            // 1. Fetch department name to use as specialization if provided 'General Practice'
            const dept = await tx.department.findUnique({
                where: { id: departmentId }
            });
            const finalSpecialization = (specialization === 'General Practice' && dept)
                ? dept.name
                : specialization;

            // 2. Create User
            const user = await tx.user.create({
                data: {
                    name,
                    email,
                    phone,
                    password: hashedPassword,
                    role: UserRole.DOCTOR,
                    tenantId,
                },
            });

            // 3. Create Doctor Profile
            await tx.doctorProfile.create({
                data: {
                    userId: user.id,
                    tenantId,
                    specialization: finalSpecialization,
                    departmentId,
                    licenseNumber: licenseNumber || null,
                    availability: {}, // Default empty availability
                },
            });
        });

        revalidatePath(`/${tenantId}/doctors`); // Adjust path logic if needed
        return { message: "Doctor created successfully." };
    } catch (error: any) {
        console.error("Database Error:", error);
        if (error.code === 'P2002') {
            return {
                message: "Email already exists in this organization.",
            }
        }
        return {
            message: "Database Error: Failed to Create Doctor.",
        };
    }
}
export async function updateDoctor(doctorId: string, data: any) {
    try {
        await prisma.$transaction(async (tx) => {
            // Update User
            await tx.user.update({
                where: { id: doctorId },
                data: {
                    name: data.name,
                    email: data.email,
                    phone: data.phone,
                },
            });

            // Update Doctor Profile
            await tx.doctorProfile.update({
                where: { userId: doctorId },
                data: {
                    specialization: data.specialization,
                    licenseNumber: data.licenseNumber,
                },
            });
        });

        // revalidatePath(`/${tenantId}/doctors`);
        revalidatePath(`/doctors`);
        return { success: true, message: "Doctor updated successfully!" };
    } catch (error) {
        console.error("Update Doctor Error:", error);
        return { success: false, message: "Failed to update doctor." };
    }
}

export async function deleteDoctor(doctorId: string) {
    try {
        // Soft delete or hard delete? Let's do hard delete for now as per plan
        await prisma.user.delete({
            where: { id: doctorId }
        });
        revalidatePath(`/doctors`);
        return { success: true, message: "Doctor deleted successfully!" };
    } catch (error) {
        console.error("Delete Doctor Error:", error);
        return { success: false, message: "Failed to delete doctor." };
    }
}
