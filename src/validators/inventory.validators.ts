import { z } from 'zod';

export const adjustStockSchema = z.object({
  variantId: z.string().uuid(),
  quantityChange: z.number().int().refine((v) => v !== 0, 'Quantity change cannot be zero'),
  reason: z.enum(['damage', 'theft', 'count_correction', 'expired', 'other']),
  notes: z.string().min(1, 'Notes are required for stock adjustments'),
});

export const stockCountSchema = z.object({
  counts: z.array(z.object({
    variantId: z.string().uuid(),
    actualCount: z.number().int().nonnegative(),
  })).min(1, 'At least one item must be counted'),
  autoAdjust: z.boolean().default(false),
});

export const movementHistoryQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
});

export const inventoryQuerySchema = z.object({
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
});
