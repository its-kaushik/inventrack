import { Decimal } from './money.js';

export interface GstBreakdown {
  taxableValue: number;
  cgst: number;
  sgst: number;
  totalGst: number;
}

export function backCalculateGst(
  inclusivePrice: number,
  gstRate: number,
  scheme: 'regular' | 'composition'
): GstBreakdown {
  if (scheme === 'composition') {
    return { taxableValue: inclusivePrice, cgst: 0, sgst: 0, totalGst: 0 };
  }

  if (gstRate === 0) {
    return { taxableValue: inclusivePrice, cgst: 0, sgst: 0, totalGst: 0 };
  }

  const price = new Decimal(inclusivePrice);
  const rate = new Decimal(gstRate);
  const taxableValue = price.div(rate.div(100).plus(1)).toDecimalPlaces(2);
  const totalGst = price.minus(taxableValue).toDecimalPlaces(2);
  const cgst = totalGst.div(2).toDecimalPlaces(2);
  const sgst = totalGst.minus(cgst).toDecimalPlaces(2);

  return {
    taxableValue: taxableValue.toNumber(),
    cgst: cgst.toNumber(),
    sgst: sgst.toNumber(),
    totalGst: totalGst.toNumber(),
  };
}

export function calculateCompositionTax(quarterlyTurnover: number): {
  totalTax: number;
  cgst: number;
  sgst: number;
} {
  const turnover = new Decimal(quarterlyTurnover);
  const totalTax = turnover.times(0.01).toDecimalPlaces(2);
  const cgst = totalTax.div(2).toDecimalPlaces(2);
  const sgst = totalTax.minus(cgst).toDecimalPlaces(2);

  return {
    totalTax: totalTax.toNumber(),
    cgst: cgst.toNumber(),
    sgst: sgst.toNumber(),
  };
}
