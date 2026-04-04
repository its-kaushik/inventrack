import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../config/database.js';
import { tenants } from '../db/schema/tenants.js';
import { products } from '../db/schema/products.js';
import {
  purchases,
  purchaseItems,
  purchaseOrders,
  purchaseOrderItems,
} from '../db/schema/purchases.js';
import { stockEntries } from '../db/schema/stock-entries.js';
import { Decimal } from '../lib/money.js';
import { NotFoundError } from '../lib/errors.js';
import * as ledgerService from './ledger.service.js';

interface CreatePurchaseInput {
  supplierId: string;
  poId?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  invoiceImageUrl?: string;
  totalAmount: number;
  cgstAmount?: number;
  sgstAmount?: number;
  igstAmount?: number;
  isRcm?: boolean;
  items: Array<{
    productId: string;
    quantity: number;
    costPrice: number;
    gstRate?: number;
    gstAmount?: number;
  }>;
}

export async function createPurchase(tenantId: string, userId: string, input: CreatePurchaseInput) {
  return db.transaction(async (tx) => {
    // Get tenant GST scheme
    const [tenant] = await tx
      .select({ gstScheme: tenants.gstScheme })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    const isComposition = tenant?.gstScheme === 'composition';

    // 1. Insert purchase record
    const [purchase] = await tx
      .insert(purchases)
      .values({
        tenantId,
        poId: input.poId ?? null,
        supplierId: input.supplierId,
        invoiceNumber: input.invoiceNumber,
        invoiceDate: input.invoiceDate,
        invoiceImageUrl: input.invoiceImageUrl,
        totalAmount: String(input.totalAmount),
        cgstAmount: String(input.cgstAmount ?? 0),
        sgstAmount: String(input.sgstAmount ?? 0),
        igstAmount: String(input.igstAmount ?? 0),
        isRcm: input.isRcm ?? false,
        createdBy: userId,
      })
      .returning();

    // 2. Process each item
    for (const item of input.items) {
      // Insert purchase item
      await tx.insert(purchaseItems).values({
        purchaseId: purchase.id,
        productId: item.productId,
        quantity: item.quantity,
        costPrice: String(item.costPrice),
        gstRate: String(item.gstRate ?? 0),
        gstAmount: String(item.gstAmount ?? 0),
      });

      // 3. Insert stock entry (positive = stock in)
      await tx.insert(stockEntries).values({
        tenantId,
        productId: item.productId,
        quantity: item.quantity,
        type: 'purchase',
        referenceType: 'purchase',
        referenceId: purchase.id,
        costPriceAtEntry: String(item.costPrice),
        createdBy: userId,
      });

      // 4. Recalculate average cost (with zero-stock guard)
      const [product] = await tx
        .select({
          costPrice: products.costPrice,
          currentStock: products.currentStock,
        })
        .from(products)
        .where(and(eq(products.id, item.productId), eq(products.tenantId, tenantId)))
        .limit(1);

      if (!product) continue;

      // current_stock has already been updated by the trigger at this point
      // We need the stock BEFORE this entry to calculate correctly
      const stockBefore = product.currentStock - item.quantity;

      let newAvgCost: number;
      if (stockBefore <= 0) {
        // Zero-stock guard: new purchase becomes entire cost basis
        newAvgCost = item.costPrice;
      } else {
        const oldTotal = new Decimal(product.costPrice).times(stockBefore);
        const newTotal = new Decimal(item.costPrice).times(item.quantity);
        newAvgCost = oldTotal
          .plus(newTotal)
          .div(stockBefore + item.quantity)
          .toDecimalPlaces(2)
          .toNumber();
      }

      // For composition scheme: GST is absorbed into cost
      if (isComposition && item.gstAmount) {
        const gstPerUnit = new Decimal(item.gstAmount).div(item.quantity).toDecimalPlaces(2);
        newAvgCost = new Decimal(newAvgCost).plus(gstPerUnit).toDecimalPlaces(2).toNumber();
      }

      await tx
        .update(products)
        .set({ costPrice: String(newAvgCost) })
        .where(and(eq(products.id, item.productId), eq(products.tenantId, tenantId)));
    }

    // 5. Update PO received quantities if linked
    if (input.poId) {
      for (const item of input.items) {
        await tx.execute(
          sql`UPDATE purchase_order_items SET received_qty = received_qty + ${item.quantity} WHERE po_id = ${input.poId} AND product_id = ${item.productId}`,
        );
      }

      // Check if PO is fully received
      const poItems = await tx
        .select({
          orderedQty: purchaseOrderItems.orderedQty,
          receivedQty: purchaseOrderItems.receivedQty,
        })
        .from(purchaseOrderItems)
        .where(eq(purchaseOrderItems.poId, input.poId));

      const fullyReceived = poItems.every((pi) => pi.receivedQty >= pi.orderedQty);
      const newStatus = fullyReceived ? 'received' : 'partially_received';

      await tx
        .update(purchaseOrders)
        .set({ status: newStatus, updatedAt: new Date() })
        .where(eq(purchaseOrders.id, input.poId));
    }

    // 6. Create supplier ledger entry (debit = amount owed)
    await ledgerService.createEntry(tx, {
      tenantId,
      partyType: 'supplier',
      partyId: input.supplierId,
      entryType: 'purchase',
      debit: input.totalAmount,
      credit: 0,
      referenceType: 'purchase',
      referenceId: purchase.id,
      description: `Purchase ${input.invoiceNumber || ''}`.trim(),
      createdBy: userId,
    });

    // 7. Update supplier outstanding balance
    await ledgerService.updateSupplierBalance(tx, tenantId, input.supplierId, input.totalAmount);

    return purchase;
  });
}

export async function listPurchases(
  tenantId: string,
  filters: {
    supplierId?: string;
    limit?: number;
    offset?: number;
  },
) {
  const conditions: any[] = [eq(purchases.tenantId, tenantId)];
  if (filters.supplierId) conditions.push(eq(purchases.supplierId, filters.supplierId));

  const limit = Math.min(filters.limit || 20, 100);
  const offset = filters.offset || 0;

  const items = await db
    .select()
    .from(purchases)
    .where(and(...conditions))
    .orderBy(desc(purchases.createdAt))
    .limit(limit + 1)
    .offset(offset);

  const hasMore = items.length > limit;
  if (hasMore) items.pop();

  return { items, hasMore };
}

export async function getPurchaseById(tenantId: string, purchaseId: string) {
  const [purchase] = await db
    .select()
    .from(purchases)
    .where(and(eq(purchases.id, purchaseId), eq(purchases.tenantId, tenantId)))
    .limit(1);

  if (!purchase) throw new NotFoundError('Purchase', purchaseId);

  const items = await db
    .select()
    .from(purchaseItems)
    .where(eq(purchaseItems.purchaseId, purchaseId));

  return { ...purchase, items };
}
