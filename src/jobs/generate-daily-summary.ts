import { eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { tenants } from '../db/schema/tenants.js';
import { notify } from '../services/notification.service.js';

export async function handleGenerateDailySummary(): Promise<void> {
  const allTenants = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.status, 'active'));

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  for (const tenant of allTenants) {
    const [summary] = await db.execute(sql`
      SELECT
        COALESCE(COUNT(*), 0)::int as transaction_count,
        COALESCE(SUM(net_payable::numeric), 0) as total_revenue,
        COALESCE(SUM(total_cogs::numeric), 0) as total_cogs
      FROM sales
      WHERE tenant_id = ${tenant.id} AND status = 'completed'
        AND created_at >= ${todayStart.toISOString()}::timestamptz
    `);

    const txCount = (summary as any)?.transaction_count ?? 0;
    const revenue = Number((summary as any)?.total_revenue ?? 0);
    const cogs = Number((summary as any)?.total_cogs ?? 0);
    const profit = revenue - cogs;

    await notify(tenant.id, {
      type: 'daily_summary',
      title: 'Daily Sales Summary',
      message: `Today: ${txCount} transactions, Revenue: ₹${Math.round(revenue)}, Gross Profit: ₹${Math.round(profit)}`,
      priority: 'low',
      data: { transactionCount: txCount, revenue, cogs, profit },
      targetRoles: ['owner'],
    });
  }
}
