import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { tenants } from '../db/schema/tenants.js';
import { tenantSettings } from '../db/schema/tenants.js';
import { AppError } from '../types/errors.js';
import { AuditRepository } from '../repositories/audit.repository.js';
import type { GstScheme } from '../types/enums.js';

const auditRepo = new AuditRepository(db);

export async function getSettings(tenantId: string) {
  const [settings] = await db
    .select()
    .from(tenantSettings)
    .where(eq(tenantSettings.tenantId, tenantId));

  if (!settings) throw new AppError('NOT_FOUND', 'Settings not found', 404);
  return settings;
}

export async function updateSettings(
  tenantId: string,
  userId: string,
  data: {
    defaultBillDiscountPct?: string;
    maxDiscountPct?: string;
    returnWindowDays?: number;
    shelfAgingThresholdDays?: number;
    billNumberPrefix?: string;
    receiptFooterMessage?: string;
    receiptShowReturnPolicy?: boolean;
    voidWindowHours?: number;
  },
) {
  const [updated] = await db
    .update(tenantSettings)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(tenantSettings.tenantId, tenantId))
    .returning();

  if (!updated) throw new AppError('NOT_FOUND', 'Settings not found', 404);

  await auditRepo.log({
    tenantId,
    userId,
    action: 'settings_updated',
    entityType: 'tenant_settings',
    entityId: updated.id,
    newValue: data,
  });

  return updated;
}

export async function getGstSettings(tenantId: string) {
  const [tenant] = await db
    .select({
      gstScheme: tenants.gstScheme,
      gstin: tenants.gstin,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId));

  if (!tenant) throw new AppError('NOT_FOUND', 'Tenant not found', 404);
  return tenant;
}

export async function updateGstSettings(
  tenantId: string,
  userId: string,
  data: { gstScheme?: GstScheme; gstin?: string },
) {
  const [updated] = await db
    .update(tenants)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(tenants.id, tenantId))
    .returning({ id: tenants.id, gstScheme: tenants.gstScheme, gstin: tenants.gstin });

  if (!updated) throw new AppError('NOT_FOUND', 'Tenant not found', 404);

  await auditRepo.log({
    tenantId,
    userId,
    action: 'gst_settings_updated',
    entityType: 'tenant',
    entityId: tenantId,
    newValue: data,
  });

  return updated;
}
