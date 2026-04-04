import { Job } from 'bullmq';
import { sql } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { notifications } from '../../db/schema/notifications.js';
import { logger } from '../../lib/logger.js';

export default async function processDailySalesSummary(job: Job) {
  logger.info({ jobId: job.id }, 'Running daily sales summary');

  const tenants = (await db.execute(sql`
    SELECT id FROM tenants WHERE status = 'active'
  `)) as any[];

  for (const tenant of tenants) {
    const tenantId = tenant.id;

    const [summary] = (await db.execute(sql`
      SELECT
        COALESCE(SUM(CAST(net_amount AS numeric)), 0) AS total_sales,
        COUNT(*)::int AS bill_count
      FROM bills
      WHERE tenant_id = ${tenantId} AND status = 'completed'
        AND created_at >= CURRENT_DATE AND created_at < CURRENT_DATE + 1
    `)) as any[];

    const paymentSplit = (await db.execute(sql`
      SELECT bp.mode, COALESCE(SUM(CAST(bp.amount AS numeric)), 0) AS total
      FROM bill_payments bp
      JOIN bills b ON bp.bill_id = b.id
      WHERE b.tenant_id = ${tenantId} AND b.status = 'completed'
        AND b.created_at >= CURRENT_DATE AND b.created_at < CURRENT_DATE + 1
      GROUP BY bp.mode
    `)) as any[];

    const totalSales = Number(summary?.total_sales ?? 0);
    const billCount = Number(summary?.bill_count ?? 0);

    if (billCount === 0) continue;

    const modes = (paymentSplit as any[]).reduce((acc: Record<string, number>, r: any) => {
      acc[r.mode] = Number(r.total);
      return acc;
    }, {});

    await db.insert(notifications).values({
      tenantId,
      userId: null,
      type: 'daily_summary',
      title: `Daily summary: ${billCount} bills, ₹${totalSales.toFixed(2)} sales`,
      body: Object.entries(modes)
        .map(([mode, amt]) => `${mode}: ₹${(amt as number).toFixed(2)}`)
        .join(', '),
      data: {
        totalSales,
        billCount,
        paymentSplit: modes,
        date: new Date().toISOString().slice(0, 10),
      },
    });

    logger.info({ tenantId, totalSales, billCount }, 'Daily sales summary created');
  }
}
