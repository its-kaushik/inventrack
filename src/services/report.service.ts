import { sql } from 'drizzle-orm';
import { db } from '../config/database.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';

export interface ReportParams {
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
  partyId?: string;
  registerId?: string;
}

export async function getReport(tenantId: string, type: string, params: ReportParams) {
  switch (type) {
    case 'daily-sales':
      return dailySalesReport(tenantId, params);
    case 'sales-by-category':
      return salesByCategoryReport(tenantId, params);
    case 'sales-by-salesperson':
      return salesBySalespersonReport(tenantId, params);
    case 'inventory-valuation':
      return inventoryValuationReport(tenantId, params);
    case 'low-stock':
      return lowStockReport(tenantId, params);
    case 'outstanding-payables':
      return outstandingPayablesReport(tenantId, params);
    case 'outstanding-receivables':
      return outstandingReceivablesReport(tenantId, params);
    case 'customer-ledger':
      return customerLedgerReport(tenantId, params);
    case 'supplier-ledger':
      return supplierLedgerReport(tenantId, params);
    case 'cash-register':
      return cashRegisterReport(tenantId, params);
    case 'pnl':
      return pnlReport(tenantId, params);
    case 'purchase-summary':
      return purchaseSummaryReport(tenantId, params);
    case 'expense':
      return expenseReport(tenantId, params);
    case 'gst-summary':
      return gstSummaryReport(tenantId, params);
    case 'bargain-discount':
      return bargainDiscountReport(tenantId, params);
    case 'aging-inventory':
      return agingInventoryReport(tenantId, params);
    case 'dead-stock':
      return deadStockReport(tenantId, params);
    default:
      throw new NotFoundError('Report type', type);
  }
}

// ---------- helpers ----------

function dateFilter(from?: string, to?: string, col = 'created_at') {
  const clauses: string[] = [];
  if (from) clauses.push(`${col} >= '${from}'`);
  if (to) clauses.push(`${col} <= '${to}'`);
  return clauses.length > 0 ? `AND ${clauses.join(' AND ')}` : '';
}

// ---------- 1. Daily Sales ----------

async function dailySalesReport(tenantId: string, params: ReportParams) {
  const { from, to } = params;
  const rows = await db.execute(
    sql.raw(`
    SELECT DATE(b.created_at) AS sale_date,
           COALESCE(SUM(CAST(b.net_amount AS numeric)), 0) AS total_sales,
           COUNT(*)::int AS bill_count
    FROM bills b
    WHERE b.tenant_id = '${tenantId}'
      AND b.status IN ('completed', 'partially_returned')
      ${dateFilter(from, to, 'b.created_at')}
    GROUP BY DATE(b.created_at)
    ORDER BY sale_date DESC
  `),
  );

  const paymentRows = await db.execute(
    sql.raw(`
    SELECT DATE(b.created_at) AS sale_date,
           bp.mode,
           COALESCE(SUM(CAST(bp.amount AS numeric)), 0) AS mode_total
    FROM bill_payments bp
    JOIN bills b ON bp.bill_id = b.id
    WHERE b.tenant_id = '${tenantId}'
      AND b.status IN ('completed', 'partially_returned')
      ${dateFilter(from, to, 'b.created_at')}
    GROUP BY DATE(b.created_at), bp.mode
    ORDER BY sale_date DESC
  `),
  );

  return { rows, paymentSplit: paymentRows };
}

// ---------- 2. Sales by Category ----------

async function salesByCategoryReport(tenantId: string, params: ReportParams) {
  const { from, to } = params;
  const rows = await db.execute(
    sql.raw(`
    SELECT c.name AS category_name,
           COALESCE(SUM(CAST(bi.line_total AS numeric)), 0) AS revenue,
           SUM(bi.quantity)::int AS units_sold
    FROM bill_items bi
    JOIN bills b ON bi.bill_id = b.id
    JOIN products p ON bi.product_id = p.id
    JOIN categories c ON p.category_id = c.id
    WHERE b.tenant_id = '${tenantId}'
      AND b.status IN ('completed', 'partially_returned')
      ${dateFilter(from, to, 'b.created_at')}
    GROUP BY c.name
    ORDER BY revenue DESC
  `),
  );
  return { rows };
}

// ---------- 3. Sales by Salesperson ----------

async function salesBySalespersonReport(tenantId: string, params: ReportParams) {
  const { from, to } = params;
  const rows = await db.execute(
    sql.raw(`
    SELECT b.salesperson_id,
           u.name AS salesperson_name,
           COALESCE(SUM(CAST(b.net_amount AS numeric)), 0) AS total_sales,
           COUNT(*)::int AS bill_count
    FROM bills b
    JOIN users u ON b.salesperson_id = u.id
    WHERE b.tenant_id = '${tenantId}'
      AND b.status IN ('completed', 'partially_returned')
      ${dateFilter(from, to, 'b.created_at')}
    GROUP BY b.salesperson_id, u.name
    ORDER BY total_sales DESC
  `),
  );
  return { rows };
}

// ---------- 4. Inventory Valuation ----------

async function inventoryValuationReport(tenantId: string, _params: ReportParams) {
  const rows = await db.execute(
    sql.raw(`
    SELECT p.id, p.name, p.sku, p.current_stock,
           CAST(p.cost_price AS numeric) AS unit_cost,
           (p.current_stock * CAST(p.cost_price AS numeric)) AS stock_value,
           c.name AS category_name,
           br.name AS brand_name
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    LEFT JOIN brands br ON p.brand_id = br.id
    WHERE p.tenant_id = '${tenantId}' AND p.is_active = true
    ORDER BY stock_value DESC
  `),
  );

  const summary = await db.execute(
    sql.raw(`
    SELECT COALESCE(SUM(p.current_stock * CAST(p.cost_price AS numeric)), 0) AS total_valuation,
           SUM(p.current_stock)::int AS total_units,
           COUNT(*)::int AS product_count
    FROM products p
    WHERE p.tenant_id = '${tenantId}' AND p.is_active = true
  `),
  );

  return { rows, summary: (summary as any[])[0] ?? null };
}

// ---------- 5. Low Stock ----------

async function lowStockReport(tenantId: string, params: ReportParams) {
  const limit = params.limit ?? 50;
  const offset = params.offset ?? 0;

  const rows = await db.execute(
    sql.raw(`
    SELECT p.id, p.name, p.sku, p.current_stock, p.min_stock_level,
           (p.min_stock_level - p.current_stock) AS deficit,
           c.name AS category_name
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.tenant_id = '${tenantId}' AND p.is_active = true
      AND p.current_stock <= p.min_stock_level
    ORDER BY deficit DESC
    LIMIT ${limit + 1} OFFSET ${offset}
  `),
  );

  const items = (rows as any[]).slice(0, limit);
  const hasMore = (rows as any[]).length > limit;
  return { rows: items, hasMore };
}

// ---------- 6. Outstanding Payables ----------

async function outstandingPayablesReport(tenantId: string, _params: ReportParams) {
  const rows = await db.execute(
    sql.raw(`
    SELECT s.id, s.name, CAST(s.outstanding_balance AS numeric) AS outstanding_balance,
           MIN(le.due_date) AS earliest_due_date,
           COALESCE(SUM(CASE WHEN le.due_date < CURRENT_DATE - INTERVAL '90 days' THEN CAST(le.debit AS numeric) - CAST(le.credit AS numeric) ELSE 0 END), 0) AS over_90_days,
           COALESCE(SUM(CASE WHEN le.due_date >= CURRENT_DATE - INTERVAL '90 days' AND le.due_date < CURRENT_DATE - INTERVAL '60 days' THEN CAST(le.debit AS numeric) - CAST(le.credit AS numeric) ELSE 0 END), 0) AS "61_90_days",
           COALESCE(SUM(CASE WHEN le.due_date >= CURRENT_DATE - INTERVAL '60 days' AND le.due_date < CURRENT_DATE - INTERVAL '30 days' THEN CAST(le.debit AS numeric) - CAST(le.credit AS numeric) ELSE 0 END), 0) AS "31_60_days",
           COALESCE(SUM(CASE WHEN le.due_date >= CURRENT_DATE - INTERVAL '30 days' THEN CAST(le.debit AS numeric) - CAST(le.credit AS numeric) ELSE 0 END), 0) AS "0_30_days"
    FROM suppliers s
    LEFT JOIN ledger_entries le ON le.party_id = s.id AND le.party_type = 'supplier' AND le.tenant_id = '${tenantId}'
    WHERE s.tenant_id = '${tenantId}'
      AND CAST(s.outstanding_balance AS numeric) > 0
    GROUP BY s.id, s.name, s.outstanding_balance
    ORDER BY outstanding_balance DESC
  `),
  );
  return { rows };
}

// ---------- 7. Outstanding Receivables ----------

async function outstandingReceivablesReport(tenantId: string, _params: ReportParams) {
  const rows = await db.execute(
    sql.raw(`
    SELECT c.id, c.name, c.phone,
           CAST(c.outstanding_balance AS numeric) AS outstanding_balance
    FROM customers c
    WHERE c.tenant_id = '${tenantId}'
      AND CAST(c.outstanding_balance AS numeric) > 0
    ORDER BY outstanding_balance DESC
  `),
  );
  return { rows };
}

// ---------- 8. Customer Ledger ----------

async function customerLedgerReport(tenantId: string, params: ReportParams) {
  if (!params.partyId) throw new ValidationError('partyId is required for customer-ledger report');
  const { partyId, from, to, limit = 100, offset = 0 } = params;

  const rows = await db.execute(
    sql.raw(`
    SELECT le.id, le.entry_type, le.description,
           CAST(le.debit AS numeric) AS debit,
           CAST(le.credit AS numeric) AS credit,
           le.created_at,
           SUM(CAST(le.debit AS numeric) - CAST(le.credit AS numeric))
             OVER (ORDER BY le.created_at, le.id) AS running_balance
    FROM ledger_entries le
    WHERE le.tenant_id = '${tenantId}'
      AND le.party_type = 'customer'
      AND le.party_id = '${partyId}'
      ${dateFilter(from, to, 'le.created_at')}
    ORDER BY le.created_at, le.id
    LIMIT ${limit + 1} OFFSET ${offset}
  `),
  );

  const items = (rows as any[]).slice(0, limit);
  const hasMore = (rows as any[]).length > limit;
  return { rows: items, hasMore };
}

// ---------- 9. Supplier Ledger ----------

async function supplierLedgerReport(tenantId: string, params: ReportParams) {
  if (!params.partyId) throw new ValidationError('partyId is required for supplier-ledger report');
  const { partyId, from, to, limit = 100, offset = 0 } = params;

  const rows = await db.execute(
    sql.raw(`
    SELECT le.id, le.entry_type, le.description,
           CAST(le.debit AS numeric) AS debit,
           CAST(le.credit AS numeric) AS credit,
           le.created_at,
           SUM(CAST(le.debit AS numeric) - CAST(le.credit AS numeric))
             OVER (ORDER BY le.created_at, le.id) AS running_balance
    FROM ledger_entries le
    WHERE le.tenant_id = '${tenantId}'
      AND le.party_type = 'supplier'
      AND le.party_id = '${partyId}'
      ${dateFilter(from, to, 'le.created_at')}
    ORDER BY le.created_at, le.id
    LIMIT ${limit + 1} OFFSET ${offset}
  `),
  );

  const items = (rows as any[]).slice(0, limit);
  const hasMore = (rows as any[]).length > limit;
  return { rows: items, hasMore };
}

// ---------- 10. Cash Register ----------

async function cashRegisterReport(tenantId: string, params: ReportParams) {
  if (!params.registerId)
    throw new ValidationError('registerId is required for cash-register report');
  const { registerId } = params;

  const register = await db.execute(
    sql.raw(`
    SELECT cr.id, cr.register_date, cr.opening_balance,
           cr.calculated_closing, cr.actual_closing, cr.discrepancy, cr.status,
           u.name AS user_name
    FROM cash_registers cr
    JOIN users u ON cr.user_id = u.id
    WHERE cr.id = '${registerId}' AND cr.tenant_id = '${tenantId}'
  `),
  );

  const entries = await db.execute(
    sql.raw(`
    SELECT cre.id, cre.type, CAST(cre.amount AS numeric) AS amount,
           cre.description, cre.reference_type, cre.reference_id, cre.created_at
    FROM cash_register_entries cre
    WHERE cre.register_id = '${registerId}'
    ORDER BY cre.created_at ASC
  `),
  );

  return { register: (register as any[])[0] ?? null, entries };
}

// ---------- 11. Profit & Loss ----------

async function pnlReport(tenantId: string, params: ReportParams) {
  const { from, to } = params;

  const [revenueResult, cogsResult, expenseResult] = await Promise.all([
    // Revenue
    db.execute(
      sql.raw(`
      SELECT COALESCE(SUM(CAST(net_amount AS numeric)), 0) AS revenue
      FROM bills
      WHERE tenant_id = '${tenantId}'
        AND status IN ('completed', 'partially_returned')
        ${dateFilter(from, to)}
    `),
    ),
    // COGS
    db.execute(
      sql.raw(`
      SELECT COALESCE(SUM(CAST(bi.cost_price AS numeric) * bi.quantity), 0) AS cogs
      FROM bill_items bi
      JOIN bills b ON bi.bill_id = b.id
      WHERE b.tenant_id = '${tenantId}'
        AND b.status IN ('completed', 'partially_returned')
        ${dateFilter(from, to, 'b.created_at')}
    `),
    ),
    // Expenses
    db.execute(
      sql.raw(`
      SELECT COALESCE(SUM(CAST(amount AS numeric)), 0) AS total_expenses
      FROM expenses
      WHERE tenant_id = '${tenantId}'
        ${dateFilter(from, to, 'expense_date')}
    `),
    ),
  ]);

  const revenue = Number((revenueResult as any[])[0]?.revenue ?? 0);
  const cogs = Number((cogsResult as any[])[0]?.cogs ?? 0);
  const totalExpenses = Number((expenseResult as any[])[0]?.total_expenses ?? 0);
  const grossProfit = revenue - cogs;
  const netProfit = grossProfit - totalExpenses;

  return {
    revenue,
    cogs,
    grossProfit,
    totalExpenses,
    netProfit,
  };
}

// ---------- 12. Purchase Summary ----------

async function purchaseSummaryReport(tenantId: string, params: ReportParams) {
  const { from, to } = params;
  const rows = await db.execute(
    sql.raw(`
    SELECT s.id AS supplier_id, s.name AS supplier_name,
           COALESCE(SUM(CAST(p.total_amount AS numeric)), 0) AS total_purchased,
           COUNT(*)::int AS purchase_count
    FROM purchases p
    JOIN suppliers s ON p.supplier_id = s.id
    WHERE p.tenant_id = '${tenantId}'
      ${dateFilter(from, to, 'p.created_at')}
    GROUP BY s.id, s.name
    ORDER BY total_purchased DESC
  `),
  );
  return { rows };
}

// ---------- 13. Expense Report ----------

async function expenseReport(tenantId: string, params: ReportParams) {
  const { from, to } = params;
  const rows = await db.execute(
    sql.raw(`
    SELECT category,
           COALESCE(SUM(CAST(amount AS numeric)), 0) AS total_amount,
           COUNT(*)::int AS entry_count
    FROM expenses
    WHERE tenant_id = '${tenantId}'
      ${dateFilter(from, to, 'expense_date')}
    GROUP BY category
    ORDER BY total_amount DESC
  `),
  );
  return { rows };
}

// ---------- 14. GST Summary ----------

async function gstSummaryReport(tenantId: string, params: ReportParams) {
  const { from, to } = params;

  const [outputTax, inputTax] = await Promise.all([
    // Output tax from sales
    db.execute(
      sql.raw(`
      SELECT COALESCE(SUM(CAST(bi.cgst_amount AS numeric)), 0) AS total_cgst,
             COALESCE(SUM(CAST(bi.sgst_amount AS numeric)), 0) AS total_sgst,
             COALESCE(SUM(CAST(bi.cgst_amount AS numeric) + CAST(bi.sgst_amount AS numeric)), 0) AS total_output_tax
      FROM bill_items bi
      JOIN bills b ON bi.bill_id = b.id
      WHERE b.tenant_id = '${tenantId}'
        AND b.status IN ('completed', 'partially_returned')
        ${dateFilter(from, to, 'b.created_at')}
    `),
    ),
    // Input tax from purchases
    db.execute(
      sql.raw(`
      SELECT COALESCE(SUM(CAST(cgst_amount AS numeric)), 0) AS total_cgst,
             COALESCE(SUM(CAST(sgst_amount AS numeric)), 0) AS total_sgst,
             COALESCE(SUM(CAST(igst_amount AS numeric)), 0) AS total_igst,
             COALESCE(SUM(CAST(cgst_amount AS numeric) + CAST(sgst_amount AS numeric) + CAST(igst_amount AS numeric)), 0) AS total_input_tax
      FROM purchases
      WHERE tenant_id = '${tenantId}'
        ${dateFilter(from, to, 'created_at')}
    `),
    ),
  ]);

  const output = (outputTax as any[])[0] ?? {};
  const input = (inputTax as any[])[0] ?? {};
  const outputTotal = Number(output.total_output_tax ?? 0);
  const inputTotal = Number(input.total_input_tax ?? 0);

  return {
    outputTax: {
      cgst: Number(output.total_cgst ?? 0),
      sgst: Number(output.total_sgst ?? 0),
      total: outputTotal,
    },
    inputTax: {
      cgst: Number(input.total_cgst ?? 0),
      sgst: Number(input.total_sgst ?? 0),
      igst: Number(input.total_igst ?? 0),
      total: inputTotal,
    },
    netLiability: outputTotal - inputTotal,
  };
}

// ---------- 15. Bargain / Additional Discount Report ----------

async function bargainDiscountReport(tenantId: string, params: ReportParams) {
  const { from, to } = params;
  const rows = await db.execute(
    sql.raw(`
    SELECT b.salesperson_id,
           u.name AS salesperson_name,
           COALESCE(SUM(CAST(b.additional_discount_amount AS numeric)), 0) AS total_discount_given,
           COUNT(*)::int AS bill_count
    FROM bills b
    JOIN users u ON b.salesperson_id = u.id
    WHERE b.tenant_id = '${tenantId}'
      AND b.status IN ('completed', 'partially_returned')
      AND CAST(b.additional_discount_amount AS numeric) > 0
      ${dateFilter(from, to, 'b.created_at')}
    GROUP BY b.salesperson_id, u.name
    ORDER BY total_discount_given DESC
  `),
  );
  return { rows };
}

// ---------- 16. Aging Inventory ----------

async function agingInventoryReport(tenantId: string, _params: ReportParams) {
  const rows = await db.execute(
    sql.raw(`
    SELECT p.id, p.name, p.sku, p.current_stock,
           CAST(p.cost_price AS numeric) AS unit_cost,
           (p.current_stock * CAST(p.cost_price AS numeric)) AS stock_value,
           c.name AS category_name,
           MAX(se.created_at) AS last_sale_date,
           EXTRACT(DAY FROM NOW() - COALESCE(MAX(se.created_at), p.created_at))::int AS days_since_last_sale
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    LEFT JOIN stock_entries se ON se.product_id = p.id
      AND se.tenant_id = '${tenantId}' AND se.type = 'sale'
    WHERE p.tenant_id = '${tenantId}'
      AND p.is_active = true
      AND p.current_stock > 0
    GROUP BY p.id, p.name, p.sku, p.current_stock, p.cost_price, p.created_at, c.name
    HAVING NOT EXISTS (
      SELECT 1 FROM stock_entries se2
      WHERE se2.product_id = p.id AND se2.tenant_id = '${tenantId}'
        AND se2.type = 'sale' AND se2.created_at >= NOW() - INTERVAL '90 days'
    )
    ORDER BY days_since_last_sale DESC
  `),
  );
  return { rows };
}

// ---------- 17. Dead Stock ----------

async function deadStockReport(tenantId: string, params: ReportParams) {
  const { from, to } = params;
  // Default date range: last 180 days if not specified
  const fromDate =
    from ?? new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const toDate = to ?? new Date().toISOString().slice(0, 10);

  const rows = await db.execute(
    sql.raw(`
    SELECT p.id, p.name, p.sku, p.current_stock,
           CAST(p.cost_price AS numeric) AS unit_cost,
           (p.current_stock * CAST(p.cost_price AS numeric)) AS stock_value,
           c.name AS category_name
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.tenant_id = '${tenantId}'
      AND p.is_active = true
      AND p.current_stock > 0
      AND NOT EXISTS (
        SELECT 1 FROM bill_items bi
        JOIN bills b ON bi.bill_id = b.id
        WHERE bi.product_id = p.id
          AND b.tenant_id = '${tenantId}'
          AND b.status IN ('completed', 'partially_returned')
          AND b.created_at >= '${fromDate}'
          AND b.created_at <= '${toDate}'
      )
    ORDER BY stock_value DESC
  `),
  );
  return { rows };
}
