import { Job } from 'bullmq';
import { sql } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { logger } from '../../lib/logger.js';

export default async function processHeldBillsCleanup(job: Job) {
  logger.info({ jobId: job.id }, 'Running held bills cleanup');

  const result = await db.execute(sql`
    DELETE FROM bills
    WHERE status = 'held'
      AND created_at < NOW() - INTERVAL '24 hours'
  `);

  const count = (result as any).count ?? 0;
  logger.info({ jobId: job.id, deleted: count }, 'Held bills cleanup complete');
}
