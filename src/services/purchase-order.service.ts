import { eq, and, isNull, desc, count, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  purchaseOrders,
  purchaseOrderItems,
  purchaseReturns,
  purchaseReturnItems,
  goodsReceiptItems,
} from '../db/schema/purchases.js';
import { suppliers, supplierTransactions } from '../db/schema/suppliers.js';
import { productVariants, inventoryMovements } from '../db/schema/products.js';
import { decrementStock } from '../lib/stock-manager.js';
import { AppError } from '../types/errors.js';
import { AuditRepository } from '../repositories/audit.repository.js';
import { nanoid } from 'nanoid';

const auditRepo = new AuditRepository(db);

function generatePONumber(): string {
  return `PO-${Date.now().toString(36).toUpperCase()}-${nanoid(4).toUpperCase()}`;
}

// ──────────────── Purchase Order CRUD ────────────────

export async function createPurchaseOrder(
  tenantId: string,
  userId: string,
  data: {
    supplierId: string;
    expectedDate?: string;
    notes?: string;
    items: Array<{ variantId: string; orderedQuantity: number; expectedCostPrice: number }>;
  },
) {
  return db.transaction(async (tx) => {
    // Validate supplier
    const [supplier] = await tx
      .select({ id: suppliers.id })
      .from(suppliers)
      .where(and(eq(suppliers.id, data.supplierId), eq(suppliers.tenantId, tenantId), isNull(suppliers.deletedAt)));
    if (!supplier) throw new AppError('NOT_FOUND', 'Supplier not found', 404);

    const totalAmount = data.items.reduce(
      (sum, i) => sum + i.orderedQuantity * i.expectedCostPrice, 0,
    );

    const [po] = await tx
      .insert(purchaseOrders)
      .values({
        tenantId,
        poNumber: generatePONumber(),
        supplierId: data.supplierId,
        expectedDate: data.expectedDate ?? null,
        totalAmount: String(totalAmount),
        notes: data.notes ?? null,
        createdBy: userId,
      })
      .returning();

    for (const item of data.items) {
      await tx.insert(purchaseOrderItems).values({
        purchaseOrderId: po.id,
        variantId: item.variantId,
        orderedQuantity: item.orderedQuantity,
        expectedCostPrice: String(item.expectedCostPrice),
      });
    }

    await auditRepo.withTransaction(tx).log({
      tenantId, userId, action: 'po_created', entityType: 'purchase_order', entityId: po.id,
      newValue: { poNumber: po.poNumber, supplierId: data.supplierId, itemCount: data.items.length, totalAmount },
    });

    return po;
  });
}

export async function listPurchaseOrders(
  tenantId: string,
  opts?: { supplierId?: string; status?: string; page?: number; limit?: number },
) {
  const page = opts?.page ?? 1;
  const limit = opts?.limit ?? 50;
  const offset = (page - 1) * limit;

  const conditions = [eq(purchaseOrders.tenantId, tenantId)];
  if (opts?.supplierId) conditions.push(eq(purchaseOrders.supplierId, opts.supplierId));
  if (opts?.status) conditions.push(eq(purchaseOrders.status, opts.status as any));

  const where = and(...conditions);

  const [data, totalResult] = await Promise.all([
    db.select().from(purchaseOrders).where(where).orderBy(desc(purchaseOrders.createdAt)).limit(limit).offset(offset),
    db.select({ total: count() }).from(purchaseOrders).where(where),
  ]);

  return { data, total: totalResult[0]?.total ?? 0, page, limit };
}

export async function getPurchaseOrderById(tenantId: string, poId: string) {
  const [po] = await db.select().from(purchaseOrders)
    .where(and(eq(purchaseOrders.id, poId), eq(purchaseOrders.tenantId, tenantId)));
  if (!po) throw new AppError('NOT_FOUND', 'Purchase order not found', 404);

  const items = await db.select().from(purchaseOrderItems)
    .where(eq(purchaseOrderItems.purchaseOrderId, poId));

  return { ...po, items };
}

export async function updatePurchaseOrder(
  tenantId: string,
  poId: string,
  userId: string,
  data: { expectedDate?: string; notes?: string },
) {
  const [po] = await db.select().from(purchaseOrders)
    .where(and(eq(purchaseOrders.id, poId), eq(purchaseOrders.tenantId, tenantId)));
  if (!po) throw new AppError('NOT_FOUND', 'Purchase order not found', 404);
  if (po.status !== 'draft') throw new AppError('CONFLICT', 'Can only edit draft POs', 409);

  const [updated] = await db.update(purchaseOrders)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(purchaseOrders.id, poId))
    .returning();
  return updated;
}

export async function updatePOStatus(tenantId: string, poId: string, userId: string, status: string) {
  const [po] = await db.select().from(purchaseOrders)
    .where(and(eq(purchaseOrders.id, poId), eq(purchaseOrders.tenantId, tenantId)));
  if (!po) throw new AppError('NOT_FOUND', 'Purchase order not found', 404);

  // Validate transitions
  const validTransitions: Record<string, string[]> = {
    draft: ['sent', 'cancelled'],
    sent: ['partially_received', 'fully_received', 'cancelled'],
    partially_received: ['fully_received', 'cancelled'],
  };

  if (!validTransitions[po.status]?.includes(status)) {
    throw new AppError('CONFLICT', `Cannot transition from '${po.status}' to '${status}'`, 409);
  }

  const [updated] = await db.update(purchaseOrders)
    .set({ status: status as any, updatedAt: new Date() })
    .where(eq(purchaseOrders.id, poId))
    .returning();

  await auditRepo.log({
    tenantId, userId, action: 'po_status_changed', entityType: 'purchase_order', entityId: poId,
    newValue: { from: po.status, to: status },
  });

  return updated;
}

export async function cancelPurchaseOrder(tenantId: string, poId: string, userId: string) {
  return updatePOStatus(tenantId, poId, userId, 'cancelled');
}

/**
 * After a goods receipt is linked to a PO, update received quantities and PO status.
 */
export async function updatePOFromReceipt(
  tx: typeof db,
  poId: string,
  receivedItems: Array<{ variantId: string; quantity: number }>,
) {
  for (const item of receivedItems) {
    await tx.update(purchaseOrderItems)
      .set({ receivedQuantity: sql`${purchaseOrderItems.receivedQuantity} + ${item.quantity}` })
      .where(
        and(
          eq(purchaseOrderItems.purchaseOrderId, poId),
          eq(purchaseOrderItems.variantId, item.variantId),
        ),
      );
  }

  // Check if fully received
  const items = await tx.select().from(purchaseOrderItems)
    .where(eq(purchaseOrderItems.purchaseOrderId, poId));

  const allReceived = items.every((i) => i.receivedQuantity >= i.orderedQuantity);
  const anyReceived = items.some((i) => i.receivedQuantity > 0);

  const newStatus = allReceived ? 'fully_received' : anyReceived ? 'partially_received' : undefined;
  if (newStatus) {
    await tx.update(purchaseOrders)
      .set({ status: newStatus, updatedAt: new Date() })
      .where(eq(purchaseOrders.id, poId));
  }
}

// ──────────────── Purchase Returns ────────────────

export async function createPurchaseReturn(
  tenantId: string,
  userId: string,
  data: {
    supplierId: string;
    goodsReceiptId?: string;
    reason?: string;
    items: Array<{ variantId: string; quantity: number; costPrice: number }>;
  },
) {
  return db.transaction(async (tx) => {
    // Validate supplier
    const [supplier] = await tx.select().from(suppliers)
      .where(and(eq(suppliers.id, data.supplierId), eq(suppliers.tenantId, tenantId), isNull(suppliers.deletedAt)));
    if (!supplier) throw new AppError('NOT_FOUND', 'Supplier not found', 404);

    const totalAmount = data.items.reduce((sum, i) => sum + i.quantity * i.costPrice, 0);
    const returnNumber = `PR-${Date.now().toString(36).toUpperCase()}-${nanoid(4).toUpperCase()}`;

    // Create return record
    const [returnRecord] = await tx.insert(purchaseReturns).values({
      tenantId,
      returnNumber,
      supplierId: data.supplierId,
      goodsReceiptId: data.goodsReceiptId ?? null,
      totalAmount: String(totalAmount),
      reason: data.reason ?? null,
      createdBy: userId,
    }).returning();

    for (const item of data.items) {
      // Create return item
      await tx.insert(purchaseReturnItems).values({
        purchaseReturnId: returnRecord.id,
        variantId: item.variantId,
        quantity: item.quantity,
        costPrice: String(item.costPrice),
      });

      // Decrement stock
      const [variant] = await tx.select({ version: productVariants.version })
        .from(productVariants).where(eq(productVariants.id, item.variantId));
      if (!variant) throw new AppError('NOT_FOUND', `Variant ${item.variantId} not found`, 404);

      const updated = await decrementStock(tx, tenantId, item.variantId, item.quantity, variant.version);

      // Create inventory movement
      await tx.insert(inventoryMovements).values({
        tenantId,
        variantId: item.variantId,
        movementType: 'purchase_return',
        quantity: -item.quantity,
        referenceType: 'purchase_return',
        referenceId: returnRecord.id,
        costPriceAtMovement: String(item.costPrice),
        balanceAfter: updated.availableQuantity,
        notes: `Return to supplier: ${data.reason ?? 'N/A'}`,
        createdBy: userId,
      });
    }

    // Adjust supplier balance (reduce what we owe)
    const currentBalance = Number(supplier.outstandingBalance);
    const newBalance = currentBalance - totalAmount;

    await tx.update(suppliers)
      .set({ outstandingBalance: String(newBalance), updatedAt: new Date() })
      .where(eq(suppliers.id, data.supplierId));

    await tx.insert(supplierTransactions).values({
      tenantId,
      supplierId: data.supplierId,
      type: 'return_adjustment',
      amount: String(-totalAmount),
      balanceAfter: String(newBalance),
      referenceType: 'purchase_return',
      referenceId: returnRecord.id,
      notes: `Purchase return: ${data.reason ?? 'N/A'}`,
      createdBy: userId,
    });

    await auditRepo.withTransaction(tx).log({
      tenantId, userId, action: 'purchase_return_created', entityType: 'purchase_return',
      entityId: returnRecord.id,
      newValue: { returnNumber, supplierId: data.supplierId, totalAmount, itemCount: data.items.length },
    });

    return returnRecord;
  });
}
