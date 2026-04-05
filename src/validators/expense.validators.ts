import { z } from 'zod';
import { moneySchema } from './common.validators.js';

export const createExpenseSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  amount: moneySchema.refine((v) => v > 0, 'Amount must be positive'),
  categoryId: z.string().uuid().optional(),
  paymentMode: z.enum(['cash', 'upi', 'bank_transfer']),
  notes: z.string().optional(),
  receiptUrl: z.string().url().optional(),
});

export const updateExpenseSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  amount: moneySchema.optional(),
  categoryId: z.string().uuid().nullable().optional(),
  paymentMode: z.enum(['cash', 'upi', 'bank_transfer']).optional(),
  notes: z.string().nullable().optional(),
  receiptUrl: z.string().url().nullable().optional(),
});

export const expenseListQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
});

export const createCategorySchema = z.object({
  name: z.string().min(1).max(100),
});

export const openRegisterSchema = z.object({
  openingBalance: moneySchema,
});

export const closeRegisterSchema = z.object({
  actualClosing: moneySchema,
});
