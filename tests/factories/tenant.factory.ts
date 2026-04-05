// Tenant factory — stub for M1.
// Full implementation will be added in M3 when the tenants table is created.

import { nanoid } from 'nanoid';

export function buildTenant(overrides: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID(),
    name: `Test Store ${nanoid(6)}`,
    address: '123 Test Road',
    phone: '9876543210',
    email: `store-${nanoid(4)}@test.com`,
    gstin: null,
    gstScheme: 'composite' as const,
    currency: 'INR',
    status: 'active' as const,
    ...overrides,
  };
}
