import { PgBoss } from 'pg-boss';
import type { SendOptions } from 'pg-boss';
import { env } from '../config/env.js';

let boss: PgBoss | null = null;

export async function startWorker(): Promise<PgBoss> {
  // pg-boss needs a direct connection (not PgBouncer) for LISTEN/NOTIFY
  boss = new PgBoss(env.DATABASE_URL_DIRECT ?? env.DATABASE_URL);

  boss.on('error', (error: Error) => {
    console.error('[pg-boss] Error:', error);
  });

  await boss.start();

  // pg-boss v12+ requires queues to be created before workers can listen.
  // createQueue is idempotent — safe to call on every startup.
  const allQueues = [
    'resize-product-image',
    'check-low-stock',
    'check-shelf-aging',
    'generate-daily-summary',
    'check-credit-overdue',
    'clean-parked-bills',
    'clean-expired-tokens',
    'clean-old-notifications',
  ];
  for (const name of allQueues) {
    await boss.createQueue(name);
  }

  // Register event-triggered job handlers
  const { handleResizeProductImage } = await import('./resize-product-image.js');
  await boss.work('resize-product-image', async ([job]) => {
    await handleResizeProductImage(job.data as any);
  });

  const { handleCheckLowStock } = await import('./check-low-stock.js');
  await boss.work('check-low-stock', async ([job]) => {
    await handleCheckLowStock(job.data as any);
  });

  // Cron job handlers (all with singletonKey for horizontal scaling safety)
  const { handleCheckShelfAging } = await import('./check-shelf-aging.js');
  const { handleCheckCreditOverdue } = await import('./check-credit-overdue.js');
  const { handleGenerateDailySummary } = await import('./generate-daily-summary.js');
  const { handleCleanParkedBills } = await import('./clean-parked-bills.js');
  const { handleCleanExpiredTokens } = await import('./clean-expired-tokens.js');
  const { handleCleanOldNotifications } = await import('./clean-old-notifications.js');

  // Schedule cron jobs
  await boss.schedule('check-shelf-aging', '0 0 * * *', {}, { singletonKey: 'check-shelf-aging' });
  await boss.schedule('generate-daily-summary', '0 21 * * *', {}, { singletonKey: 'generate-daily-summary' });
  await boss.schedule('check-credit-overdue', '0 8 * * *', {}, { singletonKey: 'check-credit-overdue' });
  await boss.schedule('clean-parked-bills', '0 * * * *', {}, { singletonKey: 'clean-parked-bills' });
  await boss.schedule('clean-expired-tokens', '0 3 * * *', {}, { singletonKey: 'clean-expired-tokens' });
  await boss.schedule('clean-old-notifications', '0 4 * * 0', {}, { singletonKey: 'clean-old-notifications' });

  // Register cron job workers
  await boss.work('check-shelf-aging', async () => { await handleCheckShelfAging(); });
  await boss.work('generate-daily-summary', async () => { await handleGenerateDailySummary(); });
  await boss.work('check-credit-overdue', async () => { await handleCheckCreditOverdue(); });
  await boss.work('clean-parked-bills', async () => { await handleCleanParkedBills(); });
  await boss.work('clean-expired-tokens', async () => { await handleCleanExpiredTokens(); });
  await boss.work('clean-old-notifications', async () => { await handleCleanOldNotifications(); });

  console.info('[pg-boss] Worker started with 8 queues, 8 job handlers, 6 cron schedules');
  return boss;
}

export async function stopWorker(): Promise<void> {
  if (boss) {
    await boss.stop({ graceful: true, timeout: 10_000 });
    console.info('[pg-boss] Worker stopped');
    boss = null;
  }
}

export async function enqueueJob<T extends object>(
  name: string,
  data: T,
  options?: SendOptions,
): Promise<string | null> {
  if (!boss) {
    console.warn('[pg-boss] Worker not started, cannot enqueue job:', name);
    return null;
  }
  // Ensure queue exists (idempotent) before sending
  await boss.createQueue(name);
  return boss.send(name, data, options ?? {});
}

export function getBoss(): PgBoss | null {
  return boss;
}
