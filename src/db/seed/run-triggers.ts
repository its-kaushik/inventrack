import 'dotenv/config';
import postgres from 'postgres';

async function main() {
  const sql = postgres(process.env.DIRECT_URL || process.env.DATABASE_URL!, { ssl: 'require' });

  console.log('Creating pg_trgm extension...');
  await sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`;

  console.log('Creating stock trigger...');
  await sql`
    CREATE OR REPLACE FUNCTION update_product_stock()
    RETURNS TRIGGER AS $$
    BEGIN
        UPDATE products
        SET current_stock = current_stock + NEW.quantity
        WHERE id = NEW.product_id AND tenant_id = NEW.tenant_id;
        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `;

  await sql`DROP TRIGGER IF EXISTS trg_stock_entry_update_product ON stock_entries`;
  await sql`
    CREATE TRIGGER trg_stock_entry_update_product
        AFTER INSERT ON stock_entries
        FOR EACH ROW
        EXECUTE FUNCTION update_product_stock()
  `;

  console.log('Creating updated_at trigger function...');
  await sql`
    CREATE OR REPLACE FUNCTION update_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
        NEW.updated_at = now();
        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `;

  const tables = ['tenants', 'users', 'categories', 'sub_types', 'size_systems', 'brands', 'products', 'suppliers', 'customers', 'purchase_orders', 'expenses'];

  for (const table of tables) {
    const triggerName = `trg_${table}_updated`;
    await sql.unsafe(`DROP TRIGGER IF EXISTS ${triggerName} ON ${table}`);
    await sql.unsafe(`
      CREATE TRIGGER ${triggerName}
        BEFORE UPDATE ON ${table}
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at()
    `);
    console.log(`  Applied updated_at trigger to ${table}`);
  }

  console.log('Creating trigram index for product search...');
  await sql`CREATE INDEX IF NOT EXISTS idx_products_search ON products USING GIN (name gin_trgm_ops)`;

  console.log('All triggers and extensions created successfully!');
  await sql.end();
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
