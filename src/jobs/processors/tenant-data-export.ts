import { Job } from 'bullmq';
import * as dataExportService from '../../services/data-export.service.js';
import { logger } from '../../lib/logger.js';

export default async function processTenantDataExport(job: Job) {
  const { tenantId, userId } = job.data;
  logger.info({ jobId: job.id, tenantId }, 'Processing tenant data export');
  await dataExportService.exportTenantData(tenantId, userId);
  logger.info({ jobId: job.id, tenantId }, 'Tenant data export complete');
}
