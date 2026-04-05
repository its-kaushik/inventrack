import { Hono } from 'hono';
import { z } from 'zod';
import { validate } from '../validators/common.validators.js';
import { db } from '../db/client.js';
import { productVariants, products } from '../db/schema/products.js';
import { tenants } from '../db/schema/tenants.js';
import { eq, and, inArray } from 'drizzle-orm';
import { generateLabelsPDF, LABEL_TEMPLATES, type LabelItem } from '../lib/pdf-generator.js';
import { AppError } from '../types/errors.js';
import type { AppEnv } from '../types/hono.js';

export const labelRoutes = new Hono<AppEnv>();

const generateLabelsSchema = z.object({
  items: z.array(z.object({
    variantId: z.string().uuid(),
    quantity: z.number().int().positive().default(1),
  })).min(1, 'At least one item is required'),
  templateId: z.string().default('50x25mm'),
});

// POST /labels/generate — generate label PDF
labelRoutes.post('/generate', async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);

  const body = validate(generateLabelsSchema, await c.req.json());

  // Fetch tenant name for store name on labels
  const [tenant] = await db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, auth.tenantId));
  const storeName = tenant?.name ?? 'Store';

  // Fetch variant + product data for each item
  const variantIds = body.items.map((i) => i.variantId);
  const variantData = await db
    .select({
      id: productVariants.id,
      sku: productVariants.sku,
      barcode: productVariants.barcode,
      mrp: productVariants.mrp,
      productName: products.name,
    })
    .from(productVariants)
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(and(eq(productVariants.tenantId, auth.tenantId), inArray(productVariants.id, variantIds)));

  // Build variant attribute descriptions (size, color)
  const { attributeTypes, attributeValues, variantAttributeValues } = await import('../db/schema/products.js');
  const variantAttrsMap = new Map<string, { size?: string; color?: string }>();

  for (const v of variantData) {
    const attrs = await db
      .select({ typeName: attributeTypes.name, value: attributeValues.value })
      .from(variantAttributeValues)
      .innerJoin(attributeValues, eq(variantAttributeValues.attributeValueId, attributeValues.id))
      .innerJoin(attributeTypes, eq(attributeValues.attributeTypeId, attributeTypes.id))
      .where(eq(variantAttributeValues.variantId, v.id));

    const attrMap: Record<string, string> = {};
    for (const a of attrs) attrMap[a.typeName] = a.value;
    variantAttrsMap.set(v.id, { size: attrMap['Size'], color: attrMap['Color'] });
  }

  // Build label items
  const labelItems: LabelItem[] = [];
  for (const item of body.items) {
    const variant = variantData.find((v) => v.id === item.variantId);
    if (!variant) continue;

    const attrs = variantAttrsMap.get(variant.id);
    labelItems.push({
      storeName,
      productName: variant.productName,
      size: attrs?.size,
      color: attrs?.color,
      mrp: Number(variant.mrp),
      barcode: variant.barcode,
      quantity: item.quantity,
    });
  }

  if (labelItems.length === 0) {
    throw new AppError('NOT_FOUND', 'No valid variants found for the provided IDs', 404);
  }

  // Generate PDF
  const pdfBuffer = await generateLabelsPDF(labelItems, body.templateId);

  // Return as PDF
  return new Response(new Uint8Array(pdfBuffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="labels-${Date.now()}.pdf"`,
      'Content-Length': String(pdfBuffer.length),
    },
  });
});

// GET /labels/templates — available label sizes
labelRoutes.get('/templates', async (c) => {
  return c.json({
    data: LABEL_TEMPLATES.map((t) => ({
      id: t.id,
      name: t.name,
      widthMm: t.widthMm,
      heightMm: t.heightMm,
    })),
  });
});
