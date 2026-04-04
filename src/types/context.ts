import type { Context } from 'hono';

export interface TenantContext {
  tenantId: string;
  userId: string;
  role: 'owner' | 'manager' | 'salesperson';
}

export interface AdminContext {
  adminId: string;
  isSuperAdmin: true;
}

export type AppContext = Context<{
  Variables: {
    tenant: TenantContext;
    adminUser?: AdminContext;
    validatedBody?: unknown;
  };
}>;
