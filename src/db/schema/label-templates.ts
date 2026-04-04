import { pgTable, uuid, varchar, jsonb, boolean, timestamp } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

export const labelTemplates = pgTable('label_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  description: varchar('description', { length: 255 }),
  fields: jsonb('fields').notNull().default('["barcode","name","size","price"]'),
  layout: jsonb('layout')
    .notNull()
    .default('{"columns":3,"labelWidth":"63mm","labelHeight":"25mm"}'),
  isDefault: boolean('is_default').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
