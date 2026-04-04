import { Job } from 'bullmq';
import { sql } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { logger } from '../../lib/logger.js';

export default async function processAuditPartition(job: Job) {
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const monthAfter = new Date(now.getFullYear(), now.getMonth() + 2, 1);
  const partitionName = `audit_logs_${nextMonth.getFullYear()}_${String(nextMonth.getMonth() + 1).padStart(2, '0')}`;
  const fromDate = nextMonth.toISOString().slice(0, 10);
  const toDate = monthAfter.toISOString().slice(0, 10);

  try {
    await db.execute(
      sql.raw(
        `CREATE TABLE IF NOT EXISTS ${partitionName} PARTITION OF audit_logs FOR VALUES FROM ('${fromDate}') TO ('${toDate}')`,
      ),
    );
    logger.info({ partitionName, fromDate, toDate }, 'Audit log partition created');
  } catch (err) {
    logger.error({ err, partitionName }, 'Failed to create audit partition');
  }
}
