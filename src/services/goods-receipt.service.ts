import { eq, and, isNull, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { goodsReceipts, goodsReceiptItems } from '../db/schema/purchases.js';
import { suppliers, supplierTransactions } from '../db/schema/suppliers.js';
import { productVariants, inventoryMovements } from '../db/schema/products.js';
import { incrementStock } from '../lib/stock-manager.js';
import { calculateWAC } from '../lib/wac-calculator.js';
import { AppError } from '../types/errors.js';
import { AuditRepository } from '../repositories/audit.repository.js';
import { enqueueJob } from '../jobs/worker.js';
import { nanoid } from 'nanoid';

const auditRepo = new AuditRepository(db);

function generateReceiptNumber(): string {
  return `GR-${Date.now().toString(36).toUpperCase()}-${nanoid(4).toUpperCase()}`;
}

function calculateDueDate(paymentTerms: string, invoiceDate?: string): string | null {
  if (!invoiceDate) return null;
  const base = new Date(invoiceDate);
  switch (paymentTerms) {
    case 'net_15': base.setDate(base.getDate() + 15); break;
    case 'net_30': base.setDate(base.getDate() + 30); break;
    case 'net_60': base.setDate(base.getDate() + 60); break;
    case 'cod':
    case 'advance':
    default: return null;
  }
  return base.toISOString().split('T')[0];
}

export async function createGoodsReceipt(
  tenantId: string,
  userId: string,
  data: {
    supplierId: string;
    supplierInvoiceNo?: string;
    supplierInvoiceDate?: string;
    supplierInvoiceUrl?: string;
    paymentMode: 'paid' | 'credit' | 'partial';
    amountPaid: number;
    items: Array<{
      variantId: string;
      quantity: number;
      costPrice: number;
      cgstAmount?: number;
      sgstAmount?: number;
      igstAmount?: number;
    }>;
  },
) {
  return db.transaction(async (tx) => {
    // 1. Validate supplier exists and is not soft-deleted
    const [supplier] = await tx
      .select()
      .from(suppliers)
      .where(
        and(eq(suppliers.id, data.supplierId), eq(suppliers.tenantId, tenantId), isNull(suppliers.deletedAt)),
      );
    if (!supplier) throw new AppError('NOT_FOUND', 'Supplier not found or deactivated', 404);

    // 2. Calculate totals
    let totalAmount = 0;
    let totalGst = 0;
    for (const item of data.items) {
      totalAmount += item.costPrice * item.quantity;
      totalGst += (item.cgstAmount ?? 0) + (item.sgstAmount ?? 0) + (item.igstAmount ?? 0);
    }

    const receiptNumber = generateReceiptNumber();
    const paymentDueDate = calculateDueDate(supplier.paymentTerms, data.supplierInvoiceDate);

    // 3. Create goods_receipts record
    const [receipt] = await tx
      .insert(goodsReceipts)
      .values({
        tenantId,
        receiptNumber,
        supplierId: data.supplierId,
        supplierInvoiceNo: data.supplierInvoiceNo ?? null,
        supplierInvoiceDate: data.supplierInvoiceDate ?? null,
        supplierInvoiceUrl: data.supplierInvoiceUrl ?? null,
        paymentMode: data.paymentMode,
        amountPaid: String(data.amountPaid),
        totalAmount: String(totalAmount),
        totalGst: String(totalGst),
        paymentDueDate,
        createdBy: userId,
      })
      .returning();

    const processedItems: Array<{
      variantId: string;
      quantity: number;
      costPrice: number;
      previousStock: number;
      newStock: number;
      previousWac: number;
      newWac: number;
      wasNegative: boolean;
    }> = [];

    // 4. Process each item
    for (const item of data.items) {
      // Create goods_receipt_items record
      await tx.insert(goodsReceiptItems).values({
        goodsReceiptId: receipt.id,
        variantId: item.variantId,
        quantity: item.quantity,
        costPrice: String(item.costPrice),
        cgstAmount: String(item.cgstAmount ?? 0),
        sgstAmount: String(item.sgstAmount ?? 0),
        igstAmount: String(item.igstAmount ?? 0),
      });

      // Fetch current variant state
      const [variant] = await tx
        .select()
        .from(productVariants)
        .where(and(eq(productVariants.id, item.variantId), eq(productVariants.tenantId, tenantId)));

      if (!variant) throw new AppError('NOT_FOUND', `Product variant ${item.variantId} not found`, 404);

      const wasNegative = variant.availableQuantity < 0;
      const previousStock = variant.availableQuantity;
      const previousWac = Number(variant.weightedAvgCost);

      // Recalculate WAC
      const newWac = calculateWAC(
        variant.availableQuantity,
        previousWac,
        item.quantity,
        item.costPrice,
      );

      // Update stock with optimistic locking
      const updated = await incrementStock(
        tx,
        tenantId,
        item.variantId,
        item.quantity,
        variant.version,
      );

      // Update WAC and cost_price on variant
      await tx
        .update(productVariants)
        .set({
          weightedAvgCost: String(newWac),
          costPrice: String(item.costPrice), // Latest purchase cost
        })
        .where(eq(productVariants.id, item.variantId));

      // Create inventory movement
      await tx.insert(inventoryMovements).values({
        tenantId,
        variantId: item.variantId,
        movementType: 'purchase',
        quantity: item.quantity,
        referenceType: 'goods_receipt',
        referenceId: receipt.id,
        costPriceAtMovement: String(item.costPrice),
        balanceAfter: updated.availableQuantity,
        notes: wasNegative
          ? `Purchase receipt. Negative stock reconciled (was ${previousStock}).`
          : 'Purchase receipt',
        createdBy: userId,
      });

      processedItems.push({
        variantId: item.variantId,
        quantity: item.quantity,
        costPrice: item.costPrice,
        previousStock,
        newStock: updated.availableQuantity,
        previousWac,
        newWac,
        wasNegative,
      });

      // Enqueue low stock check (stock increased, might clear a low-stock flag)
      await enqueueJob('check-low-stock', { tenantId, variantId: item.variantId });
    }

    // 5. Handle credit — update supplier outstanding balance
    const creditAmount = totalAmount + totalGst - data.amountPaid;
    if (creditAmount > 0 && (data.paymentMode === 'credit' || data.paymentMode === 'partial')) {
      const currentBalance = Number(supplier.outstandingBalance);
      const newBalance = currentBalance + creditAmount;

      await tx
        .update(suppliers)
        .set({ outstandingBalance: String(newBalance), updatedAt: new Date() })
        .where(eq(suppliers.id, data.supplierId));

      // Create supplier transaction
      await tx.insert(supplierTransactions).values({
        tenantId,
        supplierId: data.supplierId,
        type: 'purchase_credit',
        amount: String(creditAmount), // Positive = we owe more
        balanceAfter: String(newBalance),
        referenceType: 'goods_receipt',
        referenceId: receipt.id,
        notes: `Purchase on credit. Invoice: ${data.supplierInvoiceNo ?? 'N/A'}`,
        createdBy: userId,
      });
    }

    // 6. Audit log
    await auditRepo.withTransaction(tx).log({
      tenantId,
      userId,
      action: 'goods_receipt_created',
      entityType: 'goods_receipt',
      entityId: receipt.id,
      newValue: {
        receiptNumber,
        supplierId: data.supplierId,
        itemCount: data.items.length,
        totalAmount,
        creditAmount: creditAmount > 0 ? creditAmount : 0,
        negativeStockReconciled: processedItems.filter((i) => i.wasNegative).length,
      },
    });

    return {
      ...receipt,
      items: processedItems,
      creditAmount: creditAmount > 0 ? creditAmount : 0,
    };
  });
}

export async function getGoodsReceiptById(tenantId: string, receiptId: string) {
  const [receipt] = await db
    .select()
    .from(goodsReceipts)
    .where(and(eq(goodsReceipts.id, receiptId), eq(goodsReceipts.tenantId, tenantId)));

  if (!receipt) throw new AppError('NOT_FOUND', 'Goods receipt not found', 404);

  const items = await db
    .select()
    .from(goodsReceiptItems)
    .where(eq(goodsReceiptItems.goodsReceiptId, receiptId));

  return { ...receipt, items };
}

export async function listGoodsReceipts(
  tenantId: string,
  opts?: { supplierId?: string; page?: number; limit?: number },
) {
  const page = opts?.page ?? 1;
  const limit = opts?.limit ?? 50;
  const offset = (page - 1) * limit;

  const conditions = [eq(goodsReceipts.tenantId, tenantId)];
  if (opts?.supplierId) conditions.push(eq(goodsReceipts.supplierId, opts.supplierId));

  const where = and(...conditions);

  const data = await db
    .select()
    .from(goodsReceipts)
    .where(where)
    .orderBy(sql`${goodsReceipts.createdAt} DESC`)
    .limit(limit)
    .offset(offset);

  return { data, page, limit };
}
