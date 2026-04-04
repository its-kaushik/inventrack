import { Queue } from 'bullmq';
import { createBullMQConnection } from './connection.js';

export const QUEUE_NAMES = {
  HELD_BILLS_CLEANUP: 'held-bills-cleanup',
  LOW_STOCK_CHECK: 'low-stock-check',
  SUPPLIER_PAYMENT_REMINDERS: 'supplier-payment-reminders',
  AGING_INVENTORY_DIGEST: 'aging-inventory-digest',
  DAILY_SALES_SUMMARY: 'daily-sales-summary',
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

export const allQueues = [
  heldBillsCleanupQueue,
  lowStockCheckQueue,
  supplierPaymentRemindersQueue,
  agingInventoryDigestQueue,
  dailySalesSummaryQueue,
].filter((q): q is Queue => q !== null);
