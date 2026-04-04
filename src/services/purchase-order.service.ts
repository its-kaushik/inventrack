import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../config/database.js';
import { purchaseOrders, purchaseOrderItems } from '../db/schema/purchases.js';
import { Decimal, decimalSum, toDbDecimal } from '../lib/money.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import * as billNumberService from './bill-number.service.js';

// ======================== TYPES ========================

interface CreatePurchaseOrderInput {
  supplierId: string;
  notes?: string;
  items: Array<{
    productId: string;
    orderedQty: number;
    expectedCost: number;
  }>;
}

interface UpdatePurchaseOrderInput {
  notes?: string;
  status?: 'sent' | 'cancelled';
}

// ======================== ALLOWED TRANSITIONS ========================

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  draft: ['sent', 'cancelled'],
  sent: ['cancelled'],
};

// ======================== CREATE ========================

export async function createPurchaseOrder(
  tenantId: string,
  userId: string,
  input: CreatePurchaseOrderInput,
) {
  return db.transaction(async (tx) => {
    // Generate PO number
    const poNumber = await billNumberService.next(tx, tenantId, 'po');

    // Compute expectedTotal
    const expectedTotal = decimalSum(input.items, (item) =>
      new Decimal(item.orderedQty).times(item.expectedCost),
    );

    // Insert purchase order
    const [po] = await tx
      .insert(purchaseOrders)
      .values({
        tenantId,
        poNumber,
        supplierId: input.supplierId,
        status: 'draft',
        expectedTotal: String(toDbDecimal(expectedTotal)),
        notes: input.notes ?? null,
        createdBy: userId,
      })
      .returning();

    // Insert purchase order items
    const items = [];
    for (const item of input.items) {
      const [poItem] = await tx
        .insert(purchaseOrderItems)
        .values({
          poId: po.id,
          productId: item.productId,
          orderedQty: item.orderedQty,
          expectedCost: String(item.expectedCost),
        })
        .returning();
      items.push(poItem);
    }

    return { ...po, items };
  });
}

// ======================== LIST ========================

export async function listPurchaseOrders(
  tenantId: string,
  filters: {
    supplierId?: string;
    status?: string;
    limit?: number;
    offset?: number;
  },
) {
  const conditions: any[] = [eq(purchaseOrders.tenantId, tenantId)];
  if (filters.supplierId) conditions.push(eq(purchaseOrders.supplierId, filters.supplierId));
  if (filters.status) conditions.push(eq(purchaseOrders.status, filters.status as any));

  const limit = Math.min(filters.limit || 20, 100);
  const offset = filters.offset || 0;

  const items = await db
    .select()
    .from(purchaseOrders)
    .where(and(...conditions))
    .orderBy(desc(purchaseOrders.createdAt))
    .limit(limit + 1)
    .offset(offset);

  const hasMore = items.length > limit;
  if (hasMore) items.pop();

  return { items, hasMore };
}

// ======================== GET BY ID ========================

export async function getPurchaseOrderById(tenantId: string, poId: string) {
  const [po] = await db
    .select()
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.id, poId), eq(purchaseOrders.tenantId, tenantId)))
    .limit(1);

  if (!po) throw new NotFoundError('PurchaseOrder', poId);

  const items = await db.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.poId, poId));

  return { ...po, items };
}

// ======================== UPDATE ========================

export async function updatePurchaseOrder(
  tenantId: string,
  poId: string,
  patch: UpdatePurchaseOrderInput,
) {
  const [po] = await db
    .select()
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.id, poId), eq(purchaseOrders.tenantId, tenantId)))
    .limit(1);

  if (!po) throw new NotFoundError('PurchaseOrder', poId);

  // Validate status transition
  if (patch.status) {
    const allowed = ALLOWED_TRANSITIONS[po.status] ?? [];
    if (!allowed.includes(patch.status)) {
      throw new ValidationError(`Cannot transition PO from '${po.status}' to '${patch.status}'`);
    }
  }

  const updateFields: Record<string, any> = { updatedAt: new Date() };
  if (patch.notes !== undefined) updateFields.notes = patch.notes;
  if (patch.status) updateFields.status = patch.status;

  const [updated] = await db
    .update(purchaseOrders)
    .set(updateFields)
    .where(and(eq(purchaseOrders.id, poId), eq(purchaseOrders.tenantId, tenantId)))
    .returning();

  return updated;
}
