import 'dotenv/config';
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { join } from 'path';

async function main() {
  const url = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL!;
  const sql = postgres(url, { max: 1, connect_timeout: 10 });

  // Read migration file
  const migrationSql = readFileSync(
    join(import.meta.dirname, '../src/db/migrations/0000_fantastic_alice.sql'),
    'utf-8',
  );

  // Split by drizzle's statement breakpoint and run each
  const statements = migrationSql
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter(Boolean);

  console.log(`Running ${statements.length} statements...`);

  for (const stmt of statements) {
    try {
      await sql.unsafe(stmt);
      console.log('  ✅', stmt.slice(0, 60).replace(/\n/g, ' ') + '...');
    } catch (e: any) {
      if (e.message.includes('already exists')) {
        console.log('  ⏭️  Already exists, skipping:', stmt.slice(0, 60).replace(/\n/g, ' '));
      } else {
        console.error('  ❌', e.message);
        throw e;
      }
    }
  }

  // Create drizzle migration tracking table if needed
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
      id SERIAL PRIMARY KEY,
      hash TEXT NOT NULL,
      created_at BIGINT
    )
  `);

  // Mark migration as applied
  const hash = '0000_fantastic_alice';
  const existing = await sql`SELECT id FROM "__drizzle_migrations" WHERE hash = ${hash}`;
  if (existing.length === 0) {
    await sql`INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES (${hash}, ${Date.now()})`;
    console.log('✅ Migration recorded in __drizzle_migrations');
  }

  await sql.end();
  console.log('✅ Migration complete');
}

main().catch((e) => {
  console.error('Migration failed:', e);
  process.exit(1);
});
