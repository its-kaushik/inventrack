import 'dotenv/config';
import postgres from 'postgres';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

async function main() {
  const url = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL!;
  const sql = postgres(url, { max: 1, connect_timeout: 10 });

  // Create drizzle migration tracking table if needed
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
      id SERIAL PRIMARY KEY,
      hash TEXT NOT NULL UNIQUE,
      created_at BIGINT
    )
  `);

  // Get all migration files sorted
  const migrationsDir = join(import.meta.dirname, '../src/db/migrations');
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const hash = file.replace('.sql', '');

    // Check if already applied
    const existing = await sql`SELECT id FROM "__drizzle_migrations" WHERE hash = ${hash}`;
    if (existing.length > 0) {
      console.log(`⏭️  ${file} — already applied`);
      continue;
    }

    const migrationSql = readFileSync(join(migrationsDir, file), 'utf-8');
    const statements = migrationSql
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter(Boolean);

    console.log(`▶ ${file} — ${statements.length} statements`);

    for (const stmt of statements) {
      try {
        await sql.unsafe(stmt);
        console.log('  ✅', stmt.slice(0, 70).replace(/\n/g, ' ') + '...');
      } catch (e: any) {
        if (e.message.includes('already exists')) {
          console.log('  ⏭️  Already exists, skipping');
        } else {
          console.error('  ❌', e.message);
          throw e;
        }
      }
    }

    await sql`INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES (${hash}, ${Date.now()})`;
    console.log(`✅ ${file} — recorded`);
  }

  await sql.end();
  console.log('\n✅ All migrations complete');
}

main().catch((e) => {
  console.error('Migration failed:', e);
  process.exit(1);
});
