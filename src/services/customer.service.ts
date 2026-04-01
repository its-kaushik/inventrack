import { eq, and, asc, desc, ilike, gt, sql } from 'drizzle-orm';
import { db } from '../config/database.js';
import { customers } from '../db/schema/customers.js';
import { ledgerEntries } from '../db/schema/ledger-entries.js';
import { cashRegisters, cashRegisterEntries } from '../db/schema/cash-registers.js';
import { NotFoundError, DuplicateEntryError } from '../lib/errors.js';
import * as ledgerService from './ledger.service.js';
import type { GeneralPaymentMode } from '../types/enums.js';

export async function listCustomers(tenantId: string, filters: {
  search?: string; withBalance?: boolean; limit?: number; offset?: number;
} = {}) {
  const conditions: any[] = [eq(customers.tenantId, tenantId), eq(customers.isActive, true)];
  if (filters.search) {
    conditions.push(ilike(customers.name, `%${filters.search}%`));
  }
  if (filters.withBalance) {
    conditions.push(gt(customers.outstandingBalance, '0'));
  }

  const limit = Math.min(filters.limit || 50, 100);
  const offset = filters.offset || 0;

  return db.select().from(customers)
    .where(and(...conditions))
    .orderBy(asc(customers.name))
    .limit(limit)
    .offset(offset);
}

export async function getCustomerById(tenantId: string, id: string) {
  const [customer] = await db.select().from(customers)
    .where(and(eq(customers.id, id), eq(customers.tenantId, tenantId)))
    .limit(1);
  if (!customer) throw new NotFoundError('Customer', id);
  return customer;
}

export async function createCustomer(tenantId: string, userId: string, input: {
  name: string; phone: string; email?: string; address?: string;
}) {
  try {
    const [customer] = await db.insert(customers).values({
      tenantId, createdBy: userId, ...input,
    }).returning();
    return customer;
  } catch (err: any) {
    if (err.code === '23505') throw new DuplicateEntryError('Customer', 'phone');
    throw err;
  }
}

export async function updateCustomer(tenantId: string, id: string, patch: Record<string, unknown>) {
  const [updated] = await db.update(customers).set(patch)
    .where(and(eq(customers.id, id), eq(customers.tenantId, tenantId)))
    .returning();
  if (!updated) throw new NotFoundError('Customer', id);
  return updated;
}

export async function searchByPhone(tenantId: string, phone: string) {
  return db.select().from(customers)
    .where(and(eq(customers.tenantId, tenantId), ilike(customers.phone, `%${phone}%`), eq(customers.isActive, true)))
    .limit(10);
}

export async function getCustomerLedger(tenantId: string, customerId: string, limit = 50, offset = 0) {
  const entries = await db.execute(
    sql`SELECT *, SUM(CAST(debit AS numeric) - CAST(credit AS numeric)) OVER (ORDER BY created_at) AS running_balance
        FROM ledger_entries
        WHERE tenant_id = ${tenantId} AND party_type = 'customer' AND party_id = ${customerId}
        ORDER BY created_at DESC
        LIMIT ${limit + 1} OFFSET ${offset}`
  );

  const hasMore = entries.length > limit;
  if (hasMore) entries.pop();

  return { entries, hasMore };
}

export async function recordCustomerPayment(
  tenantId: string, userId: string, customerId: string,
  input: { amount: number; paymentMode: GeneralPaymentMode; paymentReference?: string; description?: string }
) {
  return db.transaction(async (tx) => {
    // Create ledger entry (credit = payment received)
    const entry = await ledgerService.createEntry(tx, {
      tenantId,
      partyType: 'customer',
      partyId: customerId,
      entryType: 'payment',
      debit: 0,
      credit: input.amount,
      paymentMode: input.paymentMode,
      paymentReference: input.paymentReference,
      description: input.description || 'Payment received',
      createdBy: userId,
    });

    // Atomic balance decrease
    await ledgerService.updateCustomerBalance(tx, tenantId, customerId, -input.amount);

    // If cash payment, add to cash register
    if (input.paymentMode === 'cash') {
      const [register] = await tx.select({ id: cashRegisters.id })
        .from(cashRegisters)
        .where(and(eq(cashRegisters.tenantId, tenantId), eq(cashRegisters.userId, userId), eq(cashRegisters.status, 'open')))
        .limit(1);

      if (register) {
        await tx.insert(cashRegisterEntries).values({
          registerId: register.id,
          type: 'credit_collection',
          amount: String(input.amount), // inflow
          referenceType: 'ledger_entry',
          referenceId: entry.id,
          description: `Payment from customer`,
        });
      }
    }

    return entry;
  });
}
