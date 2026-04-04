import { eq, sql } from 'drizzle-orm';
import { db } from '../config/database.js';
import { tenants } from '../db/schema/tenants.js';
import { calculateCompositionTax } from '../lib/gst-calculator.js';
import { ValidationError } from '../lib/errors.js';

async function getTenantScheme(tenantId: string): Promise<'regular' | 'composition'> {
  const [tenant] = await db
    .select({ gstScheme: tenants.gstScheme })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  return tenant?.gstScheme ?? 'regular';
}

export async function getSummary(tenantId: string, from: string, to: string) {
  const gstScheme = await getTenantScheme(tenantId);

  if (gstScheme === 'composition') {
    const [turnoverRow] = (await db.execute(sql`
      SELECT COALESCE(SUM(net_amount::numeric), 0) AS turnover
      FROM bills
      WHERE tenant_id = ${tenantId}
        AND status IN ('completed', 'partially_returned')
        AND created_at >= ${from}::date
        AND created_at < (${to}::date + INTERVAL '1 day')
    `)) as any[];

    const turnover = Number(turnoverRow?.turnover ?? 0);
    const tax = calculateCompositionTax(turnover);

    return {
      scheme: 'composition',
      turnover,
      totalTax: tax.totalTax,
      cgst: tax.cgst,
      sgst: tax.sgst,
    };
  }

  // Regular scheme
  const [outputRow] = (await db.execute(sql`
    SELECT
      COALESCE(SUM(bi.cgst_amount::numeric + bi.sgst_amount::numeric), 0) AS output_tax
    FROM bill_items bi
    JOIN bills b ON b.id = bi.bill_id
    WHERE b.tenant_id = ${tenantId}
      AND b.status IN ('completed', 'partially_returned')
      AND b.created_at >= ${from}::date
      AND b.created_at < (${to}::date + INTERVAL '1 day')
  `)) as any[];

  const [inputRow] = (await db.execute(sql`
    SELECT
      COALESCE(SUM(cgst_amount::numeric + sgst_amount::numeric + igst_amount::numeric), 0) AS input_tax
    FROM purchases
    WHERE tenant_id = ${tenantId}
      AND created_at >= ${from}::date
      AND created_at < (${to}::date + INTERVAL '1 day')
  `)) as any[];

  const outputTax = Number(outputRow?.output_tax ?? 0);
  const inputTax = Number(inputRow?.input_tax ?? 0);
  const netPayable = outputTax - inputTax;

  return {
    scheme: 'regular',
    outputTax,
    inputTax,
    netPayable,
  };
}

export async function getGstr1(tenantId: string, from: string, to: string) {
  const rateWise = (await db.execute(sql`
    SELECT
      bi.gst_rate,
      SUM(bi.line_total::numeric - bi.cgst_amount::numeric - bi.sgst_amount::numeric) AS taxable_value,
      SUM(bi.cgst_amount::numeric) AS cgst,
      SUM(bi.sgst_amount::numeric) AS sgst
    FROM bill_items bi
    JOIN bills b ON b.id = bi.bill_id
    WHERE b.tenant_id = ${tenantId}
      AND b.status IN ('completed', 'partially_returned')
      AND b.created_at >= ${from}::date
      AND b.created_at < (${to}::date + INTERVAL '1 day')
    GROUP BY bi.gst_rate
    ORDER BY bi.gst_rate
  `)) as any[];

  const hsnWise = (await db.execute(sql`
    SELECT
      bi.hsn_code,
      bi.gst_rate,
      SUM(bi.quantity) AS total_quantity,
      SUM(bi.line_total::numeric - bi.cgst_amount::numeric - bi.sgst_amount::numeric) AS taxable_value,
      SUM(bi.cgst_amount::numeric) AS cgst,
      SUM(bi.sgst_amount::numeric) AS sgst
    FROM bill_items bi
    JOIN bills b ON b.id = bi.bill_id
    WHERE b.tenant_id = ${tenantId}
      AND b.status IN ('completed', 'partially_returned')
      AND b.created_at >= ${from}::date
      AND b.created_at < (${to}::date + INTERVAL '1 day')
      AND bi.hsn_code IS NOT NULL
    GROUP BY bi.hsn_code, bi.gst_rate
    ORDER BY bi.hsn_code
  `)) as any[];

  return {
    rateWise: rateWise.map((r: any) => ({
      gstRate: Number(r.gst_rate),
      taxableValue: Number(r.taxable_value),
      cgst: Number(r.cgst),
      sgst: Number(r.sgst),
    })),
    hsnWise: hsnWise.map((r: any) => ({
      hsnCode: r.hsn_code,
      gstRate: Number(r.gst_rate),
      totalQuantity: Number(r.total_quantity),
      taxableValue: Number(r.taxable_value),
      cgst: Number(r.cgst),
      sgst: Number(r.sgst),
    })),
  };
}

export async function getGstr3b(tenantId: string, from: string, to: string) {
  // Table 3.1: Outward taxable supplies by rate
  const outwardSupplies = (await db.execute(sql`
    SELECT
      bi.gst_rate,
      SUM(bi.line_total::numeric - bi.cgst_amount::numeric - bi.sgst_amount::numeric) AS taxable_value,
      SUM(bi.cgst_amount::numeric) AS cgst,
      SUM(bi.sgst_amount::numeric) AS sgst
    FROM bill_items bi
    JOIN bills b ON b.id = bi.bill_id
    WHERE b.tenant_id = ${tenantId}
      AND b.status IN ('completed', 'partially_returned')
      AND b.created_at >= ${from}::date
      AND b.created_at < (${to}::date + INTERVAL '1 day')
    GROUP BY bi.gst_rate
    ORDER BY bi.gst_rate
  `)) as any[];

  // Table 4: ITC from purchases
  const [itcRow] = (await db.execute(sql`
    SELECT
      COALESCE(SUM(cgst_amount::numeric), 0) AS cgst,
      COALESCE(SUM(sgst_amount::numeric), 0) AS sgst,
      COALESCE(SUM(igst_amount::numeric), 0) AS igst
    FROM purchases
    WHERE tenant_id = ${tenantId}
      AND created_at >= ${from}::date
      AND created_at < (${to}::date + INTERVAL '1 day')
  `)) as any[];

  const totalOutputCgst = outwardSupplies.reduce((s: number, r: any) => s + Number(r.cgst), 0);
  const totalOutputSgst = outwardSupplies.reduce((s: number, r: any) => s + Number(r.sgst), 0);
  const totalOutput = totalOutputCgst + totalOutputSgst;

  const itcCgst = Number(itcRow?.cgst ?? 0);
  const itcSgst = Number(itcRow?.sgst ?? 0);
  const itcIgst = Number(itcRow?.igst ?? 0);
  const totalItc = itcCgst + itcSgst + itcIgst;

  return {
    table3_1: outwardSupplies.map((r: any) => ({
      gstRate: Number(r.gst_rate),
      taxableValue: Number(r.taxable_value),
      cgst: Number(r.cgst),
      sgst: Number(r.sgst),
    })),
    table4: {
      cgst: itcCgst,
      sgst: itcSgst,
      igst: itcIgst,
      total: totalItc,
    },
    netPayable: {
      cgst: totalOutputCgst - itcCgst,
      sgst: totalOutputSgst - itcSgst,
      igst: -itcIgst,
      total: totalOutput - totalItc,
    },
  };
}

function getQuarterDateRange(quarter: number, fy: string): { from: string; to: string } {
  const [startYear, endYear] = fy.split('-').map(Number);

  const quarterMap: Record<
    number,
    { fromMonth: number; fromYear: number; toMonth: number; toYear: number }
  > = {
    1: { fromMonth: 4, fromYear: startYear, toMonth: 6, toYear: startYear },
    2: { fromMonth: 7, fromYear: startYear, toMonth: 9, toYear: startYear },
    3: { fromMonth: 10, fromYear: startYear, toMonth: 12, toYear: startYear },
    4: { fromMonth: 1, fromYear: endYear, toMonth: 3, toYear: endYear },
  };

  const q = quarterMap[quarter];
  const from = `${q.fromYear}-${String(q.fromMonth).padStart(2, '0')}-01`;
  // Last day of the toMonth
  const lastDay = new Date(q.toYear, q.toMonth, 0).getDate();
  const to = `${q.toYear}-${String(q.toMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  return { from, to };
}

export async function getCmp08(tenantId: string, quarter: number, fy: string) {
  const { from, to } = getQuarterDateRange(quarter, fy);

  // Turnover from bills
  const [turnoverRow] = (await db.execute(sql`
    SELECT COALESCE(SUM(net_amount::numeric), 0) AS turnover
    FROM bills
    WHERE tenant_id = ${tenantId}
      AND status IN ('completed', 'partially_returned')
      AND created_at >= ${from}::date
      AND created_at < (${to}::date + INTERVAL '1 day')
  `)) as any[];

  const turnover = Number(turnoverRow?.turnover ?? 0);
  const tax = calculateCompositionTax(turnover);

  // Inward supplies under RCM
  const [rcmRow] = (await db.execute(sql`
    SELECT
      COALESCE(SUM(total_amount::numeric), 0) AS total,
      COALESCE(SUM(cgst_amount::numeric), 0) AS cgst,
      COALESCE(SUM(sgst_amount::numeric), 0) AS sgst,
      COALESCE(SUM(igst_amount::numeric), 0) AS igst
    FROM purchases
    WHERE tenant_id = ${tenantId}
      AND is_rcm = true
      AND created_at >= ${from}::date
      AND created_at < (${to}::date + INTERVAL '1 day')
  `)) as any[];

  return {
    quarter,
    fy,
    from,
    to,
    turnover,
    tax: {
      totalTax: tax.totalTax,
      cgst: tax.cgst,
      sgst: tax.sgst,
    },
    rcm: {
      total: Number(rcmRow?.total ?? 0),
      cgst: Number(rcmRow?.cgst ?? 0),
      sgst: Number(rcmRow?.sgst ?? 0),
      igst: Number(rcmRow?.igst ?? 0),
    },
  };
}

export async function getGstr4(tenantId: string, fy: string) {
  let totalTurnover = 0;
  let totalTax = 0;
  let totalCgst = 0;
  let totalSgst = 0;
  const quarters = [];

  for (let q = 1; q <= 4; q++) {
    const result = await getCmp08(tenantId, q, fy);
    totalTurnover += result.turnover;
    totalTax += result.tax.totalTax;
    totalCgst += result.tax.cgst;
    totalSgst += result.tax.sgst;
    quarters.push(result);
  }

  return {
    fy,
    totalTurnover,
    totalTax,
    totalCgst,
    totalSgst,
    quarters,
  };
}

export async function getItcRegister(tenantId: string, from: string, to: string) {
  const gstScheme = await getTenantScheme(tenantId);

  if (gstScheme === 'composition') {
    throw new ValidationError('ITC register is not available for composition scheme taxpayers');
  }

  const rows = (await db.execute(sql`
    SELECT
      p.id,
      s.name AS supplier_name,
      s.gstin AS supplier_gstin,
      p.invoice_number,
      p.invoice_date,
      p.cgst_amount,
      p.sgst_amount,
      p.igst_amount,
      p.total_amount
    FROM purchases p
    JOIN suppliers s ON s.id = p.supplier_id
    WHERE p.tenant_id = ${tenantId}
      AND p.created_at >= ${from}::date
      AND p.created_at < (${to}::date + INTERVAL '1 day')
    ORDER BY p.created_at
  `)) as any[];

  return rows.map((r: any) => ({
    id: r.id,
    supplierName: r.supplier_name,
    supplierGstin: r.supplier_gstin,
    invoiceNumber: r.invoice_number,
    invoiceDate: r.invoice_date,
    cgst: Number(r.cgst_amount),
    sgst: Number(r.sgst_amount),
    igst: Number(r.igst_amount),
    totalAmount: Number(r.total_amount),
  }));
}

export async function getHsnSummary(tenantId: string, from: string, to: string) {
  const rows = (await db.execute(sql`
    SELECT
      bi.hsn_code,
      SUM(bi.quantity) AS total_quantity,
      SUM(bi.line_total::numeric - bi.cgst_amount::numeric - bi.sgst_amount::numeric) AS taxable_value,
      SUM(bi.cgst_amount::numeric) AS cgst,
      SUM(bi.sgst_amount::numeric) AS sgst
    FROM bill_items bi
    JOIN bills b ON b.id = bi.bill_id
    WHERE b.tenant_id = ${tenantId}
      AND b.status IN ('completed', 'partially_returned')
      AND b.created_at >= ${from}::date
      AND b.created_at < (${to}::date + INTERVAL '1 day')
      AND bi.hsn_code IS NOT NULL
    GROUP BY bi.hsn_code
    ORDER BY bi.hsn_code
  `)) as any[];

  return rows.map((r: any) => ({
    hsnCode: r.hsn_code,
    totalQuantity: Number(r.total_quantity),
    taxableValue: Number(r.taxable_value),
    cgst: Number(r.cgst),
    sgst: Number(r.sgst),
  }));
}
