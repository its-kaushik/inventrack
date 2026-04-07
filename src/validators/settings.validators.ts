import { z } from 'zod';

export const createTenantSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  ownerName: z.string().min(1, 'Owner name is required'),
  ownerEmail: z.string().email('Invalid owner email'),
  ownerPhone: z.string().min(10).max(15),
  address: z.string().nullable().optional(),
  phone: z.string().max(15).nullable().optional(),
  email: z.string().email().nullable().optional(),
  gstin: z.string().max(15).nullable().optional(),
  gstScheme: z.enum(['composite', 'regular']).default('composite'),
});

export const updateTenantSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  address: z.string().nullable().optional(),
  phone: z.string().max(15).nullable().optional(),
  email: z.string().email().nullable().optional(),
  gstin: z.string().max(15).nullable().optional(),
  logoUrl: z.string().url().nullable().optional(),
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
