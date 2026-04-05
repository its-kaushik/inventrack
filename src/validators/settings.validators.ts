import { z } from 'zod';

export const createTenantSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  address: z.string().optional(),
  phone: z.string().max(15).optional(),
  email: z.string().email().optional(),
  gstin: z.string().max(15).optional(),
  gstScheme: z.enum(['composite', 'regular']).default('composite'),
});

export const updateTenantSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  address: z.string().optional(),
  phone: z.string().max(15).optional(),
  email: z.string().email().optional(),
  gstin: z.string().max(15).optional(),
  logoUrl: z.string().url().optional(),
});

export const updateSettingsSchema = z.object({
  defaultBillDiscountPct: z.coerce.number().min(0).max(100).optional(),
  maxDiscountPct: z.coerce.number().min(0).max(100).optional(),
  returnWindowDays: z.coerce.number().int().positive().optional(),
  shelfAgingThresholdDays: z.coerce.number().int().positive().optional(),
  billNumberPrefix: z.string().min(1).max(10).optional(),
  receiptFooterMessage: z.string().max(500).optional(),
  receiptShowReturnPolicy: z.boolean().optional(),
  voidWindowHours: z.coerce.number().int().positive().optional(),
});

export const updateGstSchema = z.object({
  gstScheme: z.enum(['composite', 'regular']).optional(),
  gstin: z.string().max(15).optional(),
});
