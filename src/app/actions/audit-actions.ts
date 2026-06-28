'use server';

import prisma from "@/lib/prisma";
import { auth } from "@/auth";

export async function createAuditLog(data: {
    action: string;
    entity: string;
    entityId?: string;
    details?: any;
    ipAddress?: string;
    userAgent?: string;
}) {
    try {
        const session = await auth();
        // Allow logging even without session if it's a login attempt, but for now we focus on authenticated actions
        if (!session?.user) return;

        await (prisma as any).auditLog.create({
            data: {
                ...data,
                userId: session.user.id,
                tenantId: session.user.tenantId,
            }
        });
    } catch (error) {
        console.error('Failed to create audit log:', error);
    }
}
