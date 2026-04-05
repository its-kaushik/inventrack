import { eq, and, isNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import { customers, customerTransactions } from '../db/schema/customers.js';
import { suppliers, supplierTransactions } from '../db/schema/suppliers.js';
import { parseCsv } from '../lib/csv-parser.js';
import { AuditRepository } from '../repositories/audit.repository.js';

const auditRepo = new AuditRepository(db);

// ── CSV Templates ──

export const TEMPLATES = {
  customers: 'name,phone,outstanding_balance\nRahul Sharma,9876543210,5000\nPriya Patel,9876543211,2500',
  suppliers: 'name,phone,gstin,outstanding_balance\nValbone Textiles,9876500001,27AABCU9603R1ZM,15000\nArrow Trading,9876500002,,8000',
};

// ── Customer Khata Import ──

export async function importCustomerKhata(
  tenantId: string,
  userId: string,
  csvContent: string,
) {
  const { rows, errors: parseErrors } = parseCsv(csvContent, ['name', 'phone', 'outstanding_balance']);

  if (parseErrors.length > 0) {
    return { imported: 0, skipped: 0, errors: parseErrors.map((e) => ({ row: 0, reason: e })) };
  }

  const results = { imported: 0, skipped: 0, errors: [] as Array<{ row: number; reason: string }> };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // 1-indexed, header is row 1

    try {
      // Validate
      if (!row.name) {
        results.errors.push({ row: rowNum, reason: 'Name is required' });
        continue;
      }
      if (!row.phone || !/^\d{10}$/.test(row.phone)) {
        results.errors.push({ row: rowNum, reason: 'Phone must be 10 digits' });
        continue;
      }

      const balance = parseFloat(row.outstanding_balance) || 0;

      // Check duplicate phone
      const [existing] = await db
        .select({ id: customers.id })
        .from(customers)
        .where(
          and(eq(customers.tenantId, tenantId), eq(customers.phone, row.phone), isNull(customers.deletedAt)),
        );

      if (existing) {
        results.skipped++;
        results.errors.push({ row: rowNum, reason: `Duplicate phone: ${row.phone}` });
        continue;
      }

      // Create customer
      const [customer] = await db
        .insert(customers)
        .values({
          tenantId,
          name: row.name,
          phone: row.phone,
          outstandingBalance: String(balance),
        })
        .returning();

      // Create opening balance transaction
      if (balance > 0) {
        await db.insert(customerTransactions).values({
          tenantId,
          customerId: customer.id,
          type: 'opening_balance',
          amount: String(balance),
          balanceAfter: String(balance),
          referenceType: 'migration',
          notes: 'Opening balance imported from paper khata',
          createdBy: userId,
        });
      }

      results.imported++;
    } catch (err: any) {
      results.errors.push({ row: rowNum, reason: err.message || 'Unknown error' });
    }
  }

  await auditRepo.log({
    tenantId,
    userId,
    action: 'customer_khata_imported',
    entityType: 'migration',
    metadata: { imported: results.imported, skipped: results.skipped, errors: results.errors.length },
  });

  return results;
}

// ── Supplier Balance Import ──

export async function importSupplierBalances(
  tenantId: string,
  userId: string,
  csvContent: string,
) {
  const { rows, errors: parseErrors } = parseCsv(csvContent, ['name', 'phone', 'outstanding_balance']);

  if (parseErrors.length > 0) {
    return { imported: 0, skipped: 0, errors: parseErrors.map((e) => ({ row: 0, reason: e })) };
  }

  const results = { imported: 0, skipped: 0, errors: [] as Array<{ row: number; reason: string }> };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;

    try {
      if (!row.name) {
        results.errors.push({ row: rowNum, reason: 'Name is required' });
        continue;
      }

      const balance = parseFloat(row.outstanding_balance) || 0;

      // Create supplier
      const [supplier] = await db
        .insert(suppliers)
        .values({
          tenantId,
          name: row.name,
          phone: row.phone || null,
          gstin: row.gstin || null,
          outstandingBalance: String(balance),
        })
        .returning();

      // Create opening balance transaction
      if (balance > 0) {
        await db.insert(supplierTransactions).values({
          tenantId,
          supplierId: supplier.id,
          type: 'opening_balance',
          amount: String(balance),
          balanceAfter: String(balance),
          referenceType: 'migration',
          notes: 'Opening balance imported from paper records',
          createdBy: userId,
        });
      }

      results.imported++;
    } catch (err: any) {
      results.errors.push({ row: rowNum, reason: err.message || 'Unknown error' });
    }
  }

  await auditRepo.log({
    tenantId,
    userId,
    action: 'supplier_balances_imported',
    entityType: 'migration',
    metadata: { imported: results.imported, skipped: results.skipped, errors: results.errors.length },
  });

  return results;
}
