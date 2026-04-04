import { eq, and } from 'drizzle-orm';
import { db } from '../config/database.js';
import { bills, billItems } from '../db/schema/bills.js';
import { products } from '../db/schema/products.js';
import { tenants } from '../db/schema/tenants.js';
import { Decimal, decimalSum, toDbDecimal } from '../lib/money.js';
import { backCalculateGst } from '../lib/gst-calculator.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import { randomUUID } from 'crypto';
import type { GstScheme } from '../types/enums.js';

interface HoldBillInput {
  items: Array<{ productId: string; quantity: number }>;
  customerId?: string | null;
  additionalDiscountAmount?: number;
  notes?: string;
}

export async function holdBill(tenantId: string, userId: string, input: HoldBillInput) {
  return db.transaction(async (tx) => {
    // Get tenant for GST scheme
    const [tenant] = await tx
      .select({ gstScheme: tenants.gstScheme })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    if (!tenant) throw new NotFoundError('Tenant', tenantId);

    const gstScheme: GstScheme = tenant.gstScheme;

    // Compute line items to store accurate cart snapshot
    const lineItems = [];
    let subtotal = new Decimal(0);
    let catalogDiscountTotal = new Decimal(0);
    let taxAmount = new Decimal(0);

    for (const item of input.items) {
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

      subtotal = subtotal.plus(sellingPrice.times(item.quantity));
      catalogDiscountTotal = catalogDiscountTotal.plus(catalogDiscountPerUnit.times(item.quantity));
      taxAmount = taxAmount.plus(new Decimal(gst.totalGst).times(item.quantity));

      lineItems.push({
        product,
        item,
        catalogDiscountPerUnit,
        unitPriceAfterDiscount,
        lineTotal,
        gst,
      });
    }

    const additionalDiscountAmount = input.additionalDiscountAmount ?? 0;
    const netAmount = subtotal
      .minus(catalogDiscountTotal)
      .minus(new Decimal(additionalDiscountAmount))
      .toDecimalPlaces(2);

    // Generate a HOLD- bill number (not a real sequence number)
    const holdNumber = `HOLD-${randomUUID().slice(0, 8)}`;

    // Insert bill with status='held' — no stock entries, no payments, no ledger
    const [bill] = await tx
      .insert(bills)
      .values({
        tenantId,
        billNumber: holdNumber,
        customerId: input.customerId || null,
        salespersonId: userId,
        subtotal: String(toDbDecimal(subtotal)),
        catalogDiscountTotal: String(toDbDecimal(catalogDiscountTotal)),
        additionalDiscountAmount: String(additionalDiscountAmount),
        additionalDiscountPct: '0',
        taxAmount: String(toDbDecimal(taxAmount)),
        netAmount: String(toDbDecimal(netAmount)),
        gstSchemeAtSale: gstScheme,
        status: 'held',
        notes: input.notes,
      })
      .returning();

    // Insert bill items for cart state
    for (const line of lineItems) {
      await tx.insert(billItems).values({
        billId: bill.id,
        productId: line.product.id,
        productName: line.product.name,
        sku: line.product.sku,
        hsnCode: line.product.hsnCode,
        size: line.product.size,
        quantity: line.item.quantity,
        unitPrice: line.product.sellingPrice,
        catalogDiscountPct: line.product.catalogDiscountPct,
        catalogDiscountAmt: String(
          toDbDecimal(line.catalogDiscountPerUnit.times(line.item.quantity)),
        ),
        gstRate: line.product.gstRate,
        cgstAmount: String(new Decimal(line.gst.cgst).times(line.item.quantity).toDecimalPlaces(2)),
        sgstAmount: String(new Decimal(line.gst.sgst).times(line.item.quantity).toDecimalPlaces(2)),
        costPrice: line.product.costPrice,
        lineTotal: String(toDbDecimal(line.lineTotal)),
      });
    }

    return bill;
  });
}

export async function listHeldBills(tenantId: string) {
  const heldBills = await db
    .select()
    .from(bills)
    .where(and(eq(bills.tenantId, tenantId), eq(bills.status, 'held')))
    .orderBy(bills.createdAt);

  // Fetch items for each held bill
  const result = [];
  for (const bill of heldBills) {
    const items = await db.select().from(billItems).where(eq(billItems.billId, bill.id));
    result.push({ ...bill, items });
  }

  return result;
}

export async function resumeHeldBill(tenantId: string, billId: string) {
  return db.transaction(async (tx) => {
    // Fetch the held bill
    const [bill] = await tx
      .select()
      .from(bills)
      .where(and(eq(bills.id, billId), eq(bills.tenantId, tenantId), eq(bills.status, 'held')))
      .limit(1);

    if (!bill) throw new NotFoundError('Held bill', billId);

    // Fetch items
    const items = await tx.select().from(billItems).where(eq(billItems.billId, billId));

    // Build cart data for the client to re-submit
    const cartData = {
      items: items.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
      })),
      customerId: bill.customerId,
      additionalDiscountAmount: Number(bill.additionalDiscountAmount),
      notes: bill.notes,
    };

    // Delete the held bill (CASCADE deletes bill_items)
    await tx.delete(bills).where(eq(bills.id, billId));

    return cartData;
  });
}

export async function discardHeldBill(tenantId: string, billId: string) {
  const [bill] = await db
    .select({ id: bills.id, status: bills.status })
    .from(bills)
    .where(and(eq(bills.id, billId), eq(bills.tenantId, tenantId)))
    .limit(1);

  if (!bill) throw new NotFoundError('Held bill', billId);
  if (bill.status !== 'held') {
    throw new ValidationError('Only held bills can be discarded');
  }

  await db.delete(bills).where(eq(bills.id, billId));
}
