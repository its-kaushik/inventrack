import { eq, and, isNull, desc, count, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { sales, saleItems, salePayments, parkedBills } from '../db/schema/sales.js';
import { productVariants, products, inventoryMovements } from '../db/schema/products.js';
import { customers, customerTransactions } from '../db/schema/customers.js';
import { tenants, tenantSettings } from '../db/schema/tenants.js';
import { calculateDiscount } from '../lib/discount-engine.js';
import { calculateGst } from '../lib/gst-calculator.js';
import { roundToRupee, calculateRoundOff } from '../lib/currency.js';
import { generateBillNumber } from '../lib/bill-number.js';
import { decrementStock, incrementStock } from '../lib/stock-manager.js';
import { verifyApprovalToken } from './auth.service.js';
import { AppError } from '../types/errors.js';
import { AuditRepository } from '../repositories/audit.repository.js';
import { enqueueJob } from '../jobs/worker.js';
import { CONSTANTS } from '../config/constants.js';
import type { AuthContext } from '../types/context.js';

const auditRepo = new AuditRepository(db);

// ── Resolved item type after fetching variant data ──
interface ResolvedItem {
  variantId: string;
  productName: string;
  variantDescription: string;
  quantity: number;
  mrp: number;
  costAtSale: number;
  productDiscountPct: number;
  hsnCode: string | null;
  gstRate: number;
  version: number;
}

// ──────────────── Create Sale ────────────────

export async function createSale(
  auth: AuthContext,
  data: {
    customerId: string;
    items: Array<{ variantId: string; quantity: number }>;
    billDiscountPct: number;
    bargainAdjustment?: number;
    finalPrice?: number;
    payments: Array<{ method: 'cash' | 'upi' | 'card' | 'credit'; amount: number }>;
    approvalToken?: string;
    clientId?: string;
  },
) {
  const tenantId = auth.tenantId!;

  // Pre-transaction: check idempotency
  if (data.clientId) {
    const [existing] = await db
      .select({ id: sales.id, billNumber: sales.billNumber })
      .from(sales)
      .where(eq(sales.clientId, data.clientId));
    if (existing) return existing;
  }

  return db.transaction(async (tx) => {
    // 1. Fetch tenant settings + GST scheme
    const [tenant] = await tx.select().from(tenants).where(eq(tenants.id, tenantId));
    const [settings] = await tx
      .select()
      .from(tenantSettings)
      .where(eq(tenantSettings.tenantId, tenantId));

    if (!tenant || !settings) throw new AppError('NOT_FOUND', 'Tenant settings not found', 404);

    // 2. Validate customer exists
    const [customer] = await tx
      .select()
      .from(customers)
      .where(and(eq(customers.id, data.customerId), eq(customers.tenantId, tenantId), isNull(customers.deletedAt)));
    if (!customer) throw new AppError('NOT_FOUND', 'Customer not found', 404);

    // 3. Resolve cart items: fetch variant data, snapshot prices
    const resolvedItems: ResolvedItem[] = [];
    for (const item of data.items) {
      const [variant] = await tx
        .select()
        .from(productVariants)
        .where(and(eq(productVariants.id, item.variantId), eq(productVariants.tenantId, tenantId)));
      if (!variant) throw new AppError('NOT_FOUND', `Variant ${item.variantId} not found`, 404);

      const [product] = await tx
        .select({ name: products.name, hsnCode: products.hsnCode, gstRate: products.gstRate, productDiscountPct: products.productDiscountPct })
        .from(products)
        .where(eq(products.id, variant.productId));

      resolvedItems.push({
        variantId: variant.id,
        productName: product?.name ?? 'Unknown',
        variantDescription: variant.sku,
        quantity: item.quantity,
        mrp: Number(variant.mrp),
        costAtSale: Number(variant.weightedAvgCost),
        productDiscountPct: Number(product?.productDiscountPct ?? 0),
        hsnCode: product?.hsnCode ?? null,
        gstRate: Number(product?.gstRate ?? 0),
        version: variant.version,
      });
    }

    // 4. Run discount engine
    const discountResult = calculateDiscount({
      items: resolvedItems.map((i) => ({
        variantId: i.variantId,
        mrp: i.mrp,
        quantity: i.quantity,
        productDiscountPct: i.productDiscountPct,
      })),
      billDiscountPct: data.billDiscountPct,
      bargainAdjustment: data.bargainAdjustment,
      finalPrice: data.finalPrice,
    });

    // 5. Check discount cap
    const maxDiscount = Number(settings.maxDiscountPct);
    if (discountResult.effectiveDiscountPct > maxDiscount && auth.role !== 'owner') {
      if (!data.approvalToken) {
        throw new AppError(
          'DISCOUNT_EXCEEDS_LIMIT',
          `Discount ${discountResult.effectiveDiscountPct}% exceeds limit ${maxDiscount}%. Owner approval required.`,
          403,
        );
      }
      await verifyApprovalToken(data.approvalToken, tenantId);
    }

    // 6. Run GST calculator
    const gstResult = calculateGst(
      resolvedItems.map((i) => ({ variantId: i.variantId, gstRate: i.gstRate })),
      discountResult,
      tenant.gstScheme as 'composite' | 'regular',
    );

    // 7. Rounding
    const netPayable = roundToRupee(gstResult.total);
    const roundOff = calculateRoundOff(gstResult.total, netPayable);

    // 8. Generate bill number
    const billNumber = await generateBillNumber(tx, tenantId, settings.billNumberPrefix);

    // 9. Calculate total COGS
    const totalCogs = resolvedItems.reduce((sum, i) => sum + i.costAtSale * i.quantity, 0);

    // 10. Insert sales record
    const [sale] = await tx
      .insert(sales)
      .values({
        tenantId,
        billNumber,
        customerId: data.customerId,
        subtotalMrp: String(discountResult.subtotalMrp),
        productDiscountTotal: String(discountResult.productDiscountTotal),
        billDiscountPct: String(data.billDiscountPct),
        billDiscountAmount: String(discountResult.billDiscountAmount),
        bargainAdjustment: String(discountResult.bargainAdjustment),
        effectiveDiscountPct: String(discountResult.effectiveDiscountPct),
        subtotalTaxable: String(discountResult.subtotalTaxable),
        totalCgst: String(gstResult.totalCgst),
        totalSgst: String(gstResult.totalSgst),
        totalIgst: String(gstResult.totalIgst),
        roundOff: String(roundOff),
        netPayable: String(netPayable),
        totalCogs: String(totalCogs),
        gstScheme: tenant.gstScheme,
        billedBy: auth.userId,
        approvedBy: data.approvalToken ? auth.userId : null,
        clientId: data.clientId ?? null,
        isOffline: !!data.clientId,
      })
      .returning();

    // 11. Insert sale items (snapshot copies)
    for (const item of resolvedItems) {
      const gstItem = gstResult.items.find((g) => g.variantId === item.variantId);
      const unitPrice = item.mrp * (1 - item.productDiscountPct / 100);
      const lineTotal = unitPrice * item.quantity;

      await tx.insert(saleItems).values({
        saleId: sale.id,
        variantId: item.variantId,
        productName: item.productName,
        variantDescription: item.variantDescription,
        quantity: item.quantity,
        mrp: String(item.mrp),
        productDiscountPct: String(item.productDiscountPct),
        unitPrice: String(unitPrice),
        lineTotal: String(lineTotal),
        costAtSale: String(item.costAtSale),
        hsnCode: item.hsnCode,
        gstRate: String(item.gstRate),
        cgstAmount: String(gstItem?.cgstAmount ?? 0),
        sgstAmount: String(gstItem?.sgstAmount ?? 0),
        igstAmount: String(gstItem?.igstAmount ?? 0),
      });
    }

    // 12. Insert sale payments
    for (const payment of data.payments) {
      await tx.insert(salePayments).values({
        saleId: sale.id,
        paymentMethod: payment.method,
        amount: String(payment.amount),
      });
    }

    // 13. Decrement stock per variant + create inventory movements
    for (const item of resolvedItems) {
      const updated = await decrementStock(tx, tenantId, item.variantId, item.quantity, item.version);

      await tx.insert(inventoryMovements).values({
        tenantId,
        variantId: item.variantId,
        movementType: 'sale',
        quantity: -item.quantity,
        referenceType: 'sale',
        referenceId: sale.id,
        costPriceAtMovement: String(item.costAtSale),
        balanceAfter: updated.availableQuantity,
        createdBy: auth.userId,
      });

      // Enqueue low stock check
      await enqueueJob('check-low-stock', { tenantId, variantId: item.variantId });
    }

    // 14. Handle credit payment
    const creditPayment = data.payments.find((p) => p.method === 'credit');
    if (creditPayment && creditPayment.amount > 0) {
      const currentBalance = Number(customer.outstandingBalance);
      const newBalance = currentBalance + creditPayment.amount;

      await tx
        .update(customers)
        .set({ outstandingBalance: String(newBalance), updatedAt: new Date() })
        .where(eq(customers.id, data.customerId));

      await tx.insert(customerTransactions).values({
        tenantId,
        customerId: data.customerId,
        type: 'sale_credit',
        amount: String(creditPayment.amount),
        balanceAfter: String(newBalance),
        referenceType: 'sale',
        referenceId: sale.id,
        createdBy: auth.userId,
      });
    }

    // 15. Update customer stats
    await tx
      .update(customers)
      .set({
        totalSpend: sql`${customers.totalSpend}::numeric + ${netPayable}`,
        visitCount: sql`${customers.visitCount} + 1`,
        lastVisitAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(customers.id, data.customerId));

    // 16. Audit log
    await auditRepo.withTransaction(tx).log({
      tenantId,
      userId: auth.userId,
      action: 'sale_created',
      entityType: 'sale',
      entityId: sale.id,
      newValue: { billNumber, netPayable, itemCount: resolvedItems.length },
    });

    return sale;
  });
}

// ──────────────── List Sales ────────────────

export async function listSales(
  tenantId: string,
  opts?: { customerId?: string; status?: string; from?: Date; to?: Date; page?: number; limit?: number },
) {
  const page = opts?.page ?? 1;
  const limit = opts?.limit ?? 50;
  const offset = (page - 1) * limit;

  const conditions = [eq(sales.tenantId, tenantId)];
  if (opts?.customerId) conditions.push(eq(sales.customerId, opts.customerId));
  if (opts?.status) conditions.push(eq(sales.status, opts.status as any));
  if (opts?.from) conditions.push(sql`${sales.createdAt} >= ${opts.from.toISOString()}::timestamptz`);
  if (opts?.to) conditions.push(sql`${sales.createdAt} <= ${opts.to.toISOString()}::timestamptz`);

  const where = and(...conditions);

  const [data, totalResult] = await Promise.all([
    db.select().from(sales).where(where).orderBy(desc(sales.createdAt)).limit(limit).offset(offset),
    db.select({ total: count() }).from(sales).where(where),
  ]);

  return { data, total: totalResult[0]?.total ?? 0, page, limit };
}

// ──────────────── Get Sale Detail ────────────────

export async function getSaleById(tenantId: string, saleId: string) {
  const [sale] = await db
    .select()
    .from(sales)
    .where(and(eq(sales.id, saleId), eq(sales.tenantId, tenantId)));

  if (!sale) throw new AppError('NOT_FOUND', 'Sale not found', 404);

  const items = await db.select().from(saleItems).where(eq(saleItems.saleId, saleId));
  const payments = await db.select().from(salePayments).where(eq(salePayments.saleId, saleId));

  return { ...sale, items, payments };
}

// ──────────────── Park / Recall Bills ────────────────

export async function parkBill(
  tenantId: string,
  userId: string,
  data: { customerId?: string; cartData: Record<string, unknown> },
) {
  const expiresAt = new Date(Date.now() + CONSTANTS.JOBS.PARKED_BILL_EXPIRY_HOURS * 60 * 60 * 1000);

  const [parked] = await db
    .insert(parkedBills)
    .values({
      tenantId,
      customerId: data.customerId ?? null,
      cartData: data.cartData,
      parkedBy: userId,
      expiresAt,
    })
    .returning();

  return parked;
}

export async function listParkedBills(tenantId: string) {
  return db
    .select()
    .from(parkedBills)
    .where(and(eq(parkedBills.tenantId, tenantId), sql`${parkedBills.expiresAt} > NOW()`))
    .orderBy(desc(parkedBills.createdAt));
}

export async function recallParkedBill(tenantId: string, parkedBillId: string) {
  const [parked] = await db
    .select()
    .from(parkedBills)
    .where(and(eq(parkedBills.id, parkedBillId), eq(parkedBills.tenantId, tenantId)));

  if (!parked) throw new AppError('NOT_FOUND', 'Parked bill not found', 404);

  // Delete the parked bill
  await db.delete(parkedBills).where(eq(parkedBills.id, parkedBillId));

  return parked;
}

export async function deleteParkedBill(tenantId: string, parkedBillId: string) {
  const [deleted] = await db
    .delete(parkedBills)
    .where(and(eq(parkedBills.id, parkedBillId), eq(parkedBills.tenantId, tenantId)))
    .returning({ id: parkedBills.id });

  if (!deleted) throw new AppError('NOT_FOUND', 'Parked bill not found', 404);
}

// ──────────────── Void Sale ────────────────

export async function voidSale(
  auth: AuthContext,
  saleId: string,
  data: { reason: string; approvalToken: string },
) {
  const tenantId = auth.tenantId!;

  // 1. Verify approval token (Owner PIN required)
  await verifyApprovalToken(data.approvalToken, tenantId);

  return db.transaction(async (tx) => {
    // 2. Fetch the sale
    const [sale] = await tx
      .select()
      .from(sales)
      .where(and(eq(sales.id, saleId), eq(sales.tenantId, tenantId)));

    if (!sale) throw new AppError('NOT_FOUND', 'Sale not found', 404);

    if (sale.status !== 'completed') {
      throw new AppError('CONFLICT', `Cannot void a sale with status '${sale.status}'`, 409);
    }

    // 3. Verify void window
    const [settings] = await tx
      .select({ voidWindowHours: tenantSettings.voidWindowHours })
      .from(tenantSettings)
      .where(eq(tenantSettings.tenantId, tenantId));

    const voidWindowMs = (settings?.voidWindowHours ?? 24) * 60 * 60 * 1000;
    const saleAge = Date.now() - new Date(sale.createdAt).getTime();

    if (saleAge > voidWindowMs) {
      throw new AppError(
        'BILL_OUTSIDE_VOID_WINDOW',
        `Bill is older than ${settings?.voidWindowHours ?? 24} hours. Use returns/credit notes instead.`,
        422,
      );
    }

    // 4. Fetch sale items
    const items = await tx.select().from(saleItems).where(eq(saleItems.saleId, saleId));

    // 5. Reverse stock decrements (increment back)
    for (const item of items) {
      if (!item.variantId) continue;

      const [variant] = await tx
        .select({ version: productVariants.version })
        .from(productVariants)
        .where(eq(productVariants.id, item.variantId));

      if (!variant) continue;

      const updated = await incrementStock(tx, tenantId, item.variantId, item.quantity, variant.version);

      // Create reverse inventory movement
      await tx.insert(inventoryMovements).values({
        tenantId,
        variantId: item.variantId,
        movementType: 'sale_return',
        quantity: item.quantity,
        referenceType: 'void',
        referenceId: saleId,
        costPriceAtMovement: item.costAtSale,
        balanceAfter: updated.availableQuantity,
        notes: `Bill void: ${data.reason}`,
        createdBy: auth.userId,
      });
    }

    // 6. Reverse customer credit entries (if credit payment was used)
    const payments = await tx.select().from(salePayments).where(eq(salePayments.saleId, saleId));
    const creditPayment = payments.find((p) => p.paymentMethod === 'credit');

    if (creditPayment) {
      const creditAmount = Number(creditPayment.amount);
      const [customer] = await tx
        .select({ outstandingBalance: customers.outstandingBalance })
        .from(customers)
        .where(eq(customers.id, sale.customerId));

      if (customer) {
        const currentBalance = Number(customer.outstandingBalance);
        const newBalance = currentBalance - creditAmount;

        await tx
          .update(customers)
          .set({ outstandingBalance: String(newBalance), updatedAt: new Date() })
          .where(eq(customers.id, sale.customerId));

        await tx.insert(customerTransactions).values({
          tenantId,
          customerId: sale.customerId,
          type: 'return_adjustment',
          amount: String(-creditAmount), // Negative = they owe less
          balanceAfter: String(newBalance),
          referenceType: 'void',
          referenceId: saleId,
          notes: `Bill void: ${data.reason}`,
          createdBy: auth.userId,
        });
      }
    }

    // 7. Reverse customer stats
    const netPayable = Number(sale.netPayable);
    await tx
      .update(customers)
      .set({
        totalSpend: sql`GREATEST(${customers.totalSpend}::numeric - ${netPayable}, 0)`,
        visitCount: sql`GREATEST(${customers.visitCount} - 1, 0)`,
        updatedAt: new Date(),
      })
      .where(eq(customers.id, sale.customerId));

    // 8. Mark sale as cancelled
    const [voided] = await tx
      .update(sales)
      .set({
        status: 'cancelled',
        voidReason: data.reason,
        voidedAt: new Date(),
        voidedBy: auth.userId,
        updatedAt: new Date(),
      })
      .where(eq(sales.id, saleId))
      .returning();

    // 9. Audit log
    await auditRepo.withTransaction(tx).log({
      tenantId,
      userId: auth.userId,
      action: 'sale_voided',
      entityType: 'sale',
      entityId: saleId,
      newValue: {
        billNumber: sale.billNumber,
        reason: data.reason,
        netPayable,
        itemCount: items.length,
        creditReversed: creditPayment ? Number(creditPayment.amount) : 0,
      },
    });

    return voided;
  });
}
