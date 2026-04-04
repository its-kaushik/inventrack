import { eq, and, inArray } from 'drizzle-orm';
import { db } from '../config/database.js';
import { bills } from '../db/schema/bills.js';
import { products } from '../db/schema/products.js';
import { syncConflicts } from '../db/schema/sync-conflicts.js';
import * as billingService from './billing.service.js';
import { logger } from '../lib/logger.js';
import type { UserRole } from '../types/enums.js';

interface OfflineBillInput {
  clientId: string;
  offlineCreatedAt: string;
  items: Array<{ productId: string; quantity: number }>;
  payments: Array<{ mode: 'cash' | 'upi' | 'card' | 'credit'; amount: number; reference?: string }>;
  customerId?: string | null;
  additionalDiscountAmount?: number;
  additionalDiscountPct?: number;
  notes?: string;
}

interface SyncedBill {
  clientId: string;
  serverBillId: string;
  billNumber: string;
}

interface ConflictedBill {
  clientId: string;
  conflictId: string;
  reason: string;
}

export async function syncOfflineBills(
  tenantId: string,
  userId: string,
  role: UserRole,
  offlineBills: OfflineBillInput[],
) {
  const synced: SyncedBill[] = [];
  const conflicts: ConflictedBill[] = [];

  // Sort by offline_created_at ascending so bills are processed in order
  const sorted = [...offlineBills].sort(
    (a, b) => new Date(a.offlineCreatedAt).getTime() - new Date(b.offlineCreatedAt).getTime(),
  );

  for (const bill of sorted) {
    try {
      // Check idempotency: if a bill with this clientId already exists, skip
      const [existing] = await db
        .select({ id: bills.id, billNumber: bills.billNumber })
        .from(bills)
        .where(and(eq(bills.tenantId, tenantId), eq(bills.clientId, bill.clientId)))
        .limit(1);

      if (existing) {
        synced.push({
          clientId: bill.clientId,
          serverBillId: existing.id,
          billNumber: existing.billNumber,
        });
        continue;
      }

      // Validate all product IDs exist (archived products are OK)
      const productIds = bill.items.map((i) => i.productId);
      const foundProducts = await db
        .select({ id: products.id })
        .from(products)
        .where(and(eq(products.tenantId, tenantId), inArray(products.id, productIds)));

      const foundIds = new Set(foundProducts.map((p) => p.id));
      const missingIds = productIds.filter((id) => !foundIds.has(id));
      if (missingIds.length > 0) {
        throw new Error(`Product(s) not found: ${missingIds.join(', ')}`);
      }

      // Create the bill via the existing billing service
      const created = await billingService.createBill(tenantId, userId, role, {
        items: bill.items,
        payments: bill.payments,
        customerId: bill.customerId,
        additionalDiscountAmount: bill.additionalDiscountAmount,
        additionalDiscountPct: bill.additionalDiscountPct,
        clientId: bill.clientId,
        notes: bill.notes,
        isOffline: true,
        offlineCreatedAt: bill.offlineCreatedAt,
      });

      synced.push({
        clientId: bill.clientId,
        serverBillId: created.id,
        billNumber: created.billNumber,
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'Unknown error during sync';
      logger.warn({ tenantId, clientId: bill.clientId, err }, 'Sync conflict for offline bill');

      try {
        const [conflict] = await db
          .insert(syncConflicts)
          .values({
            tenantId,
            submittedBy: userId,
            offlineBillData: bill,
            conflictReason: reason,
            status: 'pending',
          })
          .returning();

        conflicts.push({
          clientId: bill.clientId,
          conflictId: conflict.id,
          reason,
        });
      } catch (insertErr) {
        logger.error(
          { tenantId, clientId: bill.clientId, insertErr },
          'Failed to create sync conflict record',
        );
        conflicts.push({
          clientId: bill.clientId,
          conflictId: '',
          reason,
        });
      }
    }
  }

  return { synced, conflicts };
}
