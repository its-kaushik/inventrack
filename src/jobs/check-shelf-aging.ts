import { eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { tenants, tenantSettings } from '../db/schema/tenants.js';
import { notify } from '../services/notification.service.js';

export async function handleCheckShelfAging(): Promise<void> {
  // Process all active tenants
  const allTenants = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.status, 'active'));

  for (const tenant of allTenants) {
    const [settings] = await db.select({ threshold: tenantSettings.shelfAgingThresholdDays })
      .from(tenantSettings).where(eq(tenantSettings.tenantId, tenant.id));
    const thresholdDays = settings?.threshold ?? 90;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - thresholdDays);

    const agingItems = await db.execute(sql`
      SELECT COUNT(DISTINCT pv.id)::int as count
      FROM product_variants pv
      INNER JOIN products p ON pv.product_id = p.id
      INNER JOIN inventory_movements im ON im.variant_id = pv.id AND im.movement_type IN ('purchase', 'opening_balance')
      WHERE pv.tenant_id = ${tenant.id} AND pv.is_active = true AND pv.available_quantity > 0
        AND p.deleted_at IS NULL AND p.is_archived = false
      HAVING MIN(im.created_at) < ${cutoff.toISOString()}::timestamptz
    `);

    const count = (agingItems as any)?.count ?? 0;
    if (count > 0) {
      await notify(tenant.id, {
        type: 'shelf_aging',
        title: 'Aging Inventory Alert',
        message: `${count} items have been in stock for over ${thresholdDays} days`,
        priority: 'medium',
        data: { count, thresholdDays },
        targetRoles: ['owner', 'manager'],
      });
    }
  }
}
