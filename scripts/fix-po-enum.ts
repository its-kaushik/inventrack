import 'dotenv/config';
import postgres from 'postgres';

async function main() {
  const sql = postgres(process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL!, { max: 1 });

  const r = await sql`SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid WHERE typname = 'po_status' ORDER BY enumsortorder`;
  console.log('Current po_status values:', r.map(x => x.enumlabel));

  // Add missing values
  for (const val of ['draft', 'sent', 'partially_received', 'fully_received', 'cancelled']) {
    try {
      await sql.unsafe(`ALTER TYPE po_status ADD VALUE IF NOT EXISTS '${val}'`);
      console.log(`  Added: ${val}`);
    } catch (e: any) {
      console.log(`  ${val}: ${e.message}`);
    }
  }

  const r2 = await sql`SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid WHERE typname = 'po_status' ORDER BY enumsortorder`;
  console.log('Updated po_status values:', r2.map(x => x.enumlabel));

  await sql.end();
}

main();
