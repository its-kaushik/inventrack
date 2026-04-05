import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { refreshTokens } from '../db/schema/users.js';

export async function handleCleanExpiredTokens(): Promise<void> {
  const result = await db.delete(refreshTokens)
    .where(sql`${refreshTokens.expiresAt} < NOW()`)
    .returning({ id: refreshTokens.id });

  if (result.length > 0) {
    console.info(`[clean-expired-tokens] Removed ${result.length} expired tokens`);
  }
}
