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

  // Register job handlers
  const { handleResizeProductImage } = await import('./resize-product-image.js');
  await boss.work('resize-product-image', async ([job]) => {
    await handleResizeProductImage(job.data as any);
  });

  console.info('[pg-boss] Worker started');
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
  return boss.send(name, data, options ?? {});
}

export function getBoss(): PgBoss | null {
  return boss;
}
