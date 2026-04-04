import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../config/database.js';
import { tenants } from '../db/schema/tenants.js';
import { bills, billItems } from '../db/schema/bills.js';
import { returns, returnItems } from '../db/schema/returns.js';
import { stockEntries } from '../db/schema/stock-entries.js';
import { cashRegisters, cashRegisterEntries } from '../db/schema/cash-registers.js';
import { Decimal, decimalSum, toDbDecimal } from '../lib/money.js';
import { NotFoundError, ValidationError, ReturnWindowExpiredError } from '../lib/errors.js';
import { DEFAULT_TENANT_SETTINGS } from '../lib/constants.js';
import * as billNumberService from './bill-number.service.js';
import * as ledgerService from './ledger.service.js';
import type { UserRole, RefundMode } from '../types/enums.js';

// ======================== TYPES ========================

interface ProcessReturnInput {
  originalBillId: string;
  refundMode: RefundMode;
  reason?: string;
  items: Array<{ billItemId: string; quantity: number }>;
  exchangeBillId?: string;
}

// ======================== HELPERS ========================

function daysBetween(dateA: Date, dateB: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor(Math.abs(dateB.getTime() - dateA.getTime()) / msPerDay);
}

// ======================== PROCESS RETURN ========================

export async function processReturn(
  tenantId: string,
  userId: string,
  role: UserRole,
  input: ProcessReturnInput,
) {
  return db.transaction(async (tx) => {
    // 1. Fetch original bill and verify status
    const [bill] = await tx
      .select()
      .from(bills)
      .where(and(eq(bills.id, input.originalBillId), eq(bills.tenantId, tenantId)))
      .limit(1);

    if (!bill) throw new NotFoundError('Bill', input.originalBillId);

    if (bill.status !== 'completed' && bill.status !== 'partially_returned') {
      throw new ValidationError(
        `Cannot process return for bill with status '${bill.status}'. Only completed or partially returned bills are eligible.`,
      );
    }

    // 2. Check return window
    const [tenant] = await tx
      .select({ settings: tenants.settings })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    const settings = (tenant?.settings ?? {}) as Record<string, unknown>;
    const returnWindowDays =
      typeof settings.return_window_days === 'number'
        ? settings.return_window_days
        : DEFAULT_TENANT_SETTINGS.return_window_days;

    const daysSinceSale = daysBetween(new Date(bill.createdAt), new Date());

    if (daysSinceSale > returnWindowDays && role === 'salesperson') {
      throw new ReturnWindowExpiredError();
    }

    // 3. Validate each return item and compute refund amounts
    const computedItems: Array<{
      billItemId: string;
      quantity: number;
      refundAmount: Decimal;
      productId: string;
      costPrice: string;
    }> = [];

    for (const item of input.items) {
      const [billItem] = await tx
        .select()
        .from(billItems)
        .where(and(eq(billItems.id, item.billItemId), eq(billItems.billId, bill.id)))
        .limit(1);

      if (!billItem) throw new NotFoundError('BillItem', item.billItemId);

      const availableQty = billItem.quantity - billItem.returnedQty;
      if (item.quantity > availableQty) {
        throw new ValidationError(
          `Cannot return ${item.quantity} units of '${billItem.productName}' (SKU: ${billItem.sku}). Only ${availableQty} unit(s) eligible for return.`,
        );
      }

      // Refund amount computed from original line total, never current product master
      const refundAmount = new Decimal(billItem.lineTotal)
        .div(billItem.quantity)
        .times(item.quantity)
        .toDecimalPlaces(2);

      computedItems.push({
        billItemId: item.billItemId,
        quantity: item.quantity,
        refundAmount,
        productId: billItem.productId,
        costPrice: billItem.costPrice,
      });
    }

    // 4. Compute total refund amount
    const totalRefundAmount = decimalSum(computedItems, (i) => i.refundAmount);

    // 5. Generate return number
    const returnNumber = await billNumberService.next(tx, tenantId, 'return');

    // 6. Insert return record
    const [returnRecord] = await tx
      .insert(returns)
      .values({
        tenantId,
        originalBillId: input.originalBillId,
        returnNumber,
        refundMode: input.refundMode,
        refundAmount: String(toDbDecimal(totalRefundAmount)),
        reason: input.reason ?? null,
        processedBy: userId,
        exchangeBillId: input.exchangeBillId ?? null,
      })
      .returning();

    // 7. Insert return items
    for (const item of computedItems) {
      await tx.insert(returnItems).values({
        returnId: returnRecord.id,
        billItemId: item.billItemId,
        quantity: item.quantity,
        refundAmount: String(toDbDecimal(item.refundAmount)),
      });
    }

    // 8. Update billItem.returnedQty for each item
    for (const item of computedItems) {
      await tx.execute(
        sql`UPDATE bill_items SET returned_qty = returned_qty + ${item.quantity} WHERE id = ${item.billItemId}`,
      );
    }

    // 9. Check if bill is fully returned -> update bill status
    const updatedBillItems = await tx
      .select({ quantity: billItems.quantity, returnedQty: billItems.returnedQty })
      .from(billItems)
      .where(eq(billItems.billId, bill.id));

    const fullyReturned = updatedBillItems.every((bi) => bi.returnedQty >= bi.quantity);
    const newStatus = fullyReturned ? 'returned' : 'partially_returned';

    await tx.update(bills).set({ status: newStatus }).where(eq(bills.id, bill.id));

    // 10. Create positive stock entries (return_customer)
    for (const item of computedItems) {
      await tx.insert(stockEntries).values({
        tenantId,
        productId: item.productId,
        quantity: item.quantity, // positive — stock coming back in
        type: 'return_customer',
        referenceType: 'return',
        referenceId: returnRecord.id,
        costPriceAtEntry: item.costPrice,
        createdBy: userId,
      });
    }

    // 11. Handle refund mode
    if (input.refundMode === 'cash') {
      // Find open cash register for this user
      const [register] = await tx
        .select({ id: cashRegisters.id })
        .from(cashRegisters)
        .where(
          and(
            eq(cashRegisters.tenantId, tenantId),
            eq(cashRegisters.userId, userId),
            eq(cashRegisters.status, 'open'),
          ),
        )
        .limit(1);

      if (register) {
        await tx.insert(cashRegisterEntries).values({
          registerId: register.id,
          type: 'petty_expense',
          amount: String(-toDbDecimal(totalRefundAmount)), // negative — cash going out
          referenceType: 'return',
          referenceId: returnRecord.id,
          description: `Cash refund for return ${returnNumber}`,
        });
      }
    } else if (input.refundMode === 'credit_note') {
      // Only create ledger entry if the original bill had a customer
      if (bill.customerId) {
        await ledgerService.createEntry(tx, {
          tenantId,
          partyType: 'customer',
          partyId: bill.customerId,
          entryType: 'return',
          debit: 0,
          credit: toDbDecimal(totalRefundAmount),
          referenceType: 'return',
          referenceId: returnRecord.id,
          description: `Credit note for return ${returnNumber}`,
          createdBy: userId,
        });

        // Reduce customer outstanding balance (negative amount reduces what they owe)
        await ledgerService.updateCustomerBalance(
          tx,
          tenantId,
          bill.customerId,
          -toDbDecimal(totalRefundAmount),
        );
      }
    }
    // exchange mode: exchangeBillId is set on the return record; the caller handles the exchange bill separately

    // 12. Return the created return record
    return returnRecord;
  });
}

// ======================== LIST RETURNS ========================

export async function listReturns(
  tenantId: string,
  filters: {
    originalBillId?: string;
    limit?: number;
    offset?: number;
  },
) {
  const conditions: any[] = [eq(returns.tenantId, tenantId)];
  if (filters.originalBillId) {
    conditions.push(eq(returns.originalBillId, filters.originalBillId));
  }

  const limit = Math.min(filters.limit || 20, 100);
  const offset = filters.offset || 0;

  const items = await db
    .select()
    .from(returns)
    .where(and(...conditions))
    .orderBy(desc(returns.createdAt))
    .limit(limit + 1)
    .offset(offset);

  const hasMore = items.length > limit;
  if (hasMore) items.pop();

  return { items, hasMore };
}

// ======================== GET RETURN BY ID ========================

export async function getReturnById(tenantId: string, returnId: string) {
  const [returnRecord] = await db
    .select()
    .from(returns)
    .where(and(eq(returns.id, returnId), eq(returns.tenantId, tenantId)))
    .limit(1);

  if (!returnRecord) throw new NotFoundError('Return', returnId);

  const items = await db.select().from(returnItems).where(eq(returnItems.returnId, returnId));

  return { ...returnRecord, items };
}
