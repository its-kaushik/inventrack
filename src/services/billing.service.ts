import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../config/database.js';
import { tenants } from '../db/schema/tenants.js';
import { products } from '../db/schema/products.js';
import { bills, billItems, billPayments } from '../db/schema/bills.js';
import { stockEntries } from '../db/schema/stock-entries.js';
import { cashRegisters, cashRegisterEntries } from '../db/schema/cash-registers.js';
import { Decimal, decimalSum, toDbDecimal } from '../lib/money.js';
import { backCalculateGst } from '../lib/gst-calculator.js';
import { ForbiddenError, ValidationError, NotFoundError } from '../lib/errors.js';
import * as billNumberService from './bill-number.service.js';
import * as ledgerService from './ledger.service.js';
import type { UserRole, GstScheme } from '../types/enums.js';

// ======================== TYPES ========================

interface CreateBillInput {
  items: Array<{ productId: string; quantity: number }>;
  payments: Array<{ mode: 'cash' | 'upi' | 'card' | 'credit'; amount: number; reference?: string }>;
  customerId?: string | null;
  additionalDiscountAmount?: number;
  additionalDiscountPct?: number;
  clientId?: string;
  notes?: string;
  isOffline?: boolean;
  offlineCreatedAt?: string;
}

interface ComputedLineItem {
  product: any;
  quantity: number;
  catalogDiscountPerUnit: Decimal;
  unitPriceAfterDiscount: Decimal;
  lineTotal: Decimal;
  gst: { taxableValue: number; cgst: number; sgst: number; totalGst: number };
}

// ======================== MODULAR HELPERS ========================

async function validateDiscountLimits(
  tx: any,
  tenantId: string,
  role: UserRole,
  additionalDiscount: number,
) {
  if (role !== 'salesperson' || additionalDiscount <= 0) return;

  const [tenant] = await tx
    .select({ settings: tenants.settings })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  const maxAmount = (tenant?.settings as any)?.max_salesperson_discount_amount ?? 500;
  if (additionalDiscount > maxAmount) {
    throw new ForbiddenError(
      `Discount ₹${additionalDiscount} exceeds your limit of ₹${maxAmount}. Ask a manager to approve.`,
    );
  }
}

async function computeLineItems(
  tx: any,
  tenantId: string,
  items: CreateBillInput['items'],
  gstScheme: GstScheme,
): Promise<ComputedLineItem[]> {
  const lineItems: ComputedLineItem[] = [];

  for (const item of items) {
    const [product] = await tx
      .select()
      .from(products)
      .where(and(eq(products.id, item.productId), eq(products.tenantId, tenantId)))
      .limit(1);

    if (!product) throw new NotFoundError('Product', item.productId);

    const sellingPrice = new Decimal(product.sellingPrice);
    const discountPct = new Decimal(product.catalogDiscountPct);
    const catalogDiscountPerUnit = sellingPrice.times(discountPct).div(100).toDecimalPlaces(2);
    const unitPriceAfterDiscount = sellingPrice.minus(catalogDiscountPerUnit).toDecimalPlaces(2);
    const lineTotal = unitPriceAfterDiscount.times(item.quantity).toDecimalPlaces(2);

    const gst = backCalculateGst(
      toDbDecimal(unitPriceAfterDiscount),
      Number(product.gstRate),
      gstScheme,
    );

    lineItems.push({
      product,
      quantity: item.quantity,
      catalogDiscountPerUnit,
      unitPriceAfterDiscount,
      lineTotal,
      gst,
    });
  }

  return lineItems;
}

function computeBillTotals(lineItems: ComputedLineItem[], additionalDiscountAmount: number) {
  const subtotal = decimalSum(lineItems, (l) =>
    new Decimal(l.product.sellingPrice).times(l.quantity),
  );
  const catalogDiscountTotal = decimalSum(lineItems, (l) =>
    l.catalogDiscountPerUnit.times(l.quantity),
  );
  const taxAmount = decimalSum(lineItems, (l) => new Decimal(l.gst.totalGst).times(l.quantity));
  const additionalDiscount = new Decimal(additionalDiscountAmount);
  const netAmount = subtotal
    .minus(catalogDiscountTotal)
    .minus(additionalDiscount)
    .toDecimalPlaces(2);

  return { subtotal, catalogDiscountTotal, taxAmount, netAmount, additionalDiscount };
}

function validatePayments(
  payments: CreateBillInput['payments'],
  netAmount: Decimal,
  customerId?: string | null,
) {
  const paymentTotal = decimalSum(payments, (p) => new Decimal(p.amount));

  if (!paymentTotal.equals(netAmount)) {
    throw new ValidationError(
      `Payment total ₹${toDbDecimal(paymentTotal)} does not match bill total ₹${toDbDecimal(netAmount)}`,
    );
  }

  const hasCredit = payments.some((p) => p.mode === 'credit');
  if (hasCredit && !customerId) {
    throw new ValidationError(
      'Credit payment requires a customer. Select or create a customer first.',
    );
  }
}

async function insertBillRecord(tx: any, data: any) {
  const [bill] = await tx.insert(bills).values(data).returning();
  return bill;
}

async function insertBillItemRecords(tx: any, billId: string, lineItems: ComputedLineItem[]) {
  for (const line of lineItems) {
    await tx.insert(billItems).values({
      billId,
      productId: line.product.id,
      productName: line.product.name,
      sku: line.product.sku,
      hsnCode: line.product.hsnCode,
      size: line.product.size,
      quantity: line.quantity,
      unitPrice: line.product.sellingPrice,
      catalogDiscountPct: line.product.catalogDiscountPct,
      catalogDiscountAmt: String(toDbDecimal(line.catalogDiscountPerUnit.times(line.quantity))),
      gstRate: line.product.gstRate,
      cgstAmount: String(new Decimal(line.gst.cgst).times(line.quantity).toDecimalPlaces(2)),
      sgstAmount: String(new Decimal(line.gst.sgst).times(line.quantity).toDecimalPlaces(2)),
      costPrice: line.product.costPrice,
      lineTotal: String(toDbDecimal(line.lineTotal)),
    });
  }
}

async function insertBillPaymentRecords(
  tx: any,
  billId: string,
  payments: CreateBillInput['payments'],
) {
  for (const payment of payments) {
    await tx.insert(billPayments).values({
      billId,
      mode: payment.mode,
      amount: String(payment.amount),
      reference: payment.reference,
    });
  }
}

async function decrementStock(
  tx: any,
  tenantId: string,
  userId: string,
  billId: string,
  lineItems: ComputedLineItem[],
) {
  for (const line of lineItems) {
    await tx.insert(stockEntries).values({
      tenantId,
      productId: line.product.id,
      quantity: -line.quantity,
      type: 'sale',
      referenceType: 'bill',
      referenceId: billId,
      costPriceAtEntry: line.product.costPrice,
      createdBy: userId,
    });
  }
}

async function recordCustomerCredit(
  tx: any,
  tenantId: string,
  customerId: string,
  amount: number,
  billId: string,
  userId: string,
) {
  await ledgerService.createEntry(tx, {
    tenantId,
    partyType: 'customer',
    partyId: customerId,
    entryType: 'sale',
    debit: amount,
    credit: 0,
    referenceType: 'bill',
    referenceId: billId,
    description: 'Credit sale',
    createdBy: userId,
  });

  await ledgerService.updateCustomerBalance(tx, tenantId, customerId, amount);
}

async function recordCashRegisterEntry(
  tx: any,
  tenantId: string,
  userId: string,
  amount: number,
  billId: string,
) {
  // Find open register for this user
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
      type: 'cash_sale',
      amount: String(amount),
      referenceType: 'bill',
      referenceId: billId,
      description: 'Cash sale',
    });
  }
}

// ======================== IDEMPOTENCY HELPER ========================

function isUniqueViolation(err: unknown, constraintName: string): boolean {
  return (
    err instanceof Error &&
    'code' in err &&
    (err as any).code === '23505' &&
    'constraint_name' in err &&
    (err as any).constraint_name === constraintName
  );
}

// ======================== MAIN CREATE BILL ========================

export async function createBill(
  tenantId: string,
  userId: string,
  role: UserRole,
  input: CreateBillInput,
) {
  try {
    return await _createBillTransaction(tenantId, userId, role, input);
  } catch (err) {
    // Idempotency: catch PostgreSQL unique_violation on client_id
    if (input.clientId && isUniqueViolation(err, 'idx_bills_tenant_client_id')) {
      const [existing] = await db
        .select()
        .from(bills)
        .where(and(eq(bills.tenantId, tenantId), eq(bills.clientId, input.clientId)))
        .limit(1);
      if (existing) return existing;
    }
    throw err;
  }
}

async function _createBillTransaction(
  tenantId: string,
  userId: string,
  role: UserRole,
  input: CreateBillInput,
) {
  return db.transaction(async (tx) => {
    const additionalDiscountAmount = input.additionalDiscountAmount ?? 0;

    // 1. Validate discount limits
    await validateDiscountLimits(tx, tenantId, role, additionalDiscountAmount);

    // 2. Get tenant for GST scheme
    const [tenant] = await tx
      .select({
        gstScheme: tenants.gstScheme,
        invoicePrefix: tenants.invoicePrefix,
      })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    if (!tenant) throw new NotFoundError('Tenant', tenantId);

    // 3. Compute line items
    const lineItems = await computeLineItems(tx, tenantId, input.items, tenant.gstScheme);

    // 4. Compute totals (all via decimal.js)
    const totals = computeBillTotals(lineItems, additionalDiscountAmount);

    // 5. Validate payments
    validatePayments(input.payments, totals.netAmount, input.customerId);

    // 6. Generate bill number
    const billNumber = await billNumberService.next(tx, tenantId, 'bill');

    // 7. Insert bill
    const bill = await insertBillRecord(tx, {
      tenantId,
      billNumber,
      customerId: input.customerId || null,
      salespersonId: userId,
      subtotal: String(toDbDecimal(totals.subtotal)),
      catalogDiscountTotal: String(toDbDecimal(totals.catalogDiscountTotal)),
      additionalDiscountAmount: String(additionalDiscountAmount),
      additionalDiscountPct: String(input.additionalDiscountPct ?? 0),
      taxAmount: String(toDbDecimal(totals.taxAmount)),
      netAmount: String(toDbDecimal(totals.netAmount)),
      gstSchemeAtSale: tenant.gstScheme,
      status: 'completed',
      isOffline: input.isOffline ?? false,
      offlineCreatedAt: input.offlineCreatedAt ?? null,
      clientId: input.clientId || null,
      notes: input.notes,
    });

    // 8. Insert bill items
    await insertBillItemRecords(tx, bill.id, lineItems);

    // 9. Insert payments
    await insertBillPaymentRecords(tx, bill.id, input.payments);

    // 10. Decrement stock (trigger handles current_stock)
    await decrementStock(tx, tenantId, userId, bill.id, lineItems);

    // 11. Customer credit (if credit payment)
    const creditPayment = input.payments.find((p) => p.mode === 'credit');
    if (creditPayment && input.customerId) {
      await recordCustomerCredit(
        tx,
        tenantId,
        input.customerId,
        creditPayment.amount,
        bill.id,
        userId,
      );
    }

    // 12. Cash register entry (if cash payment)
    const cashPayment = input.payments.find((p) => p.mode === 'cash');
    if (cashPayment) {
      await recordCashRegisterEntry(tx, tenantId, userId, cashPayment.amount, bill.id);
    }

    return bill;
  });
}

// ======================== READ OPERATIONS ========================

export async function listBills(
  tenantId: string,
  filters: {
    customerId?: string;
    salespersonId?: string;
    status?: string;
    limit?: number;
    offset?: number;
  },
) {
  const conditions: any[] = [eq(bills.tenantId, tenantId)];
  if (filters.customerId) conditions.push(eq(bills.customerId, filters.customerId));
  if (filters.salespersonId) conditions.push(eq(bills.salespersonId, filters.salespersonId));
  if (filters.status) conditions.push(eq(bills.status, filters.status as any));

  const limit = Math.min(filters.limit || 20, 100);
  const offset = filters.offset || 0;

  const items = await db
    .select()
    .from(bills)
    .where(and(...conditions))
    .orderBy(desc(bills.createdAt))
    .limit(limit + 1)
    .offset(offset);

  const hasMore = items.length > limit;
  if (hasMore) items.pop();

  return { items, hasMore };
}

export async function getBillById(tenantId: string, billId: string) {
  const [bill] = await db
    .select()
    .from(bills)
    .where(and(eq(bills.id, billId), eq(bills.tenantId, tenantId)))
    .limit(1);

  if (!bill) throw new NotFoundError('Bill', billId);

  const items = await db.select().from(billItems).where(eq(billItems.billId, billId));

  const payments = await db.select().from(billPayments).where(eq(billPayments.billId, billId));

  return { ...bill, items, payments };
}

// ======================== VOID BILL ========================

export async function voidBill(tenantId: string, userId: string, role: UserRole, billId: string) {
  return db.transaction(async (tx) => {
    // 1. Fetch the bill
    const [bill] = await tx
      .select()
      .from(bills)
      .where(and(eq(bills.id, billId), eq(bills.tenantId, tenantId)))
      .limit(1);

    if (!bill) throw new NotFoundError('Bill', billId);

    // 2. Validate status
    if (bill.status === 'voided') {
      throw new ValidationError('Bill is already voided');
    }
    if (bill.status === 'held') {
      throw new ValidationError('Cannot void a held bill');
    }
    if (bill.status !== 'completed' && bill.status !== 'partially_returned') {
      throw new ValidationError(`Cannot void bill with status "${bill.status}"`);
    }

    // 3. Update bill status to voided
    const [updatedBill] = await tx
      .update(bills)
      .set({ status: 'voided' })
      .where(eq(bills.id, billId))
      .returning();

    // 4. Fetch all bill items
    const items = await tx.select().from(billItems).where(eq(billItems.billId, billId));

    // 5. Restore stock for unreturned items
    for (const item of items) {
      const unreturnedQty = item.quantity - item.returnedQty;
      if (unreturnedQty <= 0) continue;

      await tx.insert(stockEntries).values({
        tenantId,
        productId: item.productId,
        quantity: unreturnedQty,
        type: 'adjustment',
        referenceType: 'void',
        referenceId: billId,
        costPriceAtEntry: item.costPrice,
        reason: 'Bill voided',
        createdBy: userId,
      });
    }

    // 6. Fetch bill payments
    const payments = await tx.select().from(billPayments).where(eq(billPayments.billId, billId));

    // 7. Reverse credit payment if applicable
    const creditPayment = payments.find((p) => p.mode === 'credit');
    if (creditPayment && bill.customerId) {
      const creditAmount = Number(creditPayment.amount);

      await ledgerService.createEntry(tx, {
        tenantId,
        partyType: 'customer',
        partyId: bill.customerId,
        entryType: 'adjustment',
        debit: 0,
        credit: creditAmount,
        referenceType: 'void',
        referenceId: billId,
        description: `Void reversal for bill ${bill.billNumber}`,
        createdBy: userId,
      });

      await ledgerService.updateCustomerBalance(tx, tenantId, bill.customerId, -creditAmount);
    }

    // 8. Reverse cash register entry if applicable
    const cashPayment = payments.find((p) => p.mode === 'cash');
    if (cashPayment) {
      const cashAmount = Number(cashPayment.amount);

      // Find open register for user
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
          amount: String(-cashAmount),
          referenceType: 'void',
          referenceId: billId,
          description: `Void reversal for bill ${bill.billNumber}`,
        });
      }
    }

    return updatedBill;
  });
}

export async function getBillForPrint(tenantId: string, billId: string) {
  const bill = await getBillById(tenantId, billId);

  // Get tenant info for receipt header
  const [tenant] = await db
    .select({
      name: tenants.name,
      address: tenants.address,
      phone: tenants.phone,
      gstin: tenants.gstin,
      gstScheme: tenants.gstScheme,
      settings: tenants.settings,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  const isComposition = bill.gstSchemeAtSale === 'composition';

  return {
    type: isComposition ? 'bill_of_supply' : 'tax_invoice',
    declaration: isComposition
      ? 'Composition taxable person, not eligible to collect tax on supplies'
      : null,
    tenant,
    bill,
  };
}
