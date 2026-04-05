import { eq, and, or, ilike, isNull, desc, asc, count, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  categories,
  brands,
  attributeTypes,
  attributeValues,
  products,
  productVariants,
  variantAttributeValues,
  inventoryMovements,
  productImages,
} from '../db/schema/products.js';
import { AppError } from '../types/errors.js';
import { AuditRepository } from '../repositories/audit.repository.js';
import { nanoid } from 'nanoid';

const auditRepo = new AuditRepository(db);

// ──────────────── Categories ────────────────

export async function listCategories(tenantId: string) {
  return db
    .select()
    .from(categories)
    .where(eq(categories.tenantId, tenantId))
    .orderBy(asc(categories.sortOrder), asc(categories.name));
}

export async function createCategory(
  tenantId: string,
  data: { name: string; parentId?: string; sortOrder?: number },
) {
  const [cat] = await db
    .insert(categories)
    .values({
      tenantId,
      name: data.name,
      parentId: data.parentId ?? null,
      sortOrder: data.sortOrder ?? 0,
    })
    .returning();
  return cat;
}

export async function updateCategory(
  tenantId: string,
  id: string,
  data: { name?: string; parentId?: string | null; sortOrder?: number },
) {
  const [updated] = await db
    .update(categories)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(categories.id, id), eq(categories.tenantId, tenantId)))
    .returning();
  if (!updated) throw new AppError('NOT_FOUND', 'Category not found', 404);
  return updated;
}

export async function deleteCategory(tenantId: string, id: string) {
  // Check if any products use this category
  const [linked] = await db
    .select({ count: count() })
    .from(products)
    .where(and(eq(products.categoryId, id), eq(products.tenantId, tenantId), isNull(products.deletedAt)));

  if (linked && linked.count > 0) {
    throw new AppError('CONFLICT', 'Cannot delete category with linked products', 409);
  }

  const [deleted] = await db
    .delete(categories)
    .where(and(eq(categories.id, id), eq(categories.tenantId, tenantId)))
    .returning({ id: categories.id });
  if (!deleted) throw new AppError('NOT_FOUND', 'Category not found', 404);
}

// ──────────────── Brands ────────────────

export async function listBrands(tenantId: string) {
  return db
    .select()
    .from(brands)
    .where(eq(brands.tenantId, tenantId))
    .orderBy(asc(brands.name));
}

export async function createBrand(tenantId: string, name: string) {
  const [brand] = await db
    .insert(brands)
    .values({ tenantId, name })
    .returning();
  return brand;
}

export async function updateBrand(tenantId: string, id: string, name: string) {
  const [updated] = await db
    .update(brands)
    .set({ name, updatedAt: new Date() })
    .where(and(eq(brands.id, id), eq(brands.tenantId, tenantId)))
    .returning();
  if (!updated) throw new AppError('NOT_FOUND', 'Brand not found', 404);
  return updated;
}

export async function deleteBrand(tenantId: string, id: string) {
  const [linked] = await db
    .select({ count: count() })
    .from(products)
    .where(and(eq(products.brandId, id), eq(products.tenantId, tenantId), isNull(products.deletedAt)));

  if (linked && linked.count > 0) {
    throw new AppError('CONFLICT', 'Cannot delete brand with linked products', 409);
  }

  const [deleted] = await db
    .delete(brands)
    .where(and(eq(brands.id, id), eq(brands.tenantId, tenantId)))
    .returning({ id: brands.id });
  if (!deleted) throw new AppError('NOT_FOUND', 'Brand not found', 404);
}

// ──────────────── Attribute Helpers ────────────────

async function ensureAttributeType(
  tx: typeof db,
  tenantId: string,
  name: string,
): Promise<string> {
  const [existing] = await tx
    .select({ id: attributeTypes.id })
    .from(attributeTypes)
    .where(and(eq(attributeTypes.tenantId, tenantId), eq(attributeTypes.name, name)));

  if (existing) return existing.id;

  const [created] = await tx
    .insert(attributeTypes)
    .values({ tenantId, name, isStandard: false })
    .returning({ id: attributeTypes.id });
  return created.id;
}

async function ensureAttributeValue(
  tx: typeof db,
  tenantId: string,
  typeId: string,
  value: string,
): Promise<string> {
  const [existing] = await tx
    .select({ id: attributeValues.id })
    .from(attributeValues)
    .where(
      and(
        eq(attributeValues.tenantId, tenantId),
        eq(attributeValues.attributeTypeId, typeId),
        eq(attributeValues.value, value),
      ),
    );

  if (existing) return existing.id;

  const [created] = await tx
    .insert(attributeValues)
    .values({ tenantId, attributeTypeId: typeId, value })
    .returning({ id: attributeValues.id });
  return created.id;
}

// ──────────────── SKU Generation ────────────────

function generateSkuCode(str: string, maxLen: number = 4): string {
  return str
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, maxLen);
}

function generateSku(
  categoryName: string,
  brandName: string | undefined,
  attrs: Record<string, string>,
): string {
  const catCode = generateSkuCode(categoryName, 5);
  const brandCode = brandName ? generateSkuCode(brandName, 3) : 'GEN';
  const attrParts = Object.values(attrs)
    .map((v) => generateSkuCode(v, 3))
    .join('-');
  const seq = nanoid(4).toUpperCase();
  return attrParts
    ? `${catCode}-${brandCode}-${attrParts}-${seq}`
    : `${catCode}-${brandCode}-${seq}`;
}

// ──────────────── Products ────────────────

export async function createProduct(
  tenantId: string,
  userId: string,
  data: {
    name: string;
    brandId?: string;
    newBrandName?: string;
    categoryId: string;
    hsnCode?: string;
    description?: string;
    hasVariants: boolean;
    gstRate?: number;
    productDiscountPct?: number;
    costPrice?: number;
    mrp?: number;
    initialQuantity?: number;
    lowStockThreshold?: number;
    variants?: Array<{
      attributes: Record<string, string>;
      costPrice: number;
      mrp: number;
      initialQuantity: number;
      lowStockThreshold?: number;
    }>;
  },
) {
  return db.transaction(async (tx) => {
    // Resolve brand (create inline if needed)
    let brandId = data.brandId ?? null;
    let brandName: string | undefined;
    if (data.newBrandName && !brandId) {
      const [newBrand] = await tx
        .insert(brands)
        .values({ tenantId, name: data.newBrandName })
        .onConflictDoNothing()
        .returning();
      if (newBrand) {
        brandId = newBrand.id;
        brandName = newBrand.name;
      } else {
        const [existing] = await tx
          .select()
          .from(brands)
          .where(and(eq(brands.tenantId, tenantId), eq(brands.name, data.newBrandName)));
        brandId = existing!.id;
        brandName = existing!.name;
      }
    } else if (brandId) {
      const [b] = await tx.select({ name: brands.name }).from(brands).where(eq(brands.id, brandId));
      brandName = b?.name;
    }

    // Fetch category name for SKU
    const [cat] = await tx
      .select({ name: categories.name })
      .from(categories)
      .where(and(eq(categories.id, data.categoryId), eq(categories.tenantId, tenantId)));
    if (!cat) throw new AppError('NOT_FOUND', 'Category not found', 404);

    // Create product
    const [product] = await tx
      .insert(products)
      .values({
        tenantId,
        name: data.name,
        brandId,
        categoryId: data.categoryId,
        hsnCode: data.hsnCode ?? null,
        description: data.description ?? null,
        hasVariants: data.hasVariants,
        defaultCostPrice: data.costPrice != null ? String(data.costPrice) : null,
        defaultMrp: data.mrp != null ? String(data.mrp) : null,
        gstRate: data.gstRate != null ? String(data.gstRate) : null,
        productDiscountPct: String(data.productDiscountPct ?? 0),
      })
      .returning();

    const createdVariants: Array<typeof productVariants.$inferSelect> = [];

    if (data.hasVariants && data.variants) {
      // Variant product
      for (const v of data.variants) {
        const sku = generateSku(cat.name, brandName, v.attributes);
        const barcode = sku; // Code-128 uses the SKU as the barcode value

        const [variant] = await tx
          .insert(productVariants)
          .values({
            tenantId,
            productId: product.id,
            sku,
            barcode,
            costPrice: String(v.costPrice),
            weightedAvgCost: String(v.costPrice), // Initial WAC = cost price
            mrp: String(v.mrp),
            availableQuantity: v.initialQuantity,
            lowStockThreshold: v.lowStockThreshold ?? null,
          })
          .returning();

        // Link attributes
        for (const [attrName, attrValue] of Object.entries(v.attributes)) {
          const typeId = await ensureAttributeType(tx as any, tenantId, attrName);
          const valueId = await ensureAttributeValue(tx as any, tenantId, typeId, attrValue);
          await tx.insert(variantAttributeValues).values({
            variantId: variant.id,
            attributeValueId: valueId,
          });
        }

        // Create inventory movement for initial stock
        if (v.initialQuantity > 0) {
          await tx.insert(inventoryMovements).values({
            tenantId,
            variantId: variant.id,
            movementType: 'opening_balance',
            quantity: v.initialQuantity,
            costPriceAtMovement: String(v.costPrice),
            balanceAfter: v.initialQuantity,
            notes: 'Initial stock on product creation',
            createdBy: userId,
          });
        }

        createdVariants.push(variant);
      }
    } else {
      // Simple product — single default variant
      const sku = generateSku(cat.name, brandName, {});
      const barcode = sku;

      const [variant] = await tx
        .insert(productVariants)
        .values({
          tenantId,
          productId: product.id,
          sku,
          barcode,
          costPrice: String(data.costPrice!),
          weightedAvgCost: String(data.costPrice!),
          mrp: String(data.mrp!),
          availableQuantity: data.initialQuantity ?? 0,
          lowStockThreshold: data.lowStockThreshold ?? null,
        })
        .returning();

      if (data.initialQuantity && data.initialQuantity > 0) {
        await tx.insert(inventoryMovements).values({
          tenantId,
          variantId: variant.id,
          movementType: 'opening_balance',
          quantity: data.initialQuantity,
          costPriceAtMovement: String(data.costPrice!),
          balanceAfter: data.initialQuantity,
          notes: 'Initial stock on product creation',
          createdBy: userId,
        });
      }

      createdVariants.push(variant);
    }

    await auditRepo.withTransaction(tx).log({
      tenantId,
      userId,
      action: 'product_created',
      entityType: 'product',
      entityId: product.id,
      newValue: { name: data.name, variantCount: createdVariants.length },
    });

    return { ...product, variants: createdVariants };
  });
}

export async function listProducts(
  tenantId: string,
  opts: {
    search?: string;
    categoryId?: string;
    brandId?: string;
    isArchived?: boolean;
    page: number;
    limit: number;
    sort?: string;
    order?: 'asc' | 'desc';
  },
) {
  const conditions = [eq(products.tenantId, tenantId), isNull(products.deletedAt)];

  if (opts.search) {
    conditions.push(
      or(
        ilike(products.name, `%${opts.search}%`),
        sql`EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = products.id AND (pv.sku ILIKE ${`%${opts.search}%`} OR pv.barcode ILIKE ${`%${opts.search}%`}))`,
      )!,
    );
  }
  if (opts.categoryId) conditions.push(eq(products.categoryId, opts.categoryId));
  if (opts.brandId) conditions.push(eq(products.brandId, opts.brandId));
  if (opts.isArchived !== undefined) conditions.push(eq(products.isArchived, opts.isArchived));

  const where = and(...conditions);
  const offset = (opts.page - 1) * opts.limit;

  const orderCol = opts.order === 'asc' ? asc(products.createdAt) : desc(products.createdAt);

  const [data, totalResult] = await Promise.all([
    db.select().from(products).where(where).orderBy(orderCol).limit(opts.limit).offset(offset),
    db.select({ total: count() }).from(products).where(where),
  ]);

  return {
    data,
    total: totalResult[0]?.total ?? 0,
    page: opts.page,
    limit: opts.limit,
  };
}

export async function getProductById(tenantId: string, productId: string) {
  const [product] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, productId), eq(products.tenantId, tenantId), isNull(products.deletedAt)));

  if (!product) throw new AppError('NOT_FOUND', 'Product not found', 404);

  const variants = await db
    .select()
    .from(productVariants)
    .where(and(eq(productVariants.productId, productId), eq(productVariants.tenantId, tenantId)));

  // Get attribute values for each variant
  const variantsWithAttrs = await Promise.all(
    variants.map(async (v) => {
      const attrs = await db
        .select({
          typeName: attributeTypes.name,
          value: attributeValues.value,
        })
        .from(variantAttributeValues)
        .innerJoin(attributeValues, eq(variantAttributeValues.attributeValueId, attributeValues.id))
        .innerJoin(attributeTypes, eq(attributeValues.attributeTypeId, attributeTypes.id))
        .where(eq(variantAttributeValues.variantId, v.id));

      return { ...v, attributes: Object.fromEntries(attrs.map((a) => [a.typeName, a.value])) };
    }),
  );

  const images = await db
    .select()
    .from(productImages)
    .where(and(eq(productImages.productId, productId), eq(productImages.tenantId, tenantId)))
    .orderBy(asc(productImages.sortOrder));

  return { ...product, variants: variantsWithAttrs, images };
}

export async function updateProduct(
  tenantId: string,
  productId: string,
  data: {
    name?: string;
    brandId?: string | null;
    categoryId?: string;
    hsnCode?: string | null;
    description?: string | null;
    gstRate?: number | null;
    productDiscountPct?: number;
  },
) {
  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (data.name !== undefined) values.name = data.name;
  if (data.brandId !== undefined) values.brandId = data.brandId;
  if (data.categoryId !== undefined) values.categoryId = data.categoryId;
  if (data.hsnCode !== undefined) values.hsnCode = data.hsnCode;
  if (data.description !== undefined) values.description = data.description;
  if (data.gstRate !== undefined) values.gstRate = data.gstRate != null ? String(data.gstRate) : null;
  if (data.productDiscountPct !== undefined)
    values.productDiscountPct = String(data.productDiscountPct);

  const [updated] = await db
    .update(products)
    .set(values)
    .where(and(eq(products.id, productId), eq(products.tenantId, tenantId), isNull(products.deletedAt)))
    .returning();

  if (!updated) throw new AppError('NOT_FOUND', 'Product not found', 404);
  return updated;
}

export async function archiveProduct(tenantId: string, productId: string) {
  const [updated] = await db
    .update(products)
    .set({ isArchived: true, updatedAt: new Date() })
    .where(and(eq(products.id, productId), eq(products.tenantId, tenantId), isNull(products.deletedAt)))
    .returning({ id: products.id });
  if (!updated) throw new AppError('NOT_FOUND', 'Product not found', 404);
}

export async function unarchiveProduct(tenantId: string, productId: string) {
  const [updated] = await db
    .update(products)
    .set({ isArchived: false, updatedAt: new Date() })
    .where(and(eq(products.id, productId), eq(products.tenantId, tenantId), isNull(products.deletedAt)))
    .returning({ id: products.id });
  if (!updated) throw new AppError('NOT_FOUND', 'Product not found', 404);
}

// ──────────────── HSN Codes ────────────────

import { hsnCodes } from '../db/schema/hsn-codes.js';

export async function searchHsnCodes(search: string) {
  return db
    .select()
    .from(hsnCodes)
    .where(or(ilike(hsnCodes.code, `${search}%`), ilike(hsnCodes.description, `%${search}%`)))
    .limit(20);
}

// ──────────────── Variant by Barcode (POS speed) ────────────────

export async function findVariantByBarcode(tenantId: string, barcode: string) {
  const [variant] = await db
    .select()
    .from(productVariants)
    .where(
      and(
        eq(productVariants.tenantId, tenantId),
        eq(productVariants.barcode, barcode),
        eq(productVariants.isActive, true),
      ),
    );
  return variant ?? null;
}
