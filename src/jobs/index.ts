import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { registerSchedules } from './scheduler.js';
import { startWorkers } from './worker.js';

export async function initJobs() {
  if (!env.REDIS_URL) {
    logger.warn('REDIS_URL not configured — skipping job infrastructure');
    return;
  }

  await registerSchedules();
  startWorkers();
  logger.info('Job infrastructure initialized');
}
