import type { DiscountResult } from './discount-engine.js';

function roundTo2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface GstItemResult {
  variantId: string;
  taxableValue: number;
  gstRate: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
}

export interface GstResult {
  items: GstItemResult[];
  subtotalTaxable: number;
  totalCgst: number;
  totalSgst: number;
  totalIgst: number;
  total: number;
}

export function calculateGst(
  items: Array<{ variantId: string; gstRate: number }>,
  discountResult: DiscountResult,
  gstScheme: 'composite' | 'regular',
  isInterState: boolean = false,
): GstResult {
  const itemResults: GstItemResult[] = [];
  let totalCgst = 0;
  let totalSgst = 0;
  let totalIgst = 0;

  for (const item of items) {
    const taxableValue = discountResult.itemTaxableValues.get(item.variantId) ?? 0;

    if (gstScheme === 'composite') {
      itemResults.push({
        variantId: item.variantId,
        taxableValue,
        gstRate: 0,
        cgstAmount: 0,
        sgstAmount: 0,
        igstAmount: 0,
      });
    } else {
      let cgst = 0;
      let sgst = 0;
      let igst = 0;
      if (isInterState) {
        igst = roundTo2((taxableValue * item.gstRate) / 100);
        totalIgst += igst;
      } else {
        cgst = roundTo2((taxableValue * (item.gstRate / 2)) / 100);
        sgst = roundTo2((taxableValue * (item.gstRate / 2)) / 100);
        totalCgst += cgst;
        totalSgst += sgst;
      }
      itemResults.push({
        variantId: item.variantId,
        taxableValue,
        gstRate: item.gstRate,
        cgstAmount: cgst,
        sgstAmount: sgst,
        igstAmount: igst,
      });
    }
  }

  return {
    items: itemResults,
    subtotalTaxable: discountResult.subtotalTaxable,
    totalCgst: roundTo2(totalCgst),
    totalSgst: roundTo2(totalSgst),
    totalIgst: roundTo2(totalIgst),
    total: roundTo2(discountResult.subtotalTaxable + totalCgst + totalSgst + totalIgst),
  };
}
