import { eq, and, sql } from 'drizzle-orm';
import { productVariants } from '../db/schema/products.js';
import { CONSTANTS } from '../config/constants.js';
import { AppError } from '../types/errors.js';
import type { Transaction } from '../db/client.js';

export interface StockUpdateResult {
  id: string;
  availableQuantity: number;
  version: number;
}

/**
 * Attempts a stock update with optimistic locking.
 * Returns the updated row or null if version mismatch.
 */
async function tryUpdateStock(
  tx: Transaction,
  tenantId: string,
  variantId: string,
  quantityChange: number,
  expectedVersion: number,
): Promise<StockUpdateResult | null> {
  const result = await tx
    .update(productVariants)
    .set({
      availableQuantity: sql`${productVariants.availableQuantity} + ${quantityChange}`,
      version: sql`${productVariants.version} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(productVariants.id, variantId),
        eq(productVariants.tenantId, tenantId),
        eq(productVariants.version, expectedVersion),
      ),
    )
    .returning({
      id: productVariants.id,
      availableQuantity: productVariants.availableQuantity,
      version: productVariants.version,
    });

  return result[0] ?? null;
}

async function fetchVariantVersion(
  tx: Transaction,
  tenantId: string,
  variantId: string,
): Promise<{ version: number; availableQuantity: number } | null> {
  const [row] = await tx
    .select({ version: productVariants.version, availableQuantity: productVariants.availableQuantity })
    .from(productVariants)
    .where(and(eq(productVariants.id, variantId), eq(productVariants.tenantId, tenantId)));
  return row ?? null;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Update stock with optimistic locking and retry.
 * Used inside a database transaction.
 *
 * Allows negative stock (for offline sync scenarios) — caller must detect and flag.
 */
export async function updateStockWithRetry(
  tx: Transaction,
  tenantId: string,
  variantId: string,
  quantityChange: number,
  expectedVersion: number,
): Promise<StockUpdateResult> {
  const maxRetries = CONSTANTS.STOCK.OPTIMISTIC_LOCK_MAX_RETRIES;
  const baseDelay = CONSTANTS.STOCK.OPTIMISTIC_LOCK_BASE_DELAY_MS;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await tryUpdateStock(tx, tenantId, variantId, quantityChange, expectedVersion);
    if (result) return result;

    if (attempt < maxRetries) {
      // Re-fetch current version for retry
      const current = await fetchVariantVersion(tx, tenantId, variantId);
      if (!current) throw new AppError('NOT_FOUND', 'Product variant not found', 404);
      expectedVersion = current.version;

      // Exponential backoff
      await sleep(baseDelay * Math.pow(2, attempt));
    }
  }

  throw new AppError('STOCK_CONFLICT', 'Stock update conflict after retries. Please retry.', 409);
}

/** Convenience: increment stock (goods receipt, return) */
export async function incrementStock(
  tx: Transaction,
  tenantId: string,
  variantId: string,
  quantity: number,
  expectedVersion: number,
): Promise<StockUpdateResult> {
  return updateStockWithRetry(tx, tenantId, variantId, quantity, expectedVersion);
}

/** Convenience: decrement stock (sale, adjustment) */
export async function decrementStock(
  tx: Transaction,
  tenantId: string,
  variantId: string,
  quantity: number,
  expectedVersion: number,
): Promise<StockUpdateResult> {
  return updateStockWithRetry(tx, tenantId, variantId, -quantity, expectedVersion);
}
