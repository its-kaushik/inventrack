import { z } from 'zod';
import { moneySchema } from './common.validators.js';

export const createSaleSchema = z.object({
  customerId: z.string().uuid(),
  items: z
    .array(
      z.object({
        variantId: z.string().uuid(),
        quantity: z.number().int().positive(),
      }),
    )
    .min(1, 'Cart must have at least one item'),
  billDiscountPct: z.number().min(0).max(100).default(0),
  bargainAdjustment: z.number().min(0).optional(),
  finalPrice: z.number().positive().optional(),
  payments: z
    .array(
      z.object({
        method: z.enum(['cash', 'upi', 'card', 'credit']),
        amount: moneySchema,
      }),
    )
    .min(1, 'At least one payment method is required'),
  approvalToken: z.string().optional(),
  clientId: z.string().uuid().optional(),
});

export const voidSaleSchema = z.object({
  reason: z.string().min(1, 'Reason is required').max(500),
  approvalToken: z.string().min(1, 'Owner approval token is required'),
});

export const parkBillSchema = z.object({
  customerId: z.string().uuid().optional(),
  cartData: z.record(z.string(), z.unknown()),
});

export const saleListQuerySchema = z.object({
  customerId: z.string().uuid().optional(),
  status: z.enum(['completed', 'cancelled', 'returned', 'partially_returned']).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
});
