import { eq, and, asc } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { db } from '../config/database.js';
import { users } from '../db/schema/users.js';
import { NotFoundError, DuplicateEntryError } from '../lib/errors.js';
import type { UserRole } from '../types/enums.js';

const userColumns = {
  id: users.id,
  tenantId: users.tenantId,
  name: users.name,
  phone: users.phone,
  email: users.email,
  role: users.role,
  isActive: users.isActive,
  lastLoginAt: users.lastLoginAt,
  createdAt: users.createdAt,
};

export async function listUsers(tenantId: string) {
  return db
    .select(userColumns)
    .from(users)
    .where(eq(users.tenantId, tenantId))
    .orderBy(asc(users.name));
}

export async function getUserById(tenantId: string, userId: string) {
  const [user] = await db
    .select(userColumns)
    .from(users)
    .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)))
    .limit(1);

  if (!user) throw new NotFoundError('User', userId);
  return user;
}

export async function createUser(tenantId: string, input: {
  name: string;
  phone: string;
  email?: string;
  role: UserRole;
  password: string;
}) {
  const passwordHash = await bcrypt.hash(input.password, 12);

  try {
    const [user] = await db.insert(users).values({
      tenantId,
      name: input.name,
      phone: input.phone,
      email: input.email,
      passwordHash,
      role: input.role,
    }).returning(userColumns);

    return user;
  } catch (err: any) {
    if (err.code === '23505' && err.constraint_name?.includes('phone')) {
      throw new DuplicateEntryError('User', 'phone');
    }
    throw err;
  }
}

export async function updateUser(tenantId: string, userId: string, patch: Partial<{
  name: string;
  phone: string;
  email: string;
  role: UserRole;
  isActive: boolean;
}>) {
  const [updated] = await db
    .update(users)
    .set(patch)
    .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)))
    .returning(userColumns);

  if (!updated) throw new NotFoundError('User', userId);
  return updated;
}

export async function resetUserPassword(tenantId: string, userId: string, newPassword: string) {
  const passwordHash = await bcrypt.hash(newPassword, 12);

  const [updated] = await db
    .update(users)
    .set({ passwordHash })
    .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)))
    .returning({ id: users.id });

  if (!updated) throw new NotFoundError('User', userId);
  return { success: true };
}
