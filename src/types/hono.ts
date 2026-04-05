import type { AuthContext } from './context.js';

// Extend Hono's context variables to include our auth context and request ID
export type AppEnv = {
  Variables: {
    auth: AuthContext;
    requestId: string;
  };
};
