import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  timestamp,
  index,
  pgEnum,
} from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('user_role', [
  'super_admin',
  'owner',
  'manager',
  'salesman',
]);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id'), // NULL for super_admin. FK added in tenants.ts to avoid circular ref.
    name: varchar('name', { length: 255 }).notNull(),
    email: varchar('email', { length: 255 }),
    phone: varchar('phone', { length: 15 }),
    passwordHash: text('password_hash').notNull(),
    role: roleEnum('role').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    ownerPinHash: text('owner_pin_hash'),
    pinFailedAttempts: integer('pin_failed_attempts').notNull().default(0),
    pinLockedUntil: timestamp('pin_locked_until', { withTimezone: true }),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_users_tenant_email').on(table.tenantId, table.email),
    index('idx_users_tenant_phone').on(table.tenantId, table.phone),
    index('idx_users_tenant_role').on(table.tenantId, table.role),
  ],
);

export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
