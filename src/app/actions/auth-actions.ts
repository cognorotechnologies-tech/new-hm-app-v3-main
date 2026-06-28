'use server';

import { signIn, signOut, auth } from '@/auth';
import { UserRole } from "@prisma/client"
import { AuthError } from 'next-auth';
import prisma from '@/lib/prisma';
import { createAuditLog } from './audit-actions';

export async function authenticate(
    prevState: string | undefined,
    formData: FormData,
) {
    const data = Object.fromEntries(formData);
    const slug = data.slug as string;
    const ip = '127.0.0.1'; // In production, use headers to get IP

    // Pre-fetch tenant to avoid FK issues in audit logging and to validate slug early
    const tenant = await (prisma as any).tenant.findUnique({
        where: { slug }
    });

    if (!tenant && slug !== 'system') {
        return 'Invalid organization slug.';
    }

    // Rate Limiting: Check for too many failures in last 15 mins for this IP
    const recentFailures = await (prisma as any).auditLog.count({
        where: {
            action: 'LOGIN_FAILURE',
            details: { path: ['ip'], equals: ip },
            createdAt: { gte: new Date(Date.now() - 15 * 60 * 1000) }
        }
    });

    if (recentFailures >= 5) {
        return 'Too many login attempts. Please try again later.';
    }

    try {
        let redirectTo = '/dashboard';
        if (slug === 'system') {
            redirectTo = '/admin';
        }

        // Remove redirect: false to allow NextAuth to throw the native redirect error
        await signIn('credentials', { ...data, redirectTo });

        return undefined; // Usually unreachable as signIn throws on success/redirect
    } catch (error: any) {
        // Handle next-auth redirect behavior
        if (error.message === 'NEXT_REDIRECT' || error.name === 'NextRedirect') {
            throw error;
        }

        // NextAuth throws AuthError for sign-in failures
        if (error instanceof AuthError) {
            if (tenant) {
                await (prisma as any).auditLog.create({
                    data: {
                        action: 'LOGIN_FAILURE',
                        entity: 'User',
                        details: { ip, email: data.email },
                        tenantId: tenant.id
                    }
                });
            }

            switch (error.type) {
                case 'CredentialsSignin':
                    return 'Invalid credentials.';
                default:
                    return 'Something went wrong.';
            }
        }

        // IMPORTANT: Rethrow error if it is NOT an AuthError
        // This includes Next.js internal redirect errors which MUST be rethrown
        throw error;
    }
}

export async function logout() {
    const session = await auth();
    if (session?.user) {
        try {
            await (prisma as any).session.deleteMany({
                where: { userId: session.user.id }
            });
        } catch (e) {
            console.error('Session cleanup failed', e);
        }
    }
    await signOut({ redirectTo: '/login' });
}
