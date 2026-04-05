function roundTo2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface CartItem {
  variantId: string;
  mrp: number;
  quantity: number;
  productDiscountPct: number;
}

export interface DiscountInput {
  items: CartItem[];
  billDiscountPct: number;
  bargainAdjustment?: number;
  finalPrice?: number;
}

export interface DiscountResult {
  subtotalMrp: number;
  productDiscountTotal: number;
  subtotalAfterProductDiscount: number;
  billDiscountAmount: number;
  subtotalAfterBillDiscount: number;
  bargainAdjustment: number;
  subtotalTaxable: number;
  effectiveDiscountPct: number;
  itemTaxableValues: Map<string, number>;
}

export function calculateDiscount(input: DiscountInput): DiscountResult {
  // Step 1: MRP subtotal
  const subtotalMrp = input.items.reduce((sum, i) => sum + i.mrp * i.quantity, 0);

  // Step 2: Product-level discounts
  let productDiscountTotal = 0;
  const lineTotals = input.items.map((item) => {
    const discountedPrice = item.mrp * (1 - item.productDiscountPct / 100);
    const lineTotal = roundTo2(discountedPrice * item.quantity);
    productDiscountTotal += item.mrp * item.quantity - lineTotal;
    return { ...item, lineTotal, discountedPrice };
  });

  const subtotalAfterProductDiscount = roundTo2(
    lineTotals.reduce((sum, i) => sum + i.lineTotal, 0),
  );

  // Step 3: Bill-level discount
  const billDiscountAmount = roundTo2(subtotalAfterProductDiscount * (input.billDiscountPct / 100));
  const subtotalAfterBillDiscount = roundTo2(subtotalAfterProductDiscount - billDiscountAmount);

  // Step 4: Bargain adjustment
  let bargainAdjustment = 0;
  if (input.finalPrice != null) {
    bargainAdjustment = roundTo2(subtotalAfterBillDiscount - input.finalPrice);
  } else if (input.bargainAdjustment != null) {
    bargainAdjustment = input.bargainAdjustment;
  }

  // Step 5: Taxable subtotal
  const subtotalTaxable = roundTo2(subtotalAfterBillDiscount - bargainAdjustment);

  // Step 6: Effective discount %
  const effectiveDiscountPct =
    subtotalMrp > 0 ? roundTo2(((subtotalMrp - subtotalTaxable) / subtotalMrp) * 100) : 0;

  // Step 7: Proportional discount allocation per item (for GST)
  const totalNonProductDiscount = billDiscountAmount + bargainAdjustment;
  const itemTaxableValues = new Map<string, number>();
  for (const item of lineTotals) {
    const share =
      subtotalAfterProductDiscount > 0
        ? (item.lineTotal / subtotalAfterProductDiscount) * totalNonProductDiscount
        : 0;
    itemTaxableValues.set(item.variantId, roundTo2(item.lineTotal - share));
  }

  return {
    subtotalMrp: roundTo2(subtotalMrp),
    productDiscountTotal: roundTo2(productDiscountTotal),
    subtotalAfterProductDiscount,
    billDiscountAmount,
    subtotalAfterBillDiscount,
    bargainAdjustment: roundTo2(bargainAdjustment),
    subtotalTaxable,
    effectiveDiscountPct,
    itemTaxableValues,
  };
}
