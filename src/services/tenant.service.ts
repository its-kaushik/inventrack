import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { tenants, tenantSettings } from '../db/schema/tenants.js';
import { AppError } from '../types/errors.js';
import { AuditRepository } from '../repositories/audit.repository.js';
import type { GstScheme, TenantStatus } from '../types/enums.js';

const auditRepo = new AuditRepository(db);

export async function createTenant(data: {
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  gstin?: string;
  gstScheme?: GstScheme;
}) {
  return db.transaction(async (tx) => {
    // Create tenant
    const [tenant] = await tx
      .insert(tenants)
      .values({
        name: data.name,
        address: data.address ?? null,
        phone: data.phone ?? null,
        email: data.email ?? null,
        gstin: data.gstin ?? null,
        gstScheme: data.gstScheme ?? 'composite',
      })
      .returning();

    // Auto-create tenant settings with defaults
    const [settings] = await tx
      .insert(tenantSettings)
      .values({ tenantId: tenant.id })
      .returning();

    await auditRepo.withTransaction(tx).log({
      tenantId: tenant.id,
      action: 'tenant_created',
      entityType: 'tenant',
      entityId: tenant.id,
      newValue: { name: data.name },
    });

    return { ...tenant, settings };
  });
}

export async function listTenants() {
  return db.select().from(tenants);
}

export async function getTenantById(tenantId: string) {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
  if (!tenant) throw new AppError('NOT_FOUND', 'Tenant not found', 404);

  const [settings] = await db
    .select()
    .from(tenantSettings)
    .where(eq(tenantSettings.tenantId, tenantId));

  return { ...tenant, settings };
}

export async function updateTenant(
  tenantId: string,
  data: {
    name?: string;
    address?: string;
    phone?: string;
    email?: string;
    gstin?: string;
    logoUrl?: string;
  },
) {
  const [updated] = await db
    .update(tenants)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(tenants.id, tenantId))
    .returning();

  if (!updated) throw new AppError('NOT_FOUND', 'Tenant not found', 404);

  await auditRepo.log({
    tenantId,
    action: 'tenant_updated',
    entityType: 'tenant',
    entityId: tenantId,
    newValue: data,
  });

  return updated;
}

export async function updateTenantStatus(tenantId: string, status: TenantStatus) {
  const [updated] = await db
    .update(tenants)
    .set({ status, updatedAt: new Date() })
    .where(eq(tenants.id, tenantId))
    .returning();

  if (!updated) throw new AppError('NOT_FOUND', 'Tenant not found', 404);

  await auditRepo.log({
    tenantId,
    action: `tenant_${status}`,
    entityType: 'tenant',
    entityId: tenantId,
  });

  return updated;
}

export async function deleteTenant(tenantId: string) {
  return updateTenantStatus(tenantId, 'deleted');
}
