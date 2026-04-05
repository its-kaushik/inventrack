import 'dotenv/config';
import * as argon2 from 'argon2';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import { users } from './schema/users.js';

async function main() {
  const url = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL!;
  const sql = postgres(url, { max: 1 });
  const db = drizzle(sql);

  console.log('🌱 Seeding database...');

  // 1. Create default Super Admin
  const superAdminEmail = 'admin@inventrack.app';
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, superAdminEmail));

  if (existing) {
    console.log('  ⏭️  Super Admin already exists');
  } else {
    const passwordHash = await argon2.hash('Admin@123456', { type: argon2.argon2id });
    await db.insert(users).values({
      name: 'Super Admin',
      email: superAdminEmail,
      passwordHash,
      role: 'super_admin',
      tenantId: null,
    });
    console.log('  ✅ Super Admin created (admin@inventrack.app / Admin@123456)');
  }

  // 2. HSN codes master table will be seeded in M4 when the table is created.
  // For now, we just create the super admin.

  await sql.end();
  console.log('✅ Seed complete');
}

main().catch((e) => {
  console.error('Seed failed:', e);
  process.exit(1);
});
