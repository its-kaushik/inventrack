import { randomUUID } from 'crypto';
import archiver from 'archiver';
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3 } from '../config/s3.js';
import { env } from '../config/env.js';
import { db } from '../config/database.js';
import { sql } from 'drizzle-orm';
import { ValidationError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import * as notificationService from './notification.service.js';
import {
  products,
  bills,
  billItems,
  customers,
  suppliers,
  ledgerEntries,
  expenses,
  stockEntries,
} from '../db/schema/index.js';

const BATCH_SIZE = 1000;

function toCsvRow(values: (string | number | boolean | null)[]): string {
  return (
    values
      .map((v) => {
        if (v === null || v === undefined) return '';
        const s = String(v);
        if (s.includes(',') || s.includes('"') || s.includes('\n')) {
          return '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
      })
      .join(',') + '\n'
  );
}

interface EntityConfig {
  name: string;
  table: unknown;
  columns: { header: string; column: string }[];
}

const ENTITY_CONFIGS: EntityConfig[] = [
  {
    name: 'products',
    table: products,
    columns: [
      { header: 'id', column: 'id' },
      { header: 'name', column: 'name' },
      { header: 'sku', column: 'sku' },
      { header: 'barcode', column: 'barcode' },
      { header: 'category_id', column: 'category_id' },
      { header: 'size', column: 'size' },
      { header: 'color', column: 'color' },
      { header: 'selling_price', column: 'selling_price' },
      { header: 'cost_price', column: 'cost_price' },
      { header: 'current_stock', column: 'current_stock' },
      { header: 'is_active', column: 'is_active' },
    ],
  },
  {
    name: 'bills',
    table: bills,
    columns: [
      { header: 'id', column: 'id' },
      { header: 'bill_number', column: 'bill_number' },
      { header: 'customer_id', column: 'customer_id' },
      { header: 'salesperson_id', column: 'salesperson_id' },
      { header: 'net_amount', column: 'net_amount' },
      { header: 'status', column: 'status' },
      { header: 'created_at', column: 'created_at' },
    ],
  },
  {
    name: 'bill_items',
    table: billItems,
    columns: [
      { header: 'id', column: 'id' },
      { header: 'bill_id', column: 'bill_id' },
      { header: 'product_name', column: 'product_name' },
      { header: 'sku', column: 'sku' },
      { header: 'quantity', column: 'quantity' },
      { header: 'unit_price', column: 'unit_price' },
      { header: 'line_total', column: 'line_total' },
    ],
  },
  {
    name: 'customers',
    table: customers,
    columns: [
      { header: 'id', column: 'id' },
      { header: 'name', column: 'name' },
      { header: 'phone', column: 'phone' },
      { header: 'email', column: 'email' },
      { header: 'outstanding_balance', column: 'outstanding_balance' },
    ],
  },
  {
    name: 'suppliers',
    table: suppliers,
    columns: [
      { header: 'id', column: 'id' },
      { header: 'name', column: 'name' },
      { header: 'phone', column: 'phone' },
      { header: 'email', column: 'email' },
      { header: 'outstanding_balance', column: 'outstanding_balance' },
    ],
  },
  {
    name: 'ledger_entries',
    table: ledgerEntries,
    columns: [
      { header: 'id', column: 'id' },
      { header: 'party_type', column: 'party_type' },
      { header: 'party_id', column: 'party_id' },
      { header: 'entry_type', column: 'entry_type' },
      { header: 'debit', column: 'debit' },
      { header: 'credit', column: 'credit' },
      { header: 'created_at', column: 'created_at' },
    ],
  },
  {
    name: 'expenses',
    table: expenses,
    columns: [
      { header: 'id', column: 'id' },
      { header: 'category', column: 'category' },
      { header: 'amount', column: 'amount' },
      { header: 'description', column: 'description' },
      { header: 'expense_date', column: 'expense_date' },
    ],
  },
  {
    name: 'stock_entries',
    table: stockEntries,
    columns: [
      { header: 'id', column: 'id' },
      { header: 'product_id', column: 'product_id' },
      { header: 'quantity', column: 'quantity' },
      { header: 'type', column: 'type' },
      { header: 'reason', column: 'reason' },
      { header: 'created_at', column: 'created_at' },
    ],
  },
];

async function queryEntityBatch(
  tableName: string,
  tenantId: string,
  columnNames: string[],
  offset: number,
): Promise<Record<string, unknown>[]> {
  const cols = columnNames.join(', ');
  const rows = await db.execute(
    sql.raw(
      `SELECT ${cols} FROM ${tableName} WHERE tenant_id = '${tenantId}' ORDER BY id LIMIT ${BATCH_SIZE} OFFSET ${offset}`,
    ),
  );
  return rows as unknown as Record<string, unknown>[];
}

async function buildCsvForEntity(entityConfig: EntityConfig, tenantId: string): Promise<string> {
  const headers = entityConfig.columns.map((c) => c.header);
  const dbColumns = entityConfig.columns.map((c) => c.column);

  let csv = toCsvRow(headers);
  let offset = 0;

  // bill_items doesn't have tenant_id, so we need to join through bills
  const isBillItems = entityConfig.name === 'bill_items';

  while (true) {
    let rows: Record<string, unknown>[];

    if (isBillItems) {
      const cols = dbColumns.map((c) => `bi.${c}`).join(', ');
      const result = await db.execute(
        sql.raw(
          `SELECT ${cols} FROM bill_items bi INNER JOIN bills b ON bi.bill_id = b.id WHERE b.tenant_id = '${tenantId}' ORDER BY bi.id LIMIT ${BATCH_SIZE} OFFSET ${offset}`,
        ),
      );
      rows = result as unknown as Record<string, unknown>[];
    } else {
      rows = await queryEntityBatch(entityConfig.name, tenantId, dbColumns, offset);
    }

    if (rows.length === 0) break;

    for (const row of rows) {
      const values = dbColumns.map((col) => {
        const val = row[col];
        if (val === null || val === undefined) return null;
        if (val instanceof Date) return val.toISOString();
        if (typeof val === 'boolean') return val;
        if (typeof val === 'number') return val;
        return String(val);
      });
      csv += toCsvRow(values);
    }

    offset += BATCH_SIZE;
    if (rows.length < BATCH_SIZE) break;
  }

  return csv;
}

export async function exportTenantData(
  tenantId: string,
  userId: string,
): Promise<{ exportId: string; downloadUrl: string }> {
  if (!s3) {
    throw new ValidationError('File storage not configured for data export');
  }

  const exportId = randomUUID();
  logger.info({ tenantId, exportId }, 'Starting tenant data export');

  const archive = archiver('zip', { zlib: { level: 9 } });
  const chunks: Buffer[] = [];
  archive.on('data', (chunk: Buffer) => chunks.push(chunk));

  const archiveFinished = new Promise<void>((resolve, reject) => {
    archive.on('end', resolve);
    archive.on('error', reject);
  });

  for (const entityConfig of ENTITY_CONFIGS) {
    logger.info({ tenantId, entity: entityConfig.name }, 'Exporting entity');
    const csv = await buildCsvForEntity(entityConfig, tenantId);
    archive.append(csv, { name: `${entityConfig.name}.csv` });
  }

  archive.finalize();
  await archiveFinished;

  const zipBuffer = Buffer.concat(chunks);
  const s3Key = `${tenantId}/exports/${exportId}.zip`;

  await s3.send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: s3Key,
      Body: zipBuffer,
      ContentType: 'application/zip',
    }),
  );

  const downloadUrl = await getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: s3Key,
    }),
    { expiresIn: 86400 }, // 24 hours
  );

  await notificationService.createNotification({
    tenantId,
    userId,
    type: 'data_export',
    title: 'Data export ready',
    body: 'Your data export is ready for download. The link expires in 24 hours.',
    data: { exportId, downloadUrl },
  });

  logger.info({ tenantId, exportId }, 'Tenant data export completed');

  return { exportId, downloadUrl };
}
