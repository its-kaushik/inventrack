import { z } from 'zod';
import { moneySchema } from './common.validators.js';

export const createGoodsReceiptSchema = z.object({
  supplierId: z.string().uuid(),
  supplierInvoiceNo: z.string().max(100).optional(),
  supplierInvoiceDate: z.string().optional(), // ISO date string
  supplierInvoiceUrl: z.string().url().optional(),
  paymentMode: z.enum(['paid', 'credit', 'partial']),
  amountPaid: moneySchema.default(0),
  items: z.array(z.object({
    variantId: z.string().uuid(),
    quantity: z.number().int().positive('Quantity must be positive'),
    costPrice: moneySchema,
    cgstAmount: moneySchema.default(0),
    sgstAmount: moneySchema.default(0),
    igstAmount: moneySchema.default(0),
  })).min(1, 'At least one item is required'),
});
