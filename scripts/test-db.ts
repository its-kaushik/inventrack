import 'dotenv/config';
import postgres from 'postgres';

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1, connect_timeout: 10 });
  try {
    const result = await sql`SELECT 1 as connected`;
    console.log('✅ Database connected:', result[0]);
  } catch (e: any) {
    console.error('❌ Connection failed:', e.message);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();
