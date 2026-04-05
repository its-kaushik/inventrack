import { eq, and, gt, sql, isNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import { tenants } from '../db/schema/tenants.js';
import { customers } from '../db/schema/customers.js';
import { suppliers } from '../db/schema/suppliers.js';
import { notify } from '../services/notification.service.js';

export async function handleCheckCreditOverdue(): Promise<void> {
  const allTenants = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.status, 'active'));

  for (const tenant of allTenants) {
    // Customer credit overdue (balance > 0 for more than 30 days)
    const overdueCustomers = await db.execute(sql`
      SELECT COUNT(*)::int as count, COALESCE(SUM(outstanding_balance::numeric), 0) as total
      FROM customers
      WHERE tenant_id = ${tenant.id} AND deleted_at IS NULL
        AND outstanding_balance::numeric > 0
        AND updated_at < NOW() - INTERVAL '30 days'
    `);

    const custCount = (overdueCustomers as any)?.count ?? 0;
    if (custCount > 0) {
      await notify(tenant.id, {
        type: 'credit_overdue',
        title: 'Customer Credit Overdue',
        message: `${custCount} customers have outstanding balances older than 30 days`,
        priority: 'medium',
        data: { count: custCount, total: Number((overdueCustomers as any)?.total ?? 0) },
        targetRoles: ['owner', 'manager'],
      });
    }

    // Supplier payment due (balance > 0)
    const dueSuppliers = await db.execute(sql`
      SELECT COUNT(*)::int as count, COALESCE(SUM(outstanding_balance::numeric), 0) as total
      FROM suppliers
      WHERE tenant_id = ${tenant.id} AND deleted_at IS NULL
        AND outstanding_balance::numeric > 0
    `);

    const supCount = (dueSuppliers as any)?.count ?? 0;
    if (supCount > 0) {
      await notify(tenant.id, {
        type: 'supplier_payment_due',
        title: 'Supplier Payments Due',
        message: `${supCount} suppliers have outstanding balances`,
        priority: 'medium',
        data: { count: supCount, total: Number((dueSuppliers as any)?.total ?? 0) },
        targetRoles: ['owner', 'manager'],
      });
    }
  }
}
