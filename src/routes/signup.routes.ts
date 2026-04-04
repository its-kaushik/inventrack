import { Hono } from 'hono';
import { z } from 'zod';
import { setCookie } from 'hono/cookie';
import { SignJWT } from 'jose';
import { randomUUID, createHash } from 'crypto';
import * as tenantService from '../services/tenant.service.js';
import { db } from '../config/database.js';
import { refreshTokens } from '../db/schema/refresh-tokens.js';
import { validate } from '../middleware/validate.js';
import { success } from '../lib/response.js';
import { env } from '../config/env.js';
import type { AppEnv } from '../types/hono.js';

const signup = new Hono<AppEnv>();

const jwtSecret = new TextEncoder().encode(env.JWT_SECRET);

const signupSchema = z.object({
  storeName: z.string().min(1, 'Store name is required'),
  ownerName: z.string().min(1, 'Owner name is required'),
  phone: z.string().min(10, 'Valid phone number required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  email: z.string().email().optional(),
  address: z.string().optional(),
  gstin: z.string().max(15).optional(),
  gstScheme: z.enum(['regular', 'composition']).optional(),
});

signup.post('/', validate(signupSchema), async (c) => {
  const input = c.get('validatedBody') as z.infer<typeof signupSchema>;

  // Create tenant + owner + seed defaults
  const result = await tenantService.createTenant(input);

  // Auto-login: generate tokens for the new owner
  const accessToken = await new SignJWT({
    sub: result.owner.id,
    tid: result.owner.tenantId,
    role: result.owner.role,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${env.JWT_ACCESS_TTL}s`)
    .sign(jwtSecret);

  const rawRefreshToken = randomUUID();
  const tokenHash = createHash('sha256').update(rawRefreshToken).digest('hex');
  const expiresAt = new Date(Date.now() + env.JWT_REFRESH_TTL * 1000);

  await db.insert(refreshTokens).values({
    userId: result.owner.id,
    tokenHash,
    expiresAt,
  });

  setCookie(c, 'refreshToken', rawRefreshToken, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'Strict',
    path: '/api/v1/auth',
    maxAge: env.JWT_REFRESH_TTL,
  });

  return c.json(
    success({
      tenant: {
        id: result.tenant.id,
        name: result.tenant.name,
        gstScheme: result.tenant.gstScheme,
      },
      owner: result.owner,
      accessToken,
    }),
    201,
  );
});

export default signup;
