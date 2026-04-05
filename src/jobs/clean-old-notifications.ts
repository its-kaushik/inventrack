import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { notifications } from '../db/schema/notifications.js';
import { CONSTANTS } from '../config/constants.js';

export async function handleCleanOldNotifications(): Promise<void> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - CONSTANTS.JOBS.NOTIFICATION_RETENTION_DAYS);

  const result = await db.delete(notifications)
    .where(sql`${notifications.createdAt} < ${cutoff.toISOString()}::timestamptz`)
    .returning({ id: notifications.id });

  if (result.length > 0) {
    console.info(`[clean-old-notifications] Removed ${result.length} notifications older than ${CONSTANTS.JOBS.NOTIFICATION_RETENTION_DAYS} days`);
  }
}
