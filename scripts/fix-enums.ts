import 'dotenv/config';
import postgres from 'postgres';

async function main() {
  const sql = postgres(process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL!, { max: 1 });

  console.log('Fixing user_role enum...');

  // Add missing values
  try { await sql.unsafe(`ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'super_admin'`); console.log('  Added super_admin'); } catch (e: any) { console.log('  super_admin:', e.message); }
  try { await sql.unsafe(`ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'salesman'`); console.log('  Added salesman'); } catch (e: any) { console.log('  salesman:', e.message); }

  // Verify
  const result = await sql`SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid WHERE typname = 'user_role' ORDER BY enumsortorder`;
  console.log('user_role enum values:', result.map(r => r.enumlabel));

  // Check gst_scheme and tenant_status
  const gst = await sql`SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid WHERE typname = 'gst_scheme' ORDER BY enumsortorder`;
  console.log('gst_scheme enum values:', gst.map(r => r.enumlabel));

  const ts = await sql`SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid WHERE typname = 'tenant_status' ORDER BY enumsortorder`;
  console.log('tenant_status enum values:', ts.map(r => r.enumlabel));

  await sql.end();
  console.log('Done');
}

main();
