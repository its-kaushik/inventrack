import { eq, and } from 'drizzle-orm';
import { db } from '../db/client.js';
import { productVariants } from '../db/schema/products.js';

export interface CheckLowStockData {
  tenantId: string;
  variantId: string;
}

/**
 * Check if a variant has fallen below its low stock threshold.
 * If so, creates a notification (notification table built in M19).
 *
 * For now (pre-M19), this is a no-op stub that logs the check.
 */
export async function handleCheckLowStock(data: CheckLowStockData): Promise<void> {
  const [variant] = await db
    .select({
      id: productVariants.id,
      sku: productVariants.sku,
      availableQuantity: productVariants.availableQuantity,
      lowStockThreshold: productVariants.lowStockThreshold,
    })
    .from(productVariants)
    .where(
      and(eq(productVariants.id, data.variantId), eq(productVariants.tenantId, data.tenantId)),
    );

  if (!variant || variant.lowStockThreshold === null) return;

  if (variant.availableQuantity <= variant.lowStockThreshold) {
    // TODO (M19): Create notification record when notifications table exists
    console.info(
      `[check-low-stock] ⚠ ${variant.sku}: stock ${variant.availableQuantity} <= threshold ${variant.lowStockThreshold}`,
    );
  }
}
