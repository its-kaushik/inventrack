import { Job } from 'bullmq';
import { sql } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { notifications } from '../../db/schema/notifications.js';
import { logger } from '../../lib/logger.js';

export default async function processAgingInventory(job: Job) {
  logger.info({ jobId: job.id }, 'Running aging inventory digest');

  const tenants = (await db.execute(sql`
    SELECT id, settings FROM tenants WHERE status = 'active'
  `)) as any[];

  for (const tenant of tenants) {
    const tenantId = tenant.id;
    const thresholdDays = (tenant.settings as any)?.aging_threshold_days ?? 90;

    // Products with positive stock but no sale in the threshold period
    const agingProducts = (await db.execute(sql`
      SELECT p.id, p.name, p.sku, p.current_stock, p.selling_price
      FROM products p
      WHERE p.tenant_id = ${tenantId} AND p.is_active = true AND p.current_stock > 0
        AND NOT EXISTS (
          SELECT 1 FROM stock_entries se
          WHERE se.product_id = p.id AND se.tenant_id = ${tenantId}
            AND se.type = 'sale' AND se.created_at >= NOW() - MAKE_INTERVAL(days => ${thresholdDays})
        )
      ORDER BY p.current_stock DESC
      LIMIT 50
    `)) as any[];

    if (agingProducts.length === 0) continue;

    await db.insert(notifications).values({
      tenantId,
      userId: null,
      type: 'aging',
      title: `${agingProducts.length} product(s) with no sales in ${thresholdDays} days`,
      body: agingProducts
        .slice(0, 5)
        .map((p: any) => `${p.name} (${p.current_stock} units)`)
        .join(', '),
      data: { count: agingProducts.length, thresholdDays, products: agingProducts.slice(0, 20) },
    });

    logger.info({ tenantId, count: agingProducts.length }, 'Aging inventory digest created');
  }
}
