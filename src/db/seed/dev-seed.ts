import 'dotenv/config';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../schema/index.js';
import { defaultCategories, defaultSizeSystems } from './defaults.js';
import { DEFAULT_TENANT_SETTINGS } from '../../lib/constants.js';

async function main() {
  const url = process.env.DATABASE_URL!;
  const sql = postgres(url, { ssl: url.includes('supabase') ? 'require' : undefined });
  const db = drizzle(sql, { schema });

  console.log('Seeding development data...');

  // Check if dev tenant already exists (idempotent)
  const [existing] = await db
    .select({ id: schema.tenants.id })
    .from(schema.tenants)
    .where(eq(schema.tenants.name, 'Kaushik Vastra Bhandar'))
    .limit(1);

  if (existing) {
    console.log('Dev tenant already exists. Skipping seed.');
    await sql.end();
    return;
  }

  const passwordHash = await bcrypt.hash('password123', 12);

  // 1. Create tenant
  const [tenant] = await db
    .insert(schema.tenants)
    .values({
      name: 'Kaushik Vastra Bhandar',
      address: 'Main Market, City Center',
      phone: '9876543210',
      email: 'kaushik@example.com',
      gstin: '09ABCDE1234F1Z5',
      gstScheme: 'regular',
      invoicePrefix: 'KVB',
      settings: DEFAULT_TENANT_SETTINGS,
      setupComplete: true,
    })
    .returning();

  console.log(`  Tenant: ${tenant.name} (${tenant.id})`);

  // 2. Create users
  const users = [
    { name: 'Kaushik (Owner)', phone: '9876543210', role: 'owner' as const },
    { name: 'Ramesh (Manager)', phone: '9876543211', role: 'manager' as const },
    { name: 'Suresh (Sales)', phone: '9876543212', role: 'salesperson' as const },
  ];

  for (const u of users) {
    const [user] = await db
      .insert(schema.users)
      .values({
        tenantId: tenant.id,
        name: u.name,
        phone: u.phone,
        passwordHash,
        role: u.role,
      })
      .returning({ id: schema.users.id, name: schema.users.name, role: schema.users.role });
    console.log(`  User: ${user.name} (${user.role}) — phone: ${u.phone}, password: password123`);
  }

  // 3. Seed categories
  const categoryMap: Record<string, string> = {};
  for (const cat of defaultCategories) {
    const [created] = await db
      .insert(schema.categories)
      .values({
        tenantId: tenant.id,
        name: cat.name,
        code: cat.code,
        sortOrder: cat.sortOrder,
      })
      .returning();
    categoryMap[cat.code] = created.id;
  }
  console.log(`  Categories: ${defaultCategories.length} seeded`);

  // 4. Seed size systems
  for (const ss of defaultSizeSystems) {
    await db.insert(schema.sizeSystems).values({
      tenantId: tenant.id,
      name: ss.name,
      values: ss.values,
    });
  }
  console.log(`  Size systems: ${defaultSizeSystems.length} seeded`);

  // 5. Create brands
  const [rupa] = await db
    .insert(schema.brands)
    .values({ tenantId: tenant.id, name: 'Rupa', code: 'RPA' })
    .returning();
  const [dollar] = await db
    .insert(schema.brands)
    .values({ tenantId: tenant.id, name: 'Dollar', code: 'DLR' })
    .returning();
  console.log(`  Brands: Rupa, Dollar`);

  // 6. Create sample products
  const sampleProducts = [
    {
      name: 'Rupa RN Vest - L',
      sku: 'MVT-RPA-RN-L-001',
      categoryCode: 'MVT',
      brandId: rupa.id,
      size: 'L',
      sellingPrice: '350',
      costPrice: '200',
      gstRate: '5',
    },
    {
      name: 'Rupa RN Vest - XL',
      sku: 'MVT-RPA-RN-XL-001',
      categoryCode: 'MVT',
      brandId: rupa.id,
      size: 'XL',
      sellingPrice: '380',
      costPrice: '220',
      gstRate: '5',
    },
    {
      name: 'Dollar Boxer - M',
      sku: 'MUW-DLR-BXR-M-001',
      categoryCode: 'MUW',
      brandId: dollar.id,
      size: 'M',
      sellingPrice: '250',
      costPrice: '140',
      gstRate: '5',
    },
    {
      name: 'Slim Fit Jeans - 32',
      sku: 'JNS-DLR-SLM-32-001',
      categoryCode: 'JNS',
      brandId: dollar.id,
      size: '32',
      sellingPrice: '1200',
      costPrice: '700',
      gstRate: '12',
    },
    {
      name: 'Kids T-Shirt Combo - 4-5Y',
      sku: 'KDW-RPA-TSC-45-001',
      categoryCode: 'KDW',
      brandId: rupa.id,
      size: '4-5Y',
      sellingPrice: '450',
      costPrice: '250',
      gstRate: '5',
    },
  ];

  for (const p of sampleProducts) {
    await db.insert(schema.products).values({
      tenantId: tenant.id,
      name: p.name,
      sku: p.sku,
      barcode: p.sku,
      categoryId: categoryMap[p.categoryCode],
      brandId: p.brandId,
      size: p.size,
      sellingPrice: p.sellingPrice,
      costPrice: p.costPrice,
      gstRate: p.gstRate,
      catalogDiscountPct: '15',
      minStockLevel: 10,
    });
  }
  console.log(`  Products: ${sampleProducts.length} seeded`);

  // 7. Create a sample supplier
  await db.insert(schema.suppliers).values({
    tenantId: tenant.id,
    name: 'Rupa & Company Ltd',
    contactPerson: 'Vikram Shah',
    phone: '9111111111',
    gstin: '24ABCDE5678F1Z5',
    paymentTerms: 'Net 30',
  });
  console.log(`  Supplier: Rupa & Company Ltd`);

  // 8. Create a sample customer
  await db.insert(schema.customers).values({
    tenantId: tenant.id,
    name: 'Rahul Sharma',
    phone: '8888888888',
  });
  console.log(`  Customer: Rahul Sharma`);

  console.log('\nDev seed complete! Login with phone: 9876543210, password: password123');
  await sql.end();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
