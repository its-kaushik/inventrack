import 'dotenv/config';
import postgres from 'postgres';

async function main() {
  const sql = postgres(process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL!, { max: 1 });

  for (const [typeName, values] of Object.entries({
    refund_mode: ['cash', 'khata', 'exchange', 'store_credit'],
    return_type: ['full', 'partial', 'exchange'],
    return_reason: ['size_issue', 'defect', 'changed_mind', 'color_mismatch', 'other'],
  })) {
    const existing = await sql`SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid WHERE typname = ${typeName}`;
    console.log(`${typeName}:`, existing.map(r => r.enumlabel));

    for (const val of values) {
      try {
        await sql.unsafe(`ALTER TYPE ${typeName} ADD VALUE IF NOT EXISTS '${val}'`);
      } catch (e: any) {
        console.log(`  ${val}: ${e.message}`);
      }
    }
  }

  await sql.end();
  console.log('Done');
}

main();
