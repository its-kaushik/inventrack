import { eq, and, asc, desc, ilike, sql } from 'drizzle-orm';
import { db } from '../config/database.js';
import { suppliers } from '../db/schema/suppliers.js';
import { ledgerEntries } from '../db/schema/ledger-entries.js';
import { purchaseItems } from '../db/schema/purchases.js';
import { products } from '../db/schema/products.js';
import { cashRegisters, cashRegisterEntries } from '../db/schema/cash-registers.js';
import { NotFoundError, DuplicateEntryError } from '../lib/errors.js';
import * as ledgerService from './ledger.service.js';
import type { GeneralPaymentMode } from '../types/enums.js';

export async function listSuppliers(tenantId: string, search?: string) {
  const conditions: any[] = [eq(suppliers.tenantId, tenantId), eq(suppliers.isActive, true)];
  if (search) conditions.push(ilike(suppliers.name, `%${search}%`));

  return db.select().from(suppliers)
    .where(and(...conditions))
    .orderBy(asc(suppliers.name));
}

export async function getSupplierById(tenantId: string, id: string) {
  const [supplier] = await db.select().from(suppliers)
    .where(and(eq(suppliers.id, id), eq(suppliers.tenantId, tenantId)))
    .limit(1);
  if (!supplier) throw new NotFoundError('Supplier', id);
  return supplier;
}

export async function createSupplier(tenantId: string, input: {
  name: string; contactPerson?: string; phone?: string; email?: string;
  address?: string; gstin?: string; paymentTerms?: string; notes?: string;
}) {
  const [supplier] = await db.insert(suppliers).values({ tenantId, ...input }).returning();
  return supplier;
}

export async function updateSupplier(tenantId: string, id: string, patch: Record<string, unknown>) {
  const [updated] = await db.update(suppliers).set(patch)
    .where(and(eq(suppliers.id, id), eq(suppliers.tenantId, tenantId)))
    .returning();
  if (!updated) throw new NotFoundError('Supplier', id);
  return updated;
}

export async function getSupplierLedger(tenantId: string, supplierId: string, limit = 50, offset = 0) {
  // Running balance computed via window function — NOT stored
  const entries = await db.execute(
    sql`SELECT *, SUM(CAST(debit AS numeric) - CAST(credit AS numeric)) OVER (ORDER BY created_at) AS running_balance
        FROM ledger_entries
        WHERE tenant_id = ${tenantId} AND party_type = 'supplier' AND party_id = ${supplierId}
        ORDER BY created_at DESC
        LIMIT ${limit + 1} OFFSET ${offset}`
  );

  const hasMore = entries.length > limit;
  if (hasMore) entries.pop();

  return { entries, hasMore };
}

export async function recordSupplierPayment(
  tenantId: string, userId: string, supplierId: string,
  input: { amount: number; paymentMode: GeneralPaymentMode; paymentReference?: string; description?: string }
) {
  return db.transaction(async (tx) => {
    // Create ledger entry (credit = payment made)
    const entry = await ledgerService.createEntry(tx, {
      tenantId,
      partyType: 'supplier',
      partyId: supplierId,
      entryType: 'payment',
      debit: 0,
      credit: input.amount,
      paymentMode: input.paymentMode,
      paymentReference: input.paymentReference,
      description: input.description || 'Payment to supplier',
      createdBy: userId,
    });

    // Atomic balance decrease
    await ledgerService.updateSupplierBalance(tx, tenantId, supplierId, -input.amount);

    // If cash payment, add to cash register
    if (input.paymentMode === 'cash') {
      const [register] = await tx.select({ id: cashRegisters.id })
        .from(cashRegisters)
        .where(and(eq(cashRegisters.tenantId, tenantId), eq(cashRegisters.userId, userId), eq(cashRegisters.status, 'open')))
        .limit(1);

      if (register) {
        await tx.insert(cashRegisterEntries).values({
          registerId: register.id,
          type: 'supplier_payment',
          amount: String(-input.amount), // outflow
          referenceType: 'ledger_entry',
          referenceId: entry.id,
          description: `Payment to supplier`,
        });
      }
    }

    return entry;
  });
}

export async function getSupplierProducts(tenantId: string, supplierId: string) {
  // Get distinct products from purchases by this supplier
  const result = await db.execute(
    sql`SELECT DISTINCT p.id, p.name, p.sku, p.barcode, p.selling_price, p.cost_price
        FROM purchase_items pi
        JOIN purchases pu ON pi.purchase_id = pu.id
        JOIN products p ON pi.product_id = p.id
        WHERE pu.tenant_id = ${tenantId} AND pu.supplier_id = ${supplierId} AND p.is_active = true
        ORDER BY p.name`
  );
  return result;
}
