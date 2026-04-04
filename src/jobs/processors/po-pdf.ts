import { Job } from 'bullmq';
import { logger } from '../../lib/logger.js';

export default async function processPoPdf(job: Job) {
  logger.info({ jobId: job.id, data: job.data }, 'Processing PO PDF generation');
}
