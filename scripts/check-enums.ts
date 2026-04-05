import 'dotenv/config';
import postgres from 'postgres';

async function main() {
  const sql = postgres(process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL!, { max: 1 });
  const result = await sql`SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid WHERE typname = 'user_role' ORDER BY enumsortorder`;
  console.log('user_role enum values:', result.map(r => r.enumlabel));
  await sql.end();
}

main();
