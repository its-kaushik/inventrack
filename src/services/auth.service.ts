import { eq, and } from 'drizzle-orm';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { randomUUID, createHash } from 'crypto';
import { db } from '../config/database.js';
import { env } from '../config/env.js';
import { users } from '../db/schema/users.js';
import { tenants } from '../db/schema/tenants.js';
import { refreshTokens } from '../db/schema/refresh-tokens.js';
import { AuthError } from '../lib/errors.js';

const jwtSecret = new TextEncoder().encode(env.JWT_SECRET);

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

async function generateAccessToken(userId: string, tenantId: string, role: string): Promise<string> {
  return new SignJWT({ sub: userId, tid: tenantId, role })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${env.JWT_ACCESS_TTL}s`)
    .sign(jwtSecret);
}

async function createRefreshToken(userId: string): Promise<string> {
  const rawToken = randomUUID();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + env.JWT_REFRESH_TTL * 1000);

  await db.insert(refreshTokens).values({
    userId,
    tokenHash,
    expiresAt,
  });

  return rawToken;
}

export async function login(phone: string, password: string) {
  const [user] = await db
    .select({
      id: users.id,
      tenantId: users.tenantId,
      name: users.name,
      phone: users.phone,
      email: users.email,
      role: users.role,
      isActive: users.isActive,
      passwordHash: users.passwordHash,
    })
    .from(users)
    .where(eq(users.phone, phone))
    .limit(1);

  if (!user) {
    throw new AuthError('Invalid phone number or password');
  }

  if (!user.isActive) {
    throw new AuthError('Your account has been deactivated');
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new AuthError('Invalid phone number or password');
  }

  // Check tenant is active
  const [tenant] = await db
    .select({ status: tenants.status, setupComplete: tenants.setupComplete })
    .from(tenants)
    .where(eq(tenants.id, user.tenantId))
    .limit(1);

  if (!tenant || tenant.status !== 'active') {
    throw new AuthError('Your store account is not active');
  }

  const accessToken = await generateAccessToken(user.id, user.tenantId, user.role);
  const rawRefreshToken = await createRefreshToken(user.id);

  // Update last login
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

  return {
    accessToken,
    refreshToken: rawRefreshToken,
    user: {
      id: user.id,
      tenantId: user.tenantId,
      name: user.name,
      phone: user.phone,
      email: user.email,
      role: user.role,
      setupComplete: tenant.setupComplete,
    },
  };
}

export async function refresh(rawToken: string) {
  const tokenHash = hashToken(rawToken);

  const [stored] = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, tokenHash))
    .limit(1);

  if (!stored) {
    throw new AuthError('Invalid refresh token');
  }

  if (new Date() > stored.expiresAt) {
    await db.delete(refreshTokens).where(eq(refreshTokens.id, stored.id));
    throw new AuthError('Refresh token expired');
  }

  // Delete old token (rotation)
  await db.delete(refreshTokens).where(eq(refreshTokens.id, stored.id));

  // Fetch user for new access token
  const [user] = await db
    .select({ id: users.id, tenantId: users.tenantId, role: users.role, isActive: users.isActive })
    .from(users)
    .where(eq(users.id, stored.userId))
    .limit(1);

  if (!user || !user.isActive) {
    throw new AuthError('User account not found or deactivated');
  }

  const accessToken = await generateAccessToken(user.id, user.tenantId, user.role);
  const newRefreshToken = await createRefreshToken(user.id);

  return { accessToken, refreshToken: newRefreshToken };
}

export async function logout(rawToken: string) {
  if (!rawToken) return;
  const tokenHash = hashToken(rawToken);
  await db.delete(refreshTokens).where(eq(refreshTokens.tokenHash, tokenHash));
}

export async function getMe(userId: string, tenantId: string) {
  const [user] = await db
    .select({
      id: users.id,
      tenantId: users.tenantId,
      name: users.name,
      phone: users.phone,
      email: users.email,
      role: users.role,
    })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)))
    .limit(1);

  if (!user) throw new AuthError('User not found');

  const [tenant] = await db
    .select({
      id: tenants.id,
      name: tenants.name,
      gstScheme: tenants.gstScheme,
      gstin: tenants.gstin,
      invoicePrefix: tenants.invoicePrefix,
      settings: tenants.settings,
      setupComplete: tenants.setupComplete,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  return { ...user, tenant };
}
