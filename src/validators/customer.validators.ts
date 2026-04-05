import { z } from 'zod';
import { phoneSchema, moneySchema } from './common.validators.js';

export const createCustomerSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  phone: phoneSchema,
  email: z.string().email().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
  gstin: z.string().max(15).optional(),
  clientId: z.string().uuid().optional(), // For offline sync idempotency
});

export const updateCustomerSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  phone: phoneSchema.optional(),
  email: z.string().email().nullable().optional(),
  address: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  gstin: z.string().max(15).nullable().optional(),
});

export const recordCustomerPaymentSchema = z.object({
  amount: moneySchema.refine((v) => v > 0, 'Amount must be positive'),
  paymentMode: z.enum(['cash', 'upi', 'bank_transfer', 'cheque']),
  notes: z.string().optional(),
});

export const customerListQuerySchema = z.object({
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
});
