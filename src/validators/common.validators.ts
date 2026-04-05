import { z } from 'zod';
import { CONSTANTS } from '../config/constants.js';
import { AppError } from '../types/errors.js';

// --- Reusable field schemas ---

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(CONSTANTS.PAGINATION.DEFAULT_PAGE),
  limit: z.coerce
    .number()
    .int()
    .positive()
    .max(CONSTANTS.PAGINATION.MAX_LIMIT)
    .default(CONSTANTS.PAGINATION.DEFAULT_LIMIT),
});

export const dateRangeSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  fy: z
    .string()
    .regex(/^\d{4}$/, 'Financial year must be 4 digits, e.g. 2627')
    .optional(),
});

export const sortSchema = z.object({
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export const uuidParam = z.object({
  id: z.string().uuid(),
});

export const phoneSchema = z.string().regex(/^\d{10}$/, 'Phone must be 10 digits');

export const moneySchema = z.coerce.number().nonnegative().multipleOf(0.01);

// --- Validation wrapper ---

export function validate<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new AppError('VALIDATION_ERROR', 'Invalid input', 400, result.error.issues);
  }
  return result.data;
}
