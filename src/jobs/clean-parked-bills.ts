import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { parkedBills } from '../db/schema/sales.js';

export async function handleCleanParkedBills(): Promise<void> {
  const result = await db.delete(parkedBills)
    .where(sql`${parkedBills.expiresAt} < NOW()`)
    .returning({ id: parkedBills.id });

  if (result.length > 0) {
    console.info(`[clean-parked-bills] Removed ${result.length} expired parked bills`);
  }
}
