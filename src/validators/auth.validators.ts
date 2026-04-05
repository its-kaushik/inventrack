import { z } from 'zod';

export const loginSchema = z.object({
  emailOrPhone: z.string().min(1, 'Email or phone is required'),
  password: z.string().min(1, 'Password is required'),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export const forgotPasswordSchema = z.object({
  emailOrPhone: z.string().min(1, 'Email or phone is required'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

export const setPinSchema = z.object({
  currentPin: z.string().optional(),
  newPin: z
    .string()
    .min(4, 'PIN must be 4-6 digits')
    .max(6, 'PIN must be 4-6 digits')
    .regex(/^\d+$/, 'PIN must be numeric'),
});

export const verifyPinSchema = z.object({
  pin: z.string().min(4).max(6).regex(/^\d+$/, 'PIN must be numeric'),
  action: z.string().min(1),
  referenceId: z.string().uuid().optional(),
});

export const inviteUserSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  email: z.string().email('Invalid email').optional(),
  phone: z.string().regex(/^\d{10}$/, 'Phone must be 10 digits').optional(),
  role: z.enum(['owner', 'manager', 'salesman']),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const updateUserSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  email: z.string().email().optional(),
  phone: z.string().regex(/^\d{10}$/).optional(),
  role: z.enum(['owner', 'manager', 'salesman']).optional(),
  isActive: z.boolean().optional(),
});
