import { pgTable, varchar, text, numeric } from 'drizzle-orm/pg-core';

// Shared master table — no tenant_id
export const hsnCodes = pgTable('hsn_codes', {
  code: varchar('code', { length: 8 }).primaryKey(),
  description: text('description').notNull(),
  defaultGstRate: numeric('default_gst_rate', { precision: 5, scale: 2 }),
});
