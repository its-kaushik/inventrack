import { eq, and, sql, desc } from 'drizzle-orm';
import { SignJWT } from 'jose';
import bcrypt from 'bcryptjs';
import { randomUUID, createHash } from 'crypto';
import { db } from '../config/database.js';
import { env } from '../config/env.js';
import { redis } from '../config/redis.js';
import { superAdmins, adminRefreshTokens } from '../db/schema/super-admins.js';
import { tenants } from '../db/schema/tenants.js';
import { users } from '../db/schema/users.js';
import { bills } from '../db/schema/bills.js';
import { products } from '../db/schema/products.js';
import { customers } from '../db/schema/customers.js';
import { suppliers } from '../db/schema/suppliers.js';
import { AuthError, NotFoundError, ValidationError } from '../lib/errors.js';

const jwtSecret = new TextEncoder().encode(env.JWT_SECRET);

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

async function generateAdminAccessToken(adminId: string): Promise<string> {
  return new SignJWT({ sub: adminId, tid: null, role: 'super_admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${env.JWT_ACCESS_TTL}s`)
    .sign(jwtSecret);
}

async function createAdminRefreshToken(adminId: string): Promise<string> {
  const rawToken = randomUUID();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + env.JWT_REFRESH_TTL * 1000);

  await db.insert(adminRefreshTokens).values({
    adminId,
    tokenHash,
    expiresAt,
  });

  return rawToken;
}

export async function adminLogin(email: string, password: string) {
  const [admin] = await db
    .select({
      id: superAdmins.id,
      name: superAdmins.name,
      email: superAdmins.email,
      isActive: superAdmins.isActive,
      passwordHash: superAdmins.passwordHash,
    })
    .from(superAdmins)
    .where(eq(superAdmins.email, email))
    .limit(1);

  if (!admin) {
    throw new AuthError('Invalid email or password');
  }

  if (!admin.isActive) {
    throw new AuthError('Admin account has been deactivated');
  }

  const valid = await bcrypt.compare(password, admin.passwordHash);
  if (!valid) {
    throw new AuthError('Invalid email or password');
  }

  const accessToken = await generateAdminAccessToken(admin.id);
  const refreshToken = await createAdminRefreshToken(admin.id);

  return {
    accessToken,
    refreshToken,
    admin: {
      id: admin.id,
      name: admin.name,
      email: admin.email,
    },
  };
}

export async function adminRefresh(rawToken: string) {
  const tokenHash = hashToken(rawToken);

  const [stored] = await db
    .select()
    .from(adminRefreshTokens)
    .where(eq(adminRefreshTokens.tokenHash, tokenHash))
    .limit(1);

  if (!stored) {
    throw new AuthError('Invalid refresh token');
  }

  if (new Date() > stored.expiresAt) {
    await db.delete(adminRefreshTokens).where(eq(adminRefreshTokens.id, stored.id));
    throw new AuthError('Refresh token expired');
  }

  // Delete old token (rotation)
  await db.delete(adminRefreshTokens).where(eq(adminRefreshTokens.id, stored.id));

  // Fetch admin for new access token
  const [admin] = await db
    .select({ id: superAdmins.id, isActive: superAdmins.isActive })
    .from(superAdmins)
    .where(eq(superAdmins.id, stored.adminId))
    .limit(1);

  if (!admin || !admin.isActive) {
    throw new AuthError('Admin account not found or deactivated');
  }

  const accessToken = await generateAdminAccessToken(admin.id);
  const refreshToken = await createAdminRefreshToken(admin.id);

  return { accessToken, refreshToken };
}

export async function getDashboard() {
  const [tenantsByStatus, tenantsByPlan, billsThisMonth, recentSignups, totalUsersResult] =
    await Promise.all([
      // Total tenants by status
      db.execute<{ status: string; count: string }>(
        sql`SELECT status, COUNT(*)::text AS count FROM tenants GROUP BY status`,
      ),
      // Total tenants by plan
      db.execute<{ plan: string; count: string }>(
        sql`SELECT plan, COUNT(*)::text AS count FROM tenants GROUP BY plan`,
      ),
      // Total bills this month
      db.execute<{ count: string; total: string }>(
        sql`SELECT COUNT(*)::text AS count, COALESCE(SUM(net_amount::numeric), 0)::text AS total FROM bills WHERE created_at >= date_trunc('month', now())`,
      ),
      // Recent signups (last 30 days)
      db.execute<{ id: string; name: string; plan: string; created_at: string }>(
        sql`SELECT id, name, plan, created_at FROM tenants ORDER BY created_at DESC LIMIT 10`,
      ),
      // Total users
      db.execute<{ count: string }>(sql`SELECT COUNT(*)::text AS count FROM users`),
    ]);

  return {
    tenantsByStatus: tenantsByStatus as any[],
    tenantsByPlan: tenantsByPlan as any[],
    billsThisMonth: {
      count: Number((billsThisMonth as any[])[0]?.count ?? 0),
      total: (billsThisMonth as any[])[0]?.total ?? '0',
    },
    recentSignups: recentSignups as any[],
    totalUsers: Number((totalUsersResult as any[])[0]?.count ?? 0),
  };
}

export async function listTenants(filters: {
  status?: string;
  plan?: string;
  limit: number;
  offset: number;
}) {
  const conditions: ReturnType<typeof eq>[] = [];

  if (filters.status) {
    conditions.push(eq(tenants.status, filters.status as 'active' | 'suspended' | 'deleted'));
  }
  if (filters.plan) {
    conditions.push(eq(tenants.plan, filters.plan as 'free' | 'basic' | 'pro'));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const items = await db
    .select({
      id: tenants.id,
      name: tenants.name,
      phone: tenants.phone,
      email: tenants.email,
      status: tenants.status,
      plan: tenants.plan,
      setupComplete: tenants.setupComplete,
      createdAt: tenants.createdAt,
      userCount: sql<number>`(SELECT COUNT(*) FROM users WHERE users.tenant_id = ${tenants.id})`.as(
        'user_count',
      ),
    })
    .from(tenants)
    .where(whereClause)
    .orderBy(desc(tenants.createdAt))
    .limit(filters.limit + 1)
    .offset(filters.offset);

  const hasMore = items.length > filters.limit;
  if (hasMore) items.pop();

  return { items, hasMore };
}

export async function getTenantById(tenantId: string) {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);

  if (!tenant) {
    throw new NotFoundError('Tenant', tenantId);
  }

  const [
    productCountResult,
    userCountResult,
    billCountResult,
    customerCountResult,
    supplierCountResult,
    lastBillResult,
    lastLoginResult,
  ] = await Promise.all([
    db.execute<{ count: string }>(
      sql`SELECT COUNT(*)::text AS count FROM products WHERE tenant_id = ${tenantId}`,
    ),
    db.execute<{ count: string }>(
      sql`SELECT COUNT(*)::text AS count FROM users WHERE tenant_id = ${tenantId}`,
    ),
    db.execute<{ count: string }>(
      sql`SELECT COUNT(*)::text AS count FROM bills WHERE tenant_id = ${tenantId}`,
    ),
    db.execute<{ count: string }>(
      sql`SELECT COUNT(*)::text AS count FROM customers WHERE tenant_id = ${tenantId}`,
    ),
    db.execute<{ count: string }>(
      sql`SELECT COUNT(*)::text AS count FROM suppliers WHERE tenant_id = ${tenantId}`,
    ),
    db.execute<{ last_bill_date: string | null }>(
      sql`SELECT MAX(created_at)::text AS last_bill_date FROM bills WHERE tenant_id = ${tenantId}`,
    ),
    db.execute<{ last_login: string | null }>(
      sql`SELECT MAX(last_login_at)::text AS last_login FROM users WHERE tenant_id = ${tenantId}`,
    ),
  ]);

  return {
    ...tenant,
    metrics: {
      productCount: Number((productCountResult as any[])[0]?.count ?? 0),
      userCount: Number((userCountResult as any[])[0]?.count ?? 0),
      billCount: Number((billCountResult as any[])[0]?.count ?? 0),
      customerCount: Number((customerCountResult as any[])[0]?.count ?? 0),
      supplierCount: Number((supplierCountResult as any[])[0]?.count ?? 0),
      lastBillDate: (lastBillResult as any[])[0]?.last_bill_date ?? null,
      lastLogin: (lastLoginResult as any[])[0]?.last_login ?? null,
    },
  };
}

export async function updateTenant(
  tenantId: string,
  patch: { status?: 'active' | 'suspended'; plan?: 'free' | 'basic' | 'pro' },
) {
  // Validate: only allow status and plan updates
  const updateData: Record<string, unknown> = {};

  if (patch.status !== undefined) {
    updateData.status = patch.status;
  }
  if (patch.plan !== undefined) {
    updateData.plan = patch.plan;
  }

  if (Object.keys(updateData).length === 0) {
    throw new ValidationError('At least one of status or plan must be provided');
  }

  const [updated] = await db
    .update(tenants)
    .set(updateData)
    .where(eq(tenants.id, tenantId))
    .returning();

  if (!updated) {
    throw new NotFoundError('Tenant', tenantId);
  }

  // If changing plan, invalidate Redis cache
  if (patch.plan !== undefined && redis) {
    await redis.del(`tenant:${tenantId}:plan`);
  }

  return updated;
}
