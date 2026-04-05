import * as jose from 'jose';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { eq, and, or, isNull } from 'drizzle-orm';
import { users, refreshTokens } from '../db/schema/users.js';
import { db, type Database, type Transaction } from '../db/client.js';
import { env } from '../config/env.js';
import { CONSTANTS } from '../config/constants.js';
import { AppError } from '../types/errors.js';
import { AuditRepository } from '../repositories/audit.repository.js';
import type { Role } from '../types/enums.js';

const secret = new TextEncoder().encode(env.JWT_SECRET);

// --- Token Utilities ---

export async function generateAccessToken(payload: {
  userId: string;
  tenantId: string | null;
  role: string;
}): Promise<string> {
  return new jose.SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(env.JWT_ACCESS_EXPIRY)
    .sign(secret);
}

export async function verifyAccessToken(
  token: string,
): Promise<{ userId: string; tenantId: string | null; role: Role }> {
  try {
    const { payload } = await jose.jwtVerify(token, secret);
    return payload as { userId: string; tenantId: string | null; role: Role };
  } catch {
    throw new AppError('UNAUTHORIZED', 'Invalid or expired token', 401);
  }
}

export async function generateApprovalToken(
  tenantId: string,
  action: string,
): Promise<string> {
  return new jose.SignJWT({ tenantId, action, type: 'pin_approval' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(CONSTANTS.AUTH.PIN_APPROVAL_TOKEN_EXPIRY)
    .sign(secret);
}

export async function verifyApprovalToken(
  token: string,
  expectedTenantId: string,
): Promise<{ tenantId: string; action: string }> {
  try {
    const { payload } = await jose.jwtVerify(token, secret);
    const data = payload as { tenantId: string; action: string; type: string };
    if (data.type !== 'pin_approval' || data.tenantId !== expectedTenantId) {
      throw new Error('Invalid approval token');
    }
    return { tenantId: data.tenantId, action: data.action };
  } catch {
    throw new AppError('FORBIDDEN', 'Invalid or expired approval token', 403);
  }
}

// Stateless password-reset / invite tokens
export async function generateResetToken(userId: string, email: string): Promise<string> {
  return new jose.SignJWT({ userId, email, type: 'password_reset' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(secret);
}

export async function verifyResetToken(token: string): Promise<{ userId: string; email: string }> {
  try {
    const { payload } = await jose.jwtVerify(token, secret);
    const data = payload as { userId: string; email: string; type: string };
    if (data.type !== 'password_reset') throw new Error('Invalid token type');
    return { userId: data.userId, email: data.email };
  } catch {
    throw new AppError('UNAUTHORIZED', 'Invalid or expired reset token', 401);
  }
}

// --- Helpers ---

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });
}

async function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}

// --- Auth Service ---

const auditRepo = new AuditRepository(db);

export async function login(
  emailOrPhone: string,
  password: string,
): Promise<{ accessToken: string; refreshToken: string; user: typeof users.$inferSelect }> {
  // Find user by email or phone
  const [user] = await db
    .select()
    .from(users)
    .where(
      and(
        or(eq(users.email, emailOrPhone), eq(users.phone, emailOrPhone)),
        eq(users.isActive, true),
        isNull(users.deletedAt),
      ),
    );

  if (!user) {
    await auditRepo.log({
      action: 'login_failed',
      entityType: 'auth',
      metadata: { reason: 'user_not_found', identifier: emailOrPhone },
    });
    throw new AppError('UNAUTHORIZED', 'Invalid credentials', 401);
  }

  const validPassword = await verifyPassword(user.passwordHash, password);
  if (!validPassword) {
    await auditRepo.log({
      tenantId: user.tenantId,
      userId: user.id,
      action: 'login_failed',
      entityType: 'auth',
      metadata: { reason: 'invalid_password' },
    });
    throw new AppError('UNAUTHORIZED', 'Invalid credentials', 401);
  }

  // Generate tokens
  const accessToken = await generateAccessToken({
    userId: user.id,
    tenantId: user.tenantId,
    role: user.role,
  });

  const rawRefreshToken = randomBytes(64).toString('hex');
  const tokenHash = hashToken(rawRefreshToken);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  await db.insert(refreshTokens).values({
    userId: user.id,
    tokenHash,
    expiresAt,
  });

  // Update last login
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

  await auditRepo.log({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'login_success',
    entityType: 'auth',
  });

  return { accessToken, refreshToken: rawRefreshToken, user };
}

export async function refresh(
  rawRefreshToken: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const tokenHash = hashToken(rawRefreshToken);

  const [storedToken] = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, tokenHash));

  if (!storedToken || storedToken.expiresAt < new Date()) {
    throw new AppError('UNAUTHORIZED', 'Invalid or expired refresh token', 401);
  }

  // Get user
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, storedToken.userId), eq(users.isActive, true), isNull(users.deletedAt)));

  if (!user) {
    throw new AppError('UNAUTHORIZED', 'User not found or inactive', 401);
  }

  // Rotate: delete old, create new
  await db.delete(refreshTokens).where(eq(refreshTokens.id, storedToken.id));

  const newRawToken = randomBytes(64).toString('hex');
  const newTokenHash = hashToken(newRawToken);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await db.insert(refreshTokens).values({
    userId: user.id,
    tokenHash: newTokenHash,
    expiresAt,
  });

  const accessToken = await generateAccessToken({
    userId: user.id,
    tenantId: user.tenantId,
    role: user.role,
  });

  return { accessToken, refreshToken: newRawToken };
}

export async function logout(rawRefreshToken: string): Promise<void> {
  const tokenHash = hashToken(rawRefreshToken);
  await db.delete(refreshTokens).where(eq(refreshTokens.tokenHash, tokenHash));
}

export async function forgotPassword(emailOrPhone: string): Promise<{ message: string }> {
  const [user] = await db
    .select()
    .from(users)
    .where(
      and(
        or(eq(users.email, emailOrPhone), eq(users.phone, emailOrPhone)),
        eq(users.isActive, true),
        isNull(users.deletedAt),
      ),
    );

  // Always return success to prevent user enumeration
  if (!user) return { message: 'If the account exists, a reset link has been sent.' };

  const token = await generateResetToken(user.id, user.email ?? '');
  // TODO: Send token via email/SMS in production
  console.info(`[auth] Password reset token for ${emailOrPhone}: ${token}`);

  return { message: 'If the account exists, a reset link has been sent.' };
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const { userId } = await verifyResetToken(token);

  const passwordHash = await hashPassword(newPassword);
  const result = await db
    .update(users)
    .set({ passwordHash, updatedAt: new Date() })
    .where(and(eq(users.id, userId), eq(users.isActive, true), isNull(users.deletedAt)))
    .returning({ id: users.id });

  if (result.length === 0) {
    throw new AppError('NOT_FOUND', 'User not found', 404);
  }

  // Invalidate all refresh tokens for this user
  await db.delete(refreshTokens).where(eq(refreshTokens.userId, userId));

  await auditRepo.log({
    userId,
    action: 'password_reset',
    entityType: 'user',
    entityId: userId,
  });
}

export async function getMe(userId: string) {
  const [user] = await db
    .select({
      id: users.id,
      tenantId: users.tenantId,
      name: users.name,
      email: users.email,
      phone: users.phone,
      role: users.role,
      isActive: users.isActive,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(and(eq(users.id, userId), isNull(users.deletedAt)));

  if (!user) throw new AppError('NOT_FOUND', 'User not found', 404);
  return user;
}

// --- User Management ---

export async function createUser(data: {
  tenantId: string;
  name: string;
  email?: string;
  phone?: string;
  role: Role;
  password: string;
}) {
  const passwordHash = await hashPassword(data.password);

  const [user] = await db
    .insert(users)
    .values({
      tenantId: data.tenantId,
      name: data.name,
      email: data.email ?? null,
      phone: data.phone ?? null,
      passwordHash,
      role: data.role,
    })
    .returning();

  await auditRepo.log({
    tenantId: data.tenantId,
    action: 'user_created',
    entityType: 'user',
    entityId: user.id,
    newValue: { name: data.name, role: data.role },
  });

  return user;
}

export async function listUsers(tenantId: string) {
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      role: users.role,
      isActive: users.isActive,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(and(eq(users.tenantId, tenantId), isNull(users.deletedAt)));
}

export async function getUserById(tenantId: string, userId: string) {
  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      role: users.role,
      isActive: users.isActive,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.tenantId, tenantId), isNull(users.deletedAt)));

  if (!user) throw new AppError('NOT_FOUND', 'User not found', 404);
  return user;
}

export async function updateUser(
  tenantId: string,
  userId: string,
  data: { name?: string; email?: string; phone?: string; role?: Role; isActive?: boolean },
) {
  const [updated] = await db
    .update(users)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(users.id, userId), eq(users.tenantId, tenantId), isNull(users.deletedAt)))
    .returning();

  if (!updated) throw new AppError('NOT_FOUND', 'User not found', 404);

  await auditRepo.log({
    tenantId,
    action: 'user_updated',
    entityType: 'user',
    entityId: userId,
    newValue: data,
  });

  return updated;
}

export async function deactivateUser(tenantId: string, userId: string) {
  const [updated] = await db
    .update(users)
    .set({ deletedAt: new Date(), isActive: false, updatedAt: new Date() })
    .where(and(eq(users.id, userId), eq(users.tenantId, tenantId), isNull(users.deletedAt)))
    .returning({ id: users.id });

  if (!updated) throw new AppError('NOT_FOUND', 'User not found', 404);

  // Invalidate all refresh tokens
  await db.delete(refreshTokens).where(eq(refreshTokens.userId, userId));

  await auditRepo.log({
    tenantId,
    action: 'user_deactivated',
    entityType: 'user',
    entityId: userId,
  });
}

// --- Owner PIN ---

export async function setOwnerPin(userId: string, newPin: string, currentPin?: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, userId), eq(users.role, 'owner'), isNull(users.deletedAt)));

  if (!user) throw new AppError('NOT_FOUND', 'Owner not found', 404);

  // If PIN already set, require current PIN
  if (user.ownerPinHash && !currentPin) {
    throw new AppError('VALIDATION_ERROR', 'Current PIN is required to change PIN', 400);
  }

  if (user.ownerPinHash && currentPin) {
    const valid = await argon2.verify(user.ownerPinHash, currentPin);
    if (!valid) throw new AppError('PIN_INVALID', 'Current PIN is incorrect', 403);
  }

  const pinHash = await argon2.hash(newPin, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });

  await db
    .update(users)
    .set({ ownerPinHash: pinHash, pinFailedAttempts: 0, pinLockedUntil: null, updatedAt: new Date() })
    .where(eq(users.id, userId));

  await auditRepo.log({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'pin_set',
    entityType: 'user',
    entityId: user.id,
    // Never log the PIN itself
  });
}

export async function verifyOwnerPin(
  tenantId: string,
  pin: string,
): Promise<{ approvalToken: string }> {
  const [owner] = await db
    .select()
    .from(users)
    .where(
      and(eq(users.tenantId, tenantId), eq(users.role, 'owner'), isNull(users.deletedAt)),
    );

  if (!owner || !owner.ownerPinHash) {
    throw new AppError('PIN_REQUIRED', 'Owner PIN not set', 403);
  }

  // Check lockout
  if (owner.pinLockedUntil && new Date() < owner.pinLockedUntil) {
    throw new AppError('PIN_LOCKED', 'Too many attempts. Try again later.', 429);
  }

  const valid = await argon2.verify(owner.ownerPinHash, pin);

  if (!valid) {
    const attempts = owner.pinFailedAttempts + 1;
    const lockUntil =
      attempts >= CONSTANTS.AUTH.PIN_MAX_ATTEMPTS
        ? new Date(Date.now() + CONSTANTS.AUTH.PIN_LOCKOUT_MINUTES * 60_000)
        : null;

    await db
      .update(users)
      .set({ pinFailedAttempts: attempts, pinLockedUntil: lockUntil })
      .where(eq(users.id, owner.id));

    await auditRepo.log({
      tenantId,
      userId: owner.id,
      action: 'pin_verification_failed',
      entityType: 'user',
      entityId: owner.id,
      metadata: { attempts },
    });

    throw new AppError(
      'PIN_INVALID',
      `Incorrect PIN. ${CONSTANTS.AUTH.PIN_MAX_ATTEMPTS - attempts} attempts remaining.`,
      403,
    );
  }

  // Reset attempts on success
  await db
    .update(users)
    .set({ pinFailedAttempts: 0, pinLockedUntil: null })
    .where(eq(users.id, owner.id));

  await auditRepo.log({
    tenantId,
    userId: owner.id,
    action: 'pin_verification_success',
    entityType: 'user',
    entityId: owner.id,
  });

  const approvalToken = await generateApprovalToken(tenantId, 'discount_override');
  return { approvalToken };
}
