import { eq, and, sql } from 'drizzle-orm';
import { tenants } from '../db/schema/tenants.js';
import { billSequences } from '../db/schema/bill-sequences.js';
import { getCurrentFinancialYear, getFinancialYearShort } from '../lib/date-utils.js';

export async function next(
  tx: any,
  tenantId: string,
  type: 'bill' | 'po' | 'return'
): Promise<string> {
  // Get tenant for prefix and FY start
  const [tenant] = await tx
    .select({ invoicePrefix: tenants.invoicePrefix, financialYearStart: tenants.financialYearStart })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  const fy = getCurrentFinancialYear(tenant?.financialYearStart ?? 4);
  const fyShort = getFinancialYearShort(fy);
  const prefix = tenant?.invoicePrefix ?? 'INV';

  // Atomic increment with row-level lock
  const result = await tx.execute(
    sql`INSERT INTO bill_sequences (tenant_id, sequence_type, financial_year, last_number)
        VALUES (${tenantId}, ${type}, ${fy}, 1)
        ON CONFLICT (tenant_id, sequence_type, financial_year)
        DO UPDATE SET last_number = bill_sequences.last_number + 1
        RETURNING last_number`
  );

  const lastNumber = result[0]?.last_number ?? 1;
  const padded = String(lastNumber).padStart(5, '0');

  return `${prefix}-${fyShort}-${padded}`;
}
