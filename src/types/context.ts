import type { Role } from './enums.js';

export interface AuthContext {
  userId: string;
  tenantId: string | null; // null for super_admin
  role: Role;
}
