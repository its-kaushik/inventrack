import type { TenantContext } from './context.js';

export type AppEnv = {
  Variables: {
    tenant: TenantContext;
    validatedBody: unknown;
  };
};
