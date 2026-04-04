import { Worker } from 'bullmq';
import { createBullMQConnection } from './connection.js';
import { QUEUE_NAMES } from './queues.js';
import { logger } from '../lib/logger.js';
import processHeldBillsCleanup from './processors/held-bills-cleanup.js';
import processLowStockCheck from './processors/low-stock-check.js';
import processSupplierPaymentReminders from './processors/supplier-payment-reminders.js';
import processAgingInventory from './processors/aging-inventory.js';
import processDailySalesSummary from './processors/daily-sales-summary.js';
import processRecurringExpenses from './processors/recurring-expenses.js';
import processPoPdf from './processors/po-pdf.js';
import processReportExport from './processors/report-export.js';
import processAuditPartition from './processors/audit-partition.js';

const workers: Worker[] = [];

export function startWorkers() {
  const connection = createBullMQConnection();
  if (!connection) return;

  const workerDefs = [
    { name: QUEUE_NAMES.HELD_BILLS_CLEANUP, processor: processHeldBillsCleanup },
    { name: QUEUE_NAMES.LOW_STOCK_CHECK, processor: processLowStockCheck },
    { name: QUEUE_NAMES.SUPPLIER_PAYMENT_REMINDERS, processor: processSupplierPaymentReminders },
    { name: QUEUE_NAMES.AGING_INVENTORY_DIGEST, processor: processAgingInventory },
    { name: QUEUE_NAMES.DAILY_SALES_SUMMARY, processor: processDailySalesSummary },
    { name: QUEUE_NAMES.RECURRING_EXPENSES, processor: processRecurringExpenses },
    { name: QUEUE_NAMES.PO_PDF, processor: processPoPdf },
    { name: QUEUE_NAMES.REPORT_EXPORT, processor: processReportExport },
    { name: QUEUE_NAMES.AUDIT_PARTITION, processor: processAuditPartition },
  ];

  for (const { name, processor } of workerDefs) {
    const worker = new Worker(name, processor, { connection });

    worker.on('completed', (job) => {
      logger.info({ job: job.name, id: job.id }, `Job ${job.name} completed`);
    });

    worker.on('failed', (job, err) => {
      logger.error({ job: job?.name, id: job?.id, err }, `Job ${job?.name} failed`);
    });

    workers.push(worker);
    logger.info({ queue: name }, `Worker started for ${name}`);
  }
}

export async function stopWorkers() {
  await Promise.all(workers.map((w) => w.close()));
  workers.length = 0;
}
