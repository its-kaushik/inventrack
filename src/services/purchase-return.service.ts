import { eq, and } from 'drizzle-orm';
import { db } from '../config/database.js';
import { purchases } from '../db/schema/purchases.js';
import { stockEntries } from '../db/schema/stock-entries.js';
import { Decimal, decimalSum, toDbDecimal } from '../lib/money.js';
import { NotFoundError } from '../lib/errors.js';
import * as ledgerService from './ledger.service.js';

// ======================== TYPES ========================

interface CreatePurchaseReturnInput {
  purchaseId: string;
  reason?: string;
  items: Array<{
    productId: string;
    quantity: number;
    costPrice: number;
  }>;
}

// ======================== CREATE PURCHASE RETURN ========================

export async function createPurchaseReturn(
  tenantId: string,
  userId: string,
  input: CreatePurchaseReturnInput,
) {
  return db.transaction(async (tx) => {
    // 1. Fetch original purchase and validate
    const [purchase] = await tx
      .select()
      .from(purchases)
      .where(and(eq(purchases.id, input.purchaseId), eq(purchases.tenantId, tenantId)))
      .limit(1);

    if (!purchase) throw new NotFoundError('Purchase', input.purchaseId);

    // 2. Process each return item
    const computedItems: Array<{
      productId: string;
      quantity: number;
      costPrice: number;
      returnAmount: Decimal;
    }> = [];

    for (const item of input.items) {
      // Insert negative stock entry (stock going out to supplier)
      await tx.insert(stockEntries).values({
        tenantId,
        productId: item.productId,
        quantity: -item.quantity,
        type: 'return_supplier',
        referenceType: 'purchase_return',
        referenceId: input.purchaseId,
        costPriceAtEntry: String(item.costPrice),
        createdBy: userId,
      });

      const returnAmount = new Decimal(item.costPrice).times(item.quantity).toDecimalPlaces(2);
      computedItems.push({
        productId: item.productId,
        quantity: item.quantity,
        costPrice: item.costPrice,
        returnAmount,
      });
    }

    // 3. Compute total return amount
    const totalReturnAmount = decimalSum(computedItems, (i) => i.returnAmount);

    // 4. Create supplier ledger entry (credit = reduces what we owe)
    await ledgerService.createEntry(tx, {
      tenantId,
      partyType: 'supplier',
      partyId: purchase.supplierId,
      entryType: 'return',
      debit: 0,
      credit: toDbDecimal(totalReturnAmount),
      referenceType: 'purchase_return',
      referenceId: input.purchaseId,
      description: `Purchase return${input.reason ? ': ' + input.reason : ''}`,
      createdBy: userId,
    });

    // 5. Update supplier balance (negative = reduces outstanding)
    await ledgerService.updateSupplierBalance(
      tx,
      tenantId,
      purchase.supplierId,
      -toDbDecimal(totalReturnAmount),
    );

    return {
      purchaseId: input.purchaseId,
      totalReturnAmount: toDbDecimal(totalReturnAmount),
      itemsReturned: computedItems.length,
    };
  });
}
