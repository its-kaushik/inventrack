import { pgTable, uuid, varchar, integer, primaryKey } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

export const billSequences = pgTable('bill_sequences', {
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  sequenceType: varchar('sequence_type', { length: 20 }).notNull(),
  financialYear: varchar('financial_year', { length: 9 }).notNull(),
  lastNumber: integer('last_number').notNull().default(0),
}, (table) => [
  primaryKey({ columns: [table.tenantId, table.sequenceType, table.financialYear] }),
]);
