import { logger } from '../lib/logger.js';
import {
  heldBillsCleanupQueue,
  lowStockCheckQueue,
  supplierPaymentRemindersQueue,
  agingInventoryDigestQueue,
  dailySalesSummaryQueue,
} from './queues.js';

export async function registerSchedules() {
  const schedules: Array<{ queue: typeof heldBillsCleanupQueue; name: string; pattern: string }> = [
    { queue: heldBillsCleanupQueue, name: 'held-bills-cleanup', pattern: '0 0 * * *' },
    { queue: lowStockCheckQueue, name: 'low-stock-check', pattern: '0 * * * *' },
    {
      queue: supplierPaymentRemindersQueue,
      name: 'supplier-payment-reminders',
      pattern: '0 9 * * *',
    },
    { queue: agingInventoryDigestQueue, name: 'aging-inventory-digest', pattern: '0 8 * * 1' },
    { queue: dailySalesSummaryQueue, name: 'daily-sales-summary', pattern: '0 21 * * *' },
  ];

  for (const { queue, name, pattern } of schedules) {
    if (!queue) continue;
    await queue.upsertJobScheduler(name, { pattern }, { name });
    logger.info({ queue: name, pattern }, `Registered schedule for ${name}`);
  }
}
