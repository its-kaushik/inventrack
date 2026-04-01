import type { Context, Next } from 'hono';
import { z } from 'zod';
import { ValidationError } from '../lib/errors.js';

export function validate<T extends z.ZodSchema>(schema: T) {
  return async (c: Context, next: Next) => {
    try {
      const body = await c.req.json();
      const result = schema.safeParse(body);
      if (!result.success) {
        const issues = result.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        }));
        throw new ValidationError('Validation failed', issues);
      }
      c.set('validatedBody', result.data);
    } catch (err) {
      if (err instanceof ValidationError) throw err;
      throw new ValidationError('Invalid JSON body');
    }
    await next();
  };
}
