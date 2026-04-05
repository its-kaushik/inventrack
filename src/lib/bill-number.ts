import { eq, and, sql } from 'drizzle-orm';
import { billNumberSequences } from '../db/schema/sales.js';
import { getCurrentFYCode } from './financial-year.js';
import type { Transaction } from '../db/client.js';

/**
 * Generate next bill number within a transaction.
 * Uses INSERT ... ON CONFLICT for upsert + atomic increment with row lock.
 */
export async function generateBillNumber(
  tx: Transaction,
  tenantId: string,
  prefix: string,
): Promise<string> {
  const fy = getCurrentFYCode();

  // Upsert: create sequence row if not exists
  await tx
    .insert(billNumberSequences)
    .values({ tenantId, financialYear: fy, prefix, lastNumber: 0 })
    .onConflictDoNothing();

  // Atomic increment with row lock (FOR UPDATE via the update itself)
  const [result] = await tx
    .update(billNumberSequences)
    .set({ lastNumber: sql`${billNumberSequences.lastNumber} + 1` })
    .where(
      and(
        eq(billNumberSequences.tenantId, tenantId),
        eq(billNumberSequences.financialYear, fy),
        eq(billNumberSequences.prefix, prefix),
      ),
    )
    .returning({ lastNumber: billNumberSequences.lastNumber });

  const seq = String(result.lastNumber).padStart(5, '0');
  return `${prefix}-${fy}-${seq}`; // e.g., KVB-2627-00001
}
