import { eq, and, isNull, gt, desc, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { customers, customerTransactions } from '../db/schema/customers.js';
import { suppliers, supplierTransactions } from '../db/schema/suppliers.js';

// ──────────────── Customer Khata (Receivables) ────────────────

export interface AgingBucket {
  range: string;
  count: number;
  totalAmount: number;
}

export async function getCustomerKhataSummary(tenantId: string) {
  // All customers with outstanding balance > 0
  const customersWithBalance = await db
    .select({
      id: customers.id,
      name: customers.name,
      phone: customers.phone,
      outstandingBalance: customers.outstandingBalance,
      lastVisitAt: customers.lastVisitAt,
      createdAt: customers.createdAt,
    })
    .from(customers)
    .where(
      and(
        eq(customers.tenantId, tenantId),
        isNull(customers.deletedAt),
        gt(customers.outstandingBalance, '0'),
      ),
    )
    .orderBy(desc(customers.outstandingBalance));

  // Calculate aging buckets based on last credit transaction date
  const now = Date.now();
  const buckets = { '0-30d': { count: 0, total: 0 }, '30-60d': { count: 0, total: 0 }, '60-90d': { count: 0, total: 0 }, '90d+': { count: 0, total: 0 } };

  for (const c of customersWithBalance) {
    // Find the oldest unpaid credit transaction
    const [oldestCredit] = await db
      .select({ createdAt: customerTransactions.createdAt })
      .from(customerTransactions)
      .where(
        and(
          eq(customerTransactions.tenantId, tenantId),
          eq(customerTransactions.customerId, c.id),
          eq(customerTransactions.type, 'sale_credit'),
        ),
      )
      .orderBy(customerTransactions.createdAt)
      .limit(1);

    const ageMs = oldestCredit ? now - new Date(oldestCredit.createdAt).getTime() : 0;
    const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
    const balance = Number(c.outstandingBalance);

    if (ageDays <= 30) { buckets['0-30d'].count++; buckets['0-30d'].total += balance; }
    else if (ageDays <= 60) { buckets['30-60d'].count++; buckets['30-60d'].total += balance; }
    else if (ageDays <= 90) { buckets['60-90d'].count++; buckets['60-90d'].total += balance; }
    else { buckets['90d+'].count++; buckets['90d+'].total += balance; }
  }

  const totalReceivable = customersWithBalance.reduce((sum, c) => sum + Number(c.outstandingBalance), 0);

  return {
    totalReceivable: Math.round(totalReceivable * 100) / 100,
    customerCount: customersWithBalance.length,
    customers: customersWithBalance.map((c) => ({
      ...c,
      outstandingBalance: Number(c.outstandingBalance),
    })),
    aging: [
      { range: '0-30 days', count: buckets['0-30d'].count, totalAmount: Math.round(buckets['0-30d'].total * 100) / 100 },
      { range: '30-60 days', count: buckets['30-60d'].count, totalAmount: Math.round(buckets['30-60d'].total * 100) / 100 },
      { range: '60-90 days', count: buckets['60-90d'].count, totalAmount: Math.round(buckets['60-90d'].total * 100) / 100 },
      { range: '90+ days', count: buckets['90d+'].count, totalAmount: Math.round(buckets['90d+'].total * 100) / 100 },
    ],
  };
}

// ──────────────── Supplier Payables ────────────────

export async function getSupplierPayablesSummary(tenantId: string) {
  // All suppliers with outstanding balance > 0 (positive = we owe them)
  const suppliersWithBalance = await db
    .select({
      id: suppliers.id,
      name: suppliers.name,
      phone: suppliers.phone,
      outstandingBalance: suppliers.outstandingBalance,
      paymentTerms: suppliers.paymentTerms,
      createdAt: suppliers.createdAt,
    })
    .from(suppliers)
    .where(
      and(
        eq(suppliers.tenantId, tenantId),
        isNull(suppliers.deletedAt),
        gt(suppliers.outstandingBalance, '0'),
      ),
    )
    .orderBy(desc(suppliers.outstandingBalance));

  // Aging buckets based on oldest purchase credit
  const now = Date.now();
  const buckets = { '0-30d': { count: 0, total: 0 }, '30-60d': { count: 0, total: 0 }, '60-90d': { count: 0, total: 0 }, '90d+': { count: 0, total: 0 } };

  for (const s of suppliersWithBalance) {
    const [oldestCredit] = await db
      .select({ createdAt: supplierTransactions.createdAt })
      .from(supplierTransactions)
      .where(
        and(
          eq(supplierTransactions.tenantId, tenantId),
          eq(supplierTransactions.supplierId, s.id),
          eq(supplierTransactions.type, 'purchase_credit'),
        ),
      )
      .orderBy(supplierTransactions.createdAt)
      .limit(1);

    const ageMs = oldestCredit ? now - new Date(oldestCredit.createdAt).getTime() : 0;
    const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
    const balance = Number(s.outstandingBalance);

    if (ageDays <= 30) { buckets['0-30d'].count++; buckets['0-30d'].total += balance; }
    else if (ageDays <= 60) { buckets['30-60d'].count++; buckets['30-60d'].total += balance; }
    else if (ageDays <= 90) { buckets['60-90d'].count++; buckets['60-90d'].total += balance; }
    else { buckets['90d+'].count++; buckets['90d+'].total += balance; }
  }

  const totalPayable = suppliersWithBalance.reduce((sum, s) => sum + Number(s.outstandingBalance), 0);

  return {
    totalPayable: Math.round(totalPayable * 100) / 100,
    supplierCount: suppliersWithBalance.length,
    suppliers: suppliersWithBalance.map((s) => ({
      ...s,
      outstandingBalance: Number(s.outstandingBalance),
    })),
    aging: [
      { range: '0-30 days', count: buckets['0-30d'].count, totalAmount: Math.round(buckets['0-30d'].total * 100) / 100 },
      { range: '30-60 days', count: buckets['30-60d'].count, totalAmount: Math.round(buckets['30-60d'].total * 100) / 100 },
      { range: '60-90 days', count: buckets['60-90d'].count, totalAmount: Math.round(buckets['60-90d'].total * 100) / 100 },
      { range: '90+ days', count: buckets['90d+'].count, totalAmount: Math.round(buckets['90d+'].total * 100) / 100 },
    ],
  };
}
