import type { Context } from 'hono';

export interface TenantContext {
  tenantId: string;
  userId: string;
  role: 'owner' | 'manager' | 'salesperson';
}

export type AppContext = Context<{
  Variables: {
    tenant: TenantContext;
    validatedBody?: unknown;
  };
}>;
