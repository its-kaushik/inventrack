import type { TenantContext, AdminContext } from './context.js';

export type AppEnv = {
  Variables: {
    tenant: TenantContext;
    adminUser?: AdminContext;
    validatedBody: unknown;
  };
};
