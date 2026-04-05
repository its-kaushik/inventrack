import { eq, and } from 'drizzle-orm';
import { db } from '../db/client.js';
import { sales, saleItems } from '../db/schema/sales.js';
import { salesReturns, salesReturnItems } from '../db/schema/returns.js';
import { customers, customerTransactions } from '../db/schema/customers.js';
import { productVariants, inventoryMovements } from '../db/schema/products.js';
import { tenantSettings } from '../db/schema/tenants.js';
import { incrementStock } from '../lib/stock-manager.js';
import { AppError } from '../types/errors.js';
import { AuditRepository } from '../repositories/audit.repository.js';
import { nanoid } from 'nanoid';
import type { AuthContext } from '../types/context.js';

const auditRepo = new AuditRepository(db);

type ReturnReason = 'size_issue' | 'defect' | 'changed_mind' | 'color_mismatch' | 'other';

export async function processReturn(
  auth: AuthContext,
  data: {
    originalSaleId: string;
    returnType: 'full' | 'partial' | 'exchange';
    items: Array<{ saleItemId: string; quantity: number; reason: ReturnReason }>;
    refundMode: 'cash' | 'khata' | 'exchange' | 'store_credit';
  },
) {
  const tenantId = auth.tenantId!;

  return db.transaction(async (tx) => {
    // 1. Fetch original sale
    const [sale] = await tx.select().from(sales)
      .where(and(eq(sales.id, data.originalSaleId), eq(sales.tenantId, tenantId)));
    if (!sale) throw new AppError('NOT_FOUND', 'Original sale not found', 404);
    if (sale.status === 'cancelled') throw new AppError('CONFLICT', 'Cannot return a cancelled sale', 409);

    // 2. Validate return window
    const [settings] = await tx.select({ returnWindowDays: tenantSettings.returnWindowDays })
      .from(tenantSettings).where(eq(tenantSettings.tenantId, tenantId));
    const windowDays = settings?.returnWindowDays ?? 7;
    const saleAgeMs = Date.now() - new Date(sale.createdAt).getTime();
    const isWithinWindow = saleAgeMs <= windowDays * 24 * 60 * 60 * 1000;

    // Fetch all original sale items
    const originalItems = await tx.select().from(saleItems).where(eq(saleItems.saleId, sale.id));

    // 3. Calculate refund from ORIGINAL bill prices (not current)
    let totalRefundAmount = 0;
    const returnItems: Array<{
      saleItemId: string;
      variantId: string | null;
      quantity: number;
      refundAmount: number;
      reason: ReturnReason;
      version: number;
    }> = [];

    for (const item of data.items) {
      const originalItem = originalItems.find((oi) => oi.id === item.saleItemId);
      if (!originalItem) throw new AppError('NOT_FOUND', `Sale item ${item.saleItemId} not found`, 404);
      if (item.quantity > originalItem.quantity) {
        throw new AppError('VALIDATION_ERROR', `Return quantity (${item.quantity}) exceeds original (${originalItem.quantity})`, 400);
      }

      // Refund = original unit price × return qty (from original bill, not current MRP)
      const unitPrice = Number(originalItem.unitPrice);
      const refundAmount = Math.round(unitPrice * item.quantity * 100) / 100;
      totalRefundAmount += refundAmount;

      // Get variant version for stock restore
      let version = 1;
      if (originalItem.variantId) {
        const [variant] = await tx.select({ version: productVariants.version })
          .from(productVariants).where(eq(productVariants.id, originalItem.variantId));
        version = variant?.version ?? 1;
      }

      returnItems.push({
        saleItemId: item.saleItemId,
        variantId: originalItem.variantId,
        quantity: item.quantity,
        refundAmount,
        reason: item.reason,
        version,
      });
    }

    // 4. Khata interaction
    const [customer] = await tx.select().from(customers).where(eq(customers.id, sale.customerId));
    if (!customer) throw new AppError('NOT_FOUND', 'Customer not found', 404);

    let khataAdjustment = 0;
    let cashRefund = totalRefundAmount;

    const customerBalance = Number(customer.outstandingBalance);
    if (customerBalance > 0 && data.refundMode !== 'exchange') {
      // Auto-reduce khata first
      khataAdjustment = Math.min(totalRefundAmount, customerBalance);
      cashRefund = totalRefundAmount - khataAdjustment;

      // Update customer balance
      const newBalance = customerBalance - khataAdjustment;
      await tx.update(customers)
        .set({ outstandingBalance: String(newBalance), updatedAt: new Date() })
        .where(eq(customers.id, sale.customerId));

      // Create customer transaction for khata adjustment
      await tx.insert(customerTransactions).values({
        tenantId,
        customerId: sale.customerId,
        type: 'return_adjustment',
        amount: String(-khataAdjustment), // Negative = they owe less
        balanceAfter: String(newBalance),
        referenceType: 'return',
        notes: `Return against bill ${sale.billNumber}`,
        createdBy: auth.userId,
      });
    }

    const returnNumber = `RET-${Date.now().toString(36).toUpperCase()}-${nanoid(4).toUpperCase()}`;

    // 5. Create sales_returns record
    const [returnRecord] = await tx.insert(salesReturns).values({
      tenantId,
      returnNumber,
      originalSaleId: data.originalSaleId,
      customerId: sale.customerId,
      returnType: data.returnType,
      totalRefundAmount: String(totalRefundAmount),
      refundMode: data.refundMode,
      khataAdjustment: String(khataAdjustment),
      cashRefund: String(cashRefund),
      isWithinWindow,
      processedBy: auth.userId,
    }).returning();

    // 6. Create return items + restore stock
    for (const item of returnItems) {
      await tx.insert(salesReturnItems).values({
        salesReturnId: returnRecord.id,
        saleItemId: item.saleItemId,
        variantId: item.variantId,
        quantity: item.quantity,
        refundAmount: String(item.refundAmount),
        reason: item.reason,
      });

      // Restore stock
      if (item.variantId) {
        const updated = await incrementStock(tx, tenantId, item.variantId, item.quantity, item.version);

        await tx.insert(inventoryMovements).values({
          tenantId,
          variantId: item.variantId,
          movementType: 'sale_return',
          quantity: item.quantity,
          referenceType: 'sales_return',
          referenceId: returnRecord.id,
          balanceAfter: updated.availableQuantity,
          notes: `Return: ${item.reason}`,
          createdBy: auth.userId,
        });
      }
    }

    // 7. Update original sale status
    const isFullReturn = data.returnType === 'full';
    await tx.update(sales)
      .set({
        status: isFullReturn ? 'returned' : 'partially_returned',
        updatedAt: new Date(),
      })
      .where(eq(sales.id, data.originalSaleId));

    // 8. Audit log
    await auditRepo.withTransaction(tx).log({
      tenantId,
      userId: auth.userId,
      action: 'sales_return_processed',
      entityType: 'sales_return',
      entityId: returnRecord.id,
      newValue: {
        returnNumber,
        originalBill: sale.billNumber,
        returnType: data.returnType,
        totalRefundAmount,
        khataAdjustment,
        cashRefund,
        isWithinWindow,
        itemCount: returnItems.length,
      },
    });

    return {
      ...returnRecord,
      items: returnItems,
      isWithinWindow,
    };
  });
}

export async function getReturnById(tenantId: string, returnId: string) {
  const [returnRecord] = await db.select().from(salesReturns)
    .where(and(eq(salesReturns.id, returnId), eq(salesReturns.tenantId, tenantId)));
  if (!returnRecord) throw new AppError('NOT_FOUND', 'Return not found', 404);

  const items = await db.select().from(salesReturnItems)
    .where(eq(salesReturnItems.salesReturnId, returnId));

  return { ...returnRecord, items };
}

export async function listReturns(tenantId: string) {
  return db.select().from(salesReturns)
    .where(eq(salesReturns.tenantId, tenantId))
    .orderBy(salesReturns.createdAt);
}
