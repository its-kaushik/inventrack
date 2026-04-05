import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { users } from './users.js';

export const conflictTypeEnum = pgEnum('conflict_type', [
  'negative_stock',
  'duplicate_customer',
  'stale_price',
  'bill_number_collision',
]);

export const conflictStatusEnum = pgEnum('conflict_status', ['unresolved', 'resolved']);

export const syncConflicts = pgTable('sync_conflicts', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  conflictType: conflictTypeEnum('conflict_type').notNull(),
  description: text('description').notNull(),
  relatedSaleId: uuid('related_sale_id'),
  relatedData: jsonb('related_data'),
  status: conflictStatusEnum('status').notNull().default('unresolved'),
  resolution: text('resolution'),
  resolvedBy: uuid('resolved_by').references(() => users.id),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
