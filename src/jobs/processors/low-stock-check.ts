import { Job } from 'bullmq';
import { sql } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { notifications } from '../../db/schema/notifications.js';
import { logger } from '../../lib/logger.js';

export default async function processLowStockCheck(job: Job) {
  logger.info({ jobId: job.id }, 'Running low stock check');

  // Get all active tenants
  const tenants = (await db.execute(sql`
    SELECT id FROM tenants WHERE status = 'active'
  `)) as any[];

  for (const tenant of tenants) {
    const tenantId = tenant.id;

    // Find products below minimum stock
    const lowStockItems = (await db.execute(sql`
      SELECT id, name, sku, current_stock, min_stock_level
      FROM products
      WHERE tenant_id = ${tenantId} AND is_active = true
        AND current_stock <= min_stock_level
    `)) as any[];

    if (lowStockItems.length === 0) continue;

    // Check for existing unread low_stock notification in the last hour to avoid spam
    const [existing] = (await db.execute(sql`
      SELECT id FROM notifications
      WHERE tenant_id = ${tenantId} AND type = 'low_stock'
        AND is_read = false AND created_at >= NOW() - INTERVAL '1 hour'
      LIMIT 1
    `)) as any[];

    if (existing) continue;

    // Create tenant-wide notification (userId = null)
    await db.insert(notifications).values({
      tenantId,
      userId: null,
      type: 'low_stock',
      title: `${lowStockItems.length} product(s) below minimum stock`,
      body: lowStockItems
        .slice(0, 5)
        .map((p: any) => `${p.name} (${p.sku}): ${p.current_stock}/${p.min_stock_level}`)
        .join(', '),
      data: { count: lowStockItems.length, products: lowStockItems.slice(0, 20) },
    });

    logger.info({ tenantId, count: lowStockItems.length }, 'Low stock notification created');
  }
}
