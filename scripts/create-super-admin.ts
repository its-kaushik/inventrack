import 'dotenv/config';
import postgres from 'postgres';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

async function main() {
  const name = process.argv[2] || 'Super Admin';
  const email = process.argv[3] || 'admin@inventrack.com';
  const password = process.argv[4] || 'admin123456';

  const url = process.env.DATABASE_URL!;
  const sql = postgres(url, { ssl: url.includes('supabase') ? 'require' : undefined });

  console.log('Creating super admin...');
  const hash = await bcrypt.hash(password, 12);

  const [admin] = await sql`
    INSERT INTO super_admins (id, name, email, password_hash)
    VALUES (${randomUUID()}, ${name}, ${email}, ${hash})
    ON CONFLICT (email) DO NOTHING
    RETURNING id, name, email
  `;

  if (admin) {
    console.log(`Super admin created: ${admin.name} (${admin.email})`);
  } else {
    console.log(`Super admin with email ${email} already exists.`);
  }

  await sql.end();
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
