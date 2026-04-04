import { Queue } from 'bullmq';
import { createBullMQConnection } from './connection.js';

export const QUEUE_NAMES = {
  HELD_BILLS_CLEANUP: 'held-bills-cleanup',
  LOW_STOCK_CHECK: 'low-stock-check',
  SUPPLIER_PAYMENT_REMINDERS: 'supplier-payment-reminders',
  AGING_INVENTORY_DIGEST: 'aging-inventory-digest',
  DAILY_SALES_SUMMARY: 'daily-sales-summary',
  RECURRING_EXPENSES: 'recurring-expenses',
  PO_PDF: 'po-pdf',
  REPORT_EXPORT: 'report-export',
  AUDIT_PARTITION: 'audit-partition',
  TENANT_DATA_EXPORT: 'tenant-data-export',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

const connection = createBullMQConnection();

function createQueue(name: QueueName): Queue | null {
  if (!connection) return null;
  return new Queue(name, { connection });
}

export const heldBillsCleanupQueue = createQueue(QUEUE_NAMES.HELD_BILLS_CLEANUP);
export const lowStockCheckQueue = createQueue(QUEUE_NAMES.LOW_STOCK_CHECK);
export const supplierPaymentRemindersQueue = createQueue(QUEUE_NAMES.SUPPLIER_PAYMENT_REMINDERS);
export const agingInventoryDigestQueue = createQueue(QUEUE_NAMES.AGING_INVENTORY_DIGEST);
export const dailySalesSummaryQueue = createQueue(QUEUE_NAMES.DAILY_SALES_SUMMARY);
export const recurringExpensesQueue = createQueue(QUEUE_NAMES.RECURRING_EXPENSES);
export const poPdfQueue = createQueue(QUEUE_NAMES.PO_PDF);
export const reportExportQueue = createQueue(QUEUE_NAMES.REPORT_EXPORT);
export const auditPartitionQueue = createQueue(QUEUE_NAMES.AUDIT_PARTITION);
export const tenantDataExportQueue = createQueue(QUEUE_NAMES.TENANT_DATA_EXPORT);

export const allQueues = [
  heldBillsCleanupQueue,
  lowStockCheckQueue,
  supplierPaymentRemindersQueue,
  agingInventoryDigestQueue,
  dailySalesSummaryQueue,
  recurringExpensesQueue,
  poPdfQueue,
  reportExportQueue,
  auditPartitionQueue,
  tenantDataExportQueue,
].filter((q): q is Queue => q !== null);
