import { z } from 'zod';
import { moneySchema } from './common.validators.js';

export const createSupplierSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  contactPerson: z.string().max(255).optional(),
  phone: z.string().max(15).optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
  gstin: z.string().max(15).optional(),
  pan: z.string().max(10).optional(),
  bankDetails: z.object({
    accountNo: z.string().optional(),
    ifsc: z.string().optional(),
    bankName: z.string().optional(),
  }).optional(),
  paymentTerms: z.enum(['cod', 'net_15', 'net_30', 'net_60', 'advance']).default('cod'),
});

export const updateSupplierSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  contactPerson: z.string().max(255).nullable().optional(),
  phone: z.string().max(15).nullable().optional(),
  email: z.string().email().nullable().optional(),
  address: z.string().nullable().optional(),
  gstin: z.string().max(15).nullable().optional(),
  pan: z.string().max(10).nullable().optional(),
  bankDetails: z.object({
    accountNo: z.string().optional(),
    ifsc: z.string().optional(),
    bankName: z.string().optional(),
  }).nullable().optional(),
  paymentTerms: z.enum(['cod', 'net_15', 'net_30', 'net_60', 'advance']).optional(),
  isActive: z.boolean().optional(),
});

export const recordSupplierPaymentSchema = z.object({
  amount: moneySchema.refine((v) => v > 0, 'Amount must be positive'),
  paymentMode: z.enum(['cash', 'upi', 'bank_transfer', 'cheque']),
  notes: z.string().optional(),
});

export const supplierListQuerySchema = z.object({
  search: z.string().optional(),
  isActive: z.string().transform(v => v === 'true').optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
});
