import type { ErrorHandler } from 'hono';
import { AppError } from '../types/errors.js';
import { ZodError } from 'zod';

export const errorHandler: ErrorHandler = (err, c) => {
  // Known application error
  if (err instanceof AppError) {
    return c.json(
      { error: { code: err.code, message: err.message, details: err.details } },
      err.statusCode as any,
    );
  }

  // Zod validation error
  if (err instanceof ZodError) {
    return c.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: err.issues } },
      400,
    );
  }

  // Unknown error — log full stack, return generic message
  console.error('[UNHANDLED ERROR]', err);
  return c.json(
    { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } },
    500,
  );
};
