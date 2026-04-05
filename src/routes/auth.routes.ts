import { Hono } from 'hono';
import { validate } from '../validators/common.validators.js';
import {
  loginSchema,
  refreshSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  setPinSchema,
  verifyPinSchema,
} from '../validators/auth.validators.js';
import * as authService from '../services/auth.service.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { authorize } from '../middleware/rbac.js';
import { CONSTANTS } from '../config/constants.js';
import type { AppEnv } from '../types/hono.js';

export const authRoutes = new Hono<AppEnv>();

// POST /auth/login — rate-limited
authRoutes.post('/login', rateLimit(CONSTANTS.AUTH.RATE_LIMIT_LOGIN), async (c) => {
  const body = validate(loginSchema, await c.req.json());
  const result = await authService.login(body.emailOrPhone, body.password);

  const { passwordHash, ownerPinHash, ...safeUser } = result.user;
  return c.json({
    data: {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: safeUser,
    },
  });
});

// POST /auth/refresh
authRoutes.post('/refresh', async (c) => {
  const body = validate(refreshSchema, await c.req.json());
  const result = await authService.refresh(body.refreshToken);
  return c.json({ data: result });
});

// POST /auth/logout
authRoutes.post('/logout', async (c) => {
  const body = validate(refreshSchema, await c.req.json());
  await authService.logout(body.refreshToken);
  return c.json({ data: { message: 'Logged out successfully' } });
});

// POST /auth/forgot-password
authRoutes.post('/forgot-password', async (c) => {
  const body = validate(forgotPasswordSchema, await c.req.json());
  const result = await authService.forgotPassword(body.emailOrPhone);
  return c.json({ data: result });
});

// POST /auth/reset-password
authRoutes.post('/reset-password', async (c) => {
  const body = validate(resetPasswordSchema, await c.req.json());
  await authService.resetPassword(body.token, body.newPassword);
  return c.json({ data: { message: 'Password reset successfully' } });
});

// GET /auth/me — requires auth
authRoutes.get('/me', async (c) => {
  const auth = c.get('auth');
  const user = await authService.getMe(auth.userId);
  return c.json({ data: user });
});

// POST /auth/pin — set/change Owner PIN
authRoutes.post('/pin', authorize('owner'), async (c) => {
  const auth = c.get('auth');
  const body = validate(setPinSchema, await c.req.json());
  await authService.setOwnerPin(auth.userId, body.newPin, body.currentPin);
  return c.json({ data: { message: 'PIN set successfully' } });
});

// POST /auth/pin/verify — verify Owner PIN, return approval token
authRoutes.post('/pin/verify', authorize('owner', 'manager'), async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) {
    return c.json({ error: { code: 'FORBIDDEN', message: 'No tenant context' } }, 403);
  }
  const body = validate(verifyPinSchema, await c.req.json());
  const result = await authService.verifyOwnerPin(auth.tenantId, body.pin);
  return c.json({ data: result });
});
