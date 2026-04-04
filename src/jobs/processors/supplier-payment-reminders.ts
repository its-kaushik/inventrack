import { Job } from 'bullmq';
import { sql } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { notifications } from '../../db/schema/notifications.js';
import { logger } from '../../lib/logger.js';

export default async function processSupplierPaymentReminders(job: Job) {
  logger.info({ jobId: job.id }, 'Running supplier payment reminders');

  const tenants = (await db.execute(sql`
    SELECT id FROM tenants WHERE status = 'active'
  `)) as any[];

  for (const tenant of tenants) {
    const tenantId = tenant.id;

    // Find supplier payments due within 3 days or overdue
    const dueSoon = (await db.execute(sql`
      SELECT s.id AS supplier_id, s.name AS supplier_name, le.due_date,
             COALESCE(SUM(CAST(le.debit AS numeric) - CAST(le.credit AS numeric)), 0) AS amount
      FROM ledger_entries le
      JOIN suppliers s ON le.party_id = s.id
      WHERE le.tenant_id = ${tenantId} AND le.party_type = 'supplier'
        AND le.due_date IS NOT NULL AND le.due_date <= CURRENT_DATE + 3
      GROUP BY s.id, s.name, le.due_date
      HAVING SUM(CAST(le.debit AS numeric) - CAST(le.credit AS numeric)) > 0
      ORDER BY le.due_date ASC
      LIMIT 20
    `)) as any[];

    if (dueSoon.length === 0) continue;

    // Create tenant-wide notification
    await db.insert(notifications).values({
      tenantId,
      userId: null,
      type: 'payment_due',
      title: `${dueSoon.length} supplier payment(s) due soon`,
      body: dueSoon
        .slice(0, 5)
        .map((r: any) => `${r.supplier_name}: ₹${Number(r.amount).toFixed(2)} due ${r.due_date}`)
        .join(', '),
      data: { suppliers: dueSoon },
    });

    logger.info({ tenantId, count: dueSoon.length }, 'Supplier payment reminder created');
  }
}
