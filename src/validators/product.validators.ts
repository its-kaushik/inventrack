import { z } from 'zod';
import { moneySchema } from './common.validators.js';

export const createCategorySchema = z.object({
  name: z.string().min(1).max(255),
  parentId: z.string().uuid().optional(),
  sortOrder: z.number().int().nonnegative().default(0),
});

export const updateCategorySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  parentId: z.string().uuid().nullable().optional(),
  sortOrder: z.number().int().nonnegative().optional(),
});

export const createBrandSchema = z.object({
  name: z.string().min(1).max(255),
});

export const updateBrandSchema = z.object({
  name: z.string().min(1).max(255),
});

export const createProductSchema = z.object({
  name: z.string().min(1).max(500),
  brandId: z.string().uuid().optional(),
  newBrandName: z.string().min(1).max(255).optional(), // Create brand inline
  categoryId: z.string().uuid(),
  hsnCode: z.string().max(8).optional(),
  description: z.string().optional(),
  hasVariants: z.boolean().default(true),
  gstRate: z.number().min(0).max(100).optional(),
  productDiscountPct: z.number().min(0).max(100).default(0),
  // Simple product fields
  costPrice: moneySchema.optional(),
  mrp: moneySchema.optional(),
  initialQuantity: z.number().int().nonnegative().optional().default(0),
  lowStockThreshold: z.number().int().positive().optional(),
  // Variant product fields
  variants: z.array(z.object({
    attributes: z.record(z.string(), z.string()), // { "Color": "Blue", "Size": "40" }
    costPrice: moneySchema,
    mrp: moneySchema,
    initialQuantity: z.number().int().nonnegative().default(0),
    lowStockThreshold: z.number().int().positive().optional(),
  })).optional(),
}).refine(
  (data) => {
    if (data.hasVariants) {
      return data.variants && data.variants.length > 0;
    }
    return data.costPrice != null && data.mrp != null;
  },
  { message: 'Variant products need variants array; simple products need costPrice and mrp' },
);

export const updateProductSchema = z.object({
  name: z.string().min(1).max(500).optional(),
  brandId: z.string().uuid().nullable().optional(),
  categoryId: z.string().uuid().optional(),
  hsnCode: z.string().max(8).nullable().optional(),
  description: z.string().nullable().optional(),
  gstRate: z.number().min(0).max(100).nullable().optional(),
  productDiscountPct: z.number().min(0).max(100).optional(),
});

export const productListQuerySchema = z.object({
  search: z.string().optional(),
  categoryId: z.string().uuid().optional(),
  brandId: z.string().uuid().optional(),
  isArchived: z.string().transform(v => v === 'true').optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
});
