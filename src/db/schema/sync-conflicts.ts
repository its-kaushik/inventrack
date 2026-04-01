import { pgTable, uuid, varchar, jsonb, text, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { users } from './users.js';

export const syncConflictStatusEnum = pgEnum('sync_conflict_status', ['pending', 'force_accepted', 'edited', 'voided']);

export const syncConflicts = pgTable('sync_conflicts', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  submittedBy: uuid('submitted_by').notNull().references(() => users.id),
  offlineBillData: jsonb('offline_bill_data').notNull(),
  conflictReason: varchar('conflict_reason', { length: 255 }).notNull(),
  status: syncConflictStatusEnum('status').notNull().default('pending'),
  resolvedBy: uuid('resolved_by').references(() => users.id),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  resolutionNotes: text('resolution_notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
