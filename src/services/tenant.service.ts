import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { db } from '../config/database.js';
import { tenants } from '../db/schema/tenants.js';
import { users } from '../db/schema/users.js';
import { categories } from '../db/schema/categories.js';
import { sizeSystems } from '../db/schema/categories.js';
import { defaultCategories, defaultSizeSystems } from '../db/seed/defaults.js';
import { DEFAULT_TENANT_SETTINGS } from '../lib/constants.js';
import { NotFoundError } from '../lib/errors.js';

interface CreateTenantInput {
  storeName: string;
  ownerName: string;
  phone: string;
  password: string;
  email?: string;
  address?: string;
  gstin?: string;
  gstScheme?: 'regular' | 'composition';
}

export async function createTenant(input: CreateTenantInput) {
  const passwordHash = await bcrypt.hash(input.password, 12);

  // Use raw SQL transaction for atomicity across multiple inserts
  const result = await db.transaction(async (tx) => {
    // 1. Create tenant
    const [tenant] = await tx
      .insert(tenants)
      .values({
        name: input.storeName,
        address: input.address,
        phone: input.phone,
        email: input.email,
        gstin: input.gstin,
        gstScheme: input.gstScheme || 'regular',
        settings: DEFAULT_TENANT_SETTINGS,
      })
      .returning();

    // 2. Create owner user
    const [owner] = await tx
      .insert(users)
      .values({
        tenantId: tenant.id,
        name: input.ownerName,
        phone: input.phone,
        email: input.email,
        passwordHash,
        role: 'owner',
      })
      .returning({
        id: users.id,
        tenantId: users.tenantId,
        name: users.name,
        phone: users.phone,
        email: users.email,
        role: users.role,
      });

    // 3. Seed default categories
    for (const cat of defaultCategories) {
      await tx.insert(categories).values({
        tenantId: tenant.id,
        name: cat.name,
        code: cat.code,
        sortOrder: cat.sortOrder,
      });
    }

    // 4. Seed default size systems
    for (const ss of defaultSizeSystems) {
      await tx.insert(sizeSystems).values({
        tenantId: tenant.id,
        name: ss.name,
        values: ss.values,
      });
    }

    return { tenant, owner };
  });

  return result;
}

export async function completeSetup(tenantId: string) {
  const [updated] = await db
    .update(tenants)
    .set({ setupComplete: true })
    .where(eq(tenants.id, tenantId))
    .returning();

  if (!updated) throw new NotFoundError('Tenant', tenantId);
  return updated;
}

export async function getSettings(tenantId: string) {
  const [tenant] = await db
    .select({
      settings: tenants.settings,
      gstScheme: tenants.gstScheme,
      setupComplete: tenants.setupComplete,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!tenant) throw new NotFoundError('Tenant', tenantId);
  return tenant;
}

export async function updateSettings(tenantId: string, patch: Record<string, unknown>) {
  const [current] = await db
    .select({ settings: tenants.settings })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!current) throw new NotFoundError('Tenant', tenantId);

  const merged = { ...(current.settings as Record<string, unknown>), ...patch };

  const [updated] = await db
    .update(tenants)
    .set({ settings: merged })
    .where(eq(tenants.id, tenantId))
    .returning();

  return updated;
}

export async function getStore(tenantId: string) {
  const [tenant] = await db
    .select({
      id: tenants.id,
      name: tenants.name,
      address: tenants.address,
      phone: tenants.phone,
      email: tenants.email,
      logoUrl: tenants.logoUrl,
      gstin: tenants.gstin,
      gstScheme: tenants.gstScheme,
      financialYearStart: tenants.financialYearStart,
      invoicePrefix: tenants.invoicePrefix,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!tenant) throw new NotFoundError('Tenant', tenantId);
  return tenant;
}

export async function updateStore(
  tenantId: string,
  patch: Partial<{
    name: string;
    address: string;
    phone: string;
    email: string;
    logoUrl: string;
    gstin: string;
    gstScheme: 'regular' | 'composition';
    financialYearStart: number;
    invoicePrefix: string;
  }>,
) {
  const [updated] = await db.update(tenants).set(patch).where(eq(tenants.id, tenantId)).returning();

  if (!updated) throw new NotFoundError('Tenant', tenantId);
  return updated;
}
