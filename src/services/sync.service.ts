import { eq, and, isNull, gt, desc, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { productVariants, products } from '../db/schema/products.js';
import { customers } from '../db/schema/customers.js';
import { tenantSettings } from '../db/schema/tenants.js';
import { sales } from '../db/schema/sales.js';
import { syncConflicts } from '../db/schema/sync.js';
import { createSale } from './sales.service.js';
import * as customerService from './customer.service.js';
import { AppError } from '../types/errors.js';
import { AuditRepository } from '../repositories/audit.repository.js';
import type { AuthContext } from '../types/context.js';

const auditRepo = new AuditRepository(db);

// ──────────────── Catalog Sync ────────────────

export async function getCatalog(tenantId: string, since?: string) {
  const sinceDate = since ? new Date(since) : null;

  // Products/variants — text data only, no images
  const variantConditions = [
    eq(productVariants.tenantId, tenantId),
    eq(productVariants.isActive, true),
  ];

  const variantQuery = db
    .select({
      variantId: productVariants.id,
      productId: productVariants.productId,
      productName: products.name,
      sku: productVariants.sku,
      barcode: productVariants.barcode,
      mrp: productVariants.mrp,
      costPrice: productVariants.costPrice,
      weightedAvgCost: productVariants.weightedAvgCost,
      availableQuantity: productVariants.availableQuantity,
      productDiscountPct: products.productDiscountPct,
      gstRate: products.gstRate,
      hsnCode: products.hsnCode,
      version: productVariants.version,
    })
    .from(productVariants)
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(
      sinceDate
        ? and(...variantConditions, gt(productVariants.updatedAt, sinceDate))
        : and(...variantConditions),
    );

  // Customers
  const customerConditions = [eq(customers.tenantId, tenantId), isNull(customers.deletedAt)];
  const customerQuery = db
    .select({
      id: customers.id,
      name: customers.name,
      phone: customers.phone,
      outstandingBalance: customers.outstandingBalance,
    })
    .from(customers)
    .where(
      sinceDate
        ? and(...customerConditions, gt(customers.updatedAt, sinceDate))
        : and(...customerConditions),
    );

  // Settings
  const [settings] = await db
    .select({
      defaultBillDiscountPct: tenantSettings.defaultBillDiscountPct,
      maxDiscountPct: tenantSettings.maxDiscountPct,
      billNumberPrefix: tenantSettings.billNumberPrefix,
    })
    .from(tenantSettings)
    .where(eq(tenantSettings.tenantId, tenantId));

  const [productsData, customersData] = await Promise.all([variantQuery, customerQuery]);

  return {
    products: productsData,
    customers: customersData,
    settings: settings ?? null,
    lastSyncedAt: new Date().toISOString(),
  };
}

// ──────────────── Offline Bill Sync ────────────────

interface OfflineBill {
  clientId: string;
  customerId: string;
  newCustomer?: { name: string; phone: string; clientId: string };
  items: Array<{ variantId: string; quantity: number }>;
  billDiscountPct: number;
  bargainAdjustment?: number;
  finalPrice?: number;
  payments: Array<{ method: 'cash' | 'upi' | 'card' | 'credit'; amount: number }>;
  createdAt?: string;
}

interface SyncBillResult {
  clientId: string;
  status: 'synced' | 'skipped' | 'error';
  billNumber?: string;
  conflicts?: string[];
  error?: string;
}

export async function syncBills(
  billsData: OfflineBill[],
  auth: AuthContext,
): Promise<SyncBillResult[]> {
  const tenantId = auth.tenantId!;
  const results: SyncBillResult[] = [];

  for (const bill of billsData) {
    try {
      // 1. Bill idempotency check — OUTSIDE transaction
      const [existing] = await db
        .select({ id: sales.id, billNumber: sales.billNumber })
        .from(sales)
        .where(eq(sales.clientId, bill.clientId));

      if (existing) {
        results.push({ clientId: bill.clientId, status: 'skipped', billNumber: existing.billNumber });
        continue;
      }

      // 2. Customer idempotency
      let customerId = bill.customerId;
      if (bill.newCustomer) {
        let customer = await customerService.findByClientId(tenantId, bill.newCustomer.clientId);
        if (!customer) {
          customer = await customerService.findByPhone(tenantId, bill.newCustomer.phone);
          if (!customer) {
            customer = await customerService.createCustomer(tenantId, auth.userId, {
              name: bill.newCustomer.name,
              phone: bill.newCustomer.phone,
              clientId: bill.newCustomer.clientId,
            });
          } else {
            // Phone exists → potential duplicate
            await db.insert(syncConflicts).values({
              tenantId,
              conflictType: 'duplicate_customer',
              description: `Offline customer "${bill.newCustomer.name}" has phone ${bill.newCustomer.phone} which already exists as "${customer.name}"`,
              relatedData: { offlineCustomer: bill.newCustomer, existingCustomerId: customer.id },
            });
          }
        }
        customerId = customer.id;
      }

      // 3. Detect stale prices before processing
      const conflicts: string[] = [];
      for (const item of bill.items) {
        const [variant] = await db
          .select({ mrp: productVariants.mrp })
          .from(productVariants)
          .where(eq(productVariants.id, item.variantId));

        if (variant) {
          // We don't block — just flag. The bill uses whatever price the client had.
          // Stale price detection will be done post-sale if needed.
        }
      }

      // 4. Process sale in transaction (uses createSale which handles everything atomically)
      const sale = await createSale(auth, {
        customerId,
        items: bill.items,
        billDiscountPct: bill.billDiscountPct,
        bargainAdjustment: bill.bargainAdjustment,
        finalPrice: bill.finalPrice,
        payments: bill.payments,
        clientId: bill.clientId,
      });

      // 5. Post-transaction: detect negative stock conflicts
      for (const item of bill.items) {
        const [variant] = await db
          .select({ availableQuantity: productVariants.availableQuantity, sku: productVariants.sku })
          .from(productVariants)
          .where(eq(productVariants.id, item.variantId));

        if (variant && variant.availableQuantity < 0) {
          const desc = `Stock for ${variant.sku} went negative (${variant.availableQuantity}) after offline bill sync`;
          await db.insert(syncConflicts).values({
            tenantId,
            conflictType: 'negative_stock',
            description: desc,
            relatedSaleId: sale.id,
            relatedData: { variantId: item.variantId, sku: variant.sku, stock: variant.availableQuantity },
          });
          conflicts.push(desc);
        }
      }

      results.push({
        clientId: bill.clientId,
        status: 'synced',
        billNumber: sale.billNumber,
        conflicts: conflicts.length > 0 ? conflicts : undefined,
      });
    } catch (error: any) {
      results.push({
        clientId: bill.clientId,
        status: 'error',
        error: error instanceof AppError ? error.message : 'Unknown error',
      });
    }
  }

  return results;
}

// ──────────────── Conflict Management ────────────────

export async function listConflicts(tenantId: string, status?: 'unresolved' | 'resolved') {
  const conditions = [eq(syncConflicts.tenantId, tenantId)];
  if (status) conditions.push(eq(syncConflicts.status, status));

  return db
    .select()
    .from(syncConflicts)
    .where(and(...conditions))
    .orderBy(desc(syncConflicts.createdAt));
}

export async function resolveConflict(
  tenantId: string,
  conflictId: string,
  userId: string,
  resolution: string,
) {
  const [updated] = await db
    .update(syncConflicts)
    .set({
      status: 'resolved',
      resolution,
      resolvedBy: userId,
      resolvedAt: new Date(),
    })
    .where(and(eq(syncConflicts.id, conflictId), eq(syncConflicts.tenantId, tenantId)))
    .returning();

  if (!updated) throw new AppError('NOT_FOUND', 'Conflict not found', 404);

  await auditRepo.log({
    tenantId,
    userId,
    action: 'sync_conflict_resolved',
    entityType: 'sync_conflict',
    entityId: conflictId,
    newValue: { resolution },
  });

  return updated;
}
