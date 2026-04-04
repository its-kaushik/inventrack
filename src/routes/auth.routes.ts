import { Hono } from 'hono';
import { z } from 'zod';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import * as authService from '../services/auth.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { loginRateLimit } from '../middleware/rate-limit.js';
import { validate } from '../middleware/validate.js';
import { success } from '../lib/response.js';
import { env } from '../config/env.js';
import type { AppEnv } from '../types/hono.js';

const auth = new Hono<AppEnv>();

const loginSchema = z.object({
  phone: z.string().min(1, 'Phone is required'),
  password: z.string().min(1, 'Password is required'),
});

auth.post('/login', loginRateLimit, validate(loginSchema), async (c) => {
  const { phone, password } = c.get('validatedBody') as z.infer<typeof loginSchema>;

  const result = await authService.login(phone, password);

  setCookie(c, 'refreshToken', result.refreshToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'None',
    path: '/api/v1/auth',
    maxAge: env.JWT_REFRESH_TTL,
  });

  return c.json(
    success({
      accessToken: result.accessToken,
      user: result.user,
    }),
  );
});

auth.post('/refresh', async (c) => {
  const rawToken = getCookie(c, 'refreshToken');

  if (!rawToken) {
    return c.json(
      {
        success: false,
        data: null,
        error: { code: 'UNAUTHORIZED', message: 'No refresh token', details: null },
      },
      401,
    );
  }

  const result = await authService.refresh(rawToken);

  setCookie(c, 'refreshToken', result.refreshToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'None',
    path: '/api/v1/auth',
    maxAge: env.JWT_REFRESH_TTL,
  });

  return c.json(success({ accessToken: result.accessToken }));
});

auth.post('/logout', async (c) => {
  const rawToken = getCookie(c, 'refreshToken');
  if (rawToken) {
    await authService.logout(rawToken);
  }
  deleteCookie(c, 'refreshToken', { path: '/api/v1/auth' });
  return c.json(success({ message: 'Logged out' }));
});

auth.post('/forgot-password', validate(z.object({ phone: z.string().min(1) })), async (c) => {
  // Phase 1: return a message. Email/SMS not implemented yet.
  return c.json(success({ message: 'If this phone number exists, a reset link has been sent.' }));
});

auth.post(
  '/reset-password',
  validate(
    z.object({
      token: z.string().min(1),
      newPassword: z.string().min(6, 'Password must be at least 6 characters'),
    }),
  ),
  async (c) => {
    // Phase 1: placeholder — real reset token validation comes later
    return c.json(success({ message: 'Password reset functionality coming soon.' }));
  },
);

// OTP Login (Phase 3)
auth.post(
  '/send-otp',
  loginRateLimit,
  validate(z.object({ phone: z.string().min(10) })),
  async (c) => {
    const { phone } = c.get('validatedBody') as { phone: string };
    const result = await authService.sendOtp(phone);
    return c.json(success(result));
  },
);

auth.post(
  '/verify-otp',
  loginRateLimit,
  validate(
    z.object({
      phone: z.string().min(10),
      otp: z.string().length(6),
    }),
  ),
  async (c) => {
    const { phone, otp } = c.get('validatedBody') as { phone: string; otp: string };
    const result = await authService.verifyOtp(phone, otp);

    setCookie(c, 'refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'None',
      path: '/api/v1/auth',
      maxAge: env.JWT_REFRESH_TTL,
    });

    return c.json(
      success({
        accessToken: result.accessToken,
        user: result.user,
      }),
    );
  },
);

auth.get('/me', authMiddleware, async (c) => {
  const { userId, tenantId } = c.get('tenant');
  const data = await authService.getMe(userId, tenantId);
  return c.json(success(data));
});

export default auth;
