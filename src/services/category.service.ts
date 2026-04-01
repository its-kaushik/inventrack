import { eq, and, asc } from 'drizzle-orm';
import { db } from '../config/database.js';
import { categories, subTypes, sizeSystems, categorySizeSystems } from '../db/schema/categories.js';
import { brands } from '../db/schema/brands.js';
import { NotFoundError, DuplicateEntryError } from '../lib/errors.js';

// ======================== CATEGORIES ========================

export async function listCategories(tenantId: string) {
  return db.select().from(categories)
    .where(eq(categories.tenantId, tenantId))
    .orderBy(asc(categories.sortOrder));
}

export async function createCategory(tenantId: string, input: { name: string; code: string; sortOrder?: number }) {
  try {
    const [cat] = await db.insert(categories).values({
      tenantId,
      name: input.name,
      code: input.code.toUpperCase(),
      sortOrder: input.sortOrder ?? 0,
    }).returning();
    return cat;
  } catch (err: any) {
    if (err.code === '23505') throw new DuplicateEntryError('Category', 'code');
    throw err;
  }
}

export async function updateCategory(tenantId: string, id: string, patch: Partial<{ name: string; code: string; sortOrder: number; isActive: boolean }>) {
  if (patch.code) patch.code = patch.code.toUpperCase();
  const [updated] = await db.update(categories).set(patch)
    .where(and(eq(categories.id, id), eq(categories.tenantId, tenantId)))
    .returning();
  if (!updated) throw new NotFoundError('Category', id);
  return updated;
}

export async function deactivateCategory(tenantId: string, id: string) {
  return updateCategory(tenantId, id, { isActive: false });
}

// ======================== SUB-TYPES ========================

export async function listSubTypes(tenantId: string, categoryId: string) {
  return db.select().from(subTypes)
    .where(and(eq(subTypes.tenantId, tenantId), eq(subTypes.categoryId, categoryId)));
}

export async function createSubType(tenantId: string, input: { categoryId: string; name: string; code: string }) {
  const [st] = await db.insert(subTypes).values({
    tenantId,
    categoryId: input.categoryId,
    name: input.name,
    code: input.code.toUpperCase(),
  }).returning();
  return st;
}

export async function updateSubType(tenantId: string, id: string, patch: Partial<{ name: string; code: string }>) {
  if (patch.code) patch.code = patch.code.toUpperCase();
  const [updated] = await db.update(subTypes).set(patch)
    .where(and(eq(subTypes.id, id), eq(subTypes.tenantId, tenantId)))
    .returning();
  if (!updated) throw new NotFoundError('SubType', id);
  return updated;
}

// ======================== SIZE SYSTEMS ========================

export async function listSizeSystems(tenantId: string) {
  return db.select().from(sizeSystems)
    .where(eq(sizeSystems.tenantId, tenantId));
}

export async function createSizeSystem(tenantId: string, input: { name: string; values: string[] }) {
  const [ss] = await db.insert(sizeSystems).values({
    tenantId,
    name: input.name,
    values: input.values,
  }).returning();
  return ss;
}

export async function updateSizeSystem(tenantId: string, id: string, patch: Partial<{ name: string; values: string[] }>) {
  const [updated] = await db.update(sizeSystems).set(patch)
    .where(and(eq(sizeSystems.id, id), eq(sizeSystems.tenantId, tenantId)))
    .returning();
  if (!updated) throw new NotFoundError('SizeSystem', id);
  return updated;
}

// ======================== BRANDS ========================

export async function listBrands(tenantId: string) {
  return db.select().from(brands)
    .where(eq(brands.tenantId, tenantId))
    .orderBy(asc(brands.name));
}

export async function createBrand(tenantId: string, input: { name: string; code: string }) {
  try {
    const [brand] = await db.insert(brands).values({
      tenantId,
      name: input.name,
      code: input.code.toUpperCase(),
    }).returning();
    return brand;
  } catch (err: any) {
    if (err.code === '23505') throw new DuplicateEntryError('Brand', 'code');
    throw err;
  }
}

export async function updateBrand(tenantId: string, id: string, patch: Partial<{ name: string; code: string }>) {
  if (patch.code) patch.code = patch.code.toUpperCase();
  const [updated] = await db.update(brands).set(patch)
    .where(and(eq(brands.id, id), eq(brands.tenantId, tenantId)))
    .returning();
  if (!updated) throw new NotFoundError('Brand', id);
  return updated;
}
