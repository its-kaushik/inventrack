import { pgTable, uuid, varchar, jsonb, timestamp, index, pgEnum, inet } from 'drizzle-orm/pg-core';

export const auditActionEnum = pgEnum('audit_action', ['create', 'update', 'delete', 'login', 'logout', 'void']);

// Note: Partitioned tables are not directly supported by Drizzle ORM's table builder.
// We define the schema here for type generation. The actual partitioned table + partitions
// are created via raw SQL in the post-migration script.
export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').defaultRandom().notNull(),
  tenantId: uuid('tenant_id').notNull(),
  userId: uuid('user_id').notNull(),
  action: auditActionEnum('action').notNull(),
  entityType: varchar('entity_type', { length: 50 }).notNull(),
  entityId: uuid('entity_id'),
  oldValue: jsonb('old_value'),
  newValue: jsonb('new_value'),
  ipAddress: inet('ip_address'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_audit_logs_tenant_date').on(table.tenantId, table.createdAt),
  index('idx_audit_logs_entity').on(table.tenantId, table.entityType, table.entityId),
]);
