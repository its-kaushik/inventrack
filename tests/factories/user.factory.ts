// User factory — stub for M1.
// Full implementation will be added in M2 when the users table is created.

import { nanoid } from 'nanoid';
import type { Role } from '../../src/types/enums.js';

export function buildUser(overrides: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID(),
    tenantId: crypto.randomUUID(),
    name: `Test User ${nanoid(6)}`,
    email: `user-${nanoid(4)}@test.com`,
    phone: `98${Math.floor(10000000 + Math.random() * 90000000)}`,
    role: 'manager' as Role,
    isActive: true,
    ...overrides,
  };
}
