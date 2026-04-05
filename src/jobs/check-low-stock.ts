import { eq, and } from 'drizzle-orm';
import { db } from '../db/client.js';
import { productVariants } from '../db/schema/products.js';
import { notify } from '../services/notification.service.js';

export interface CheckLowStockData {
  tenantId: string;
  variantId: string;
}

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
    await notify(data.tenantId, {
      type: 'low_stock',
      title: 'Low Stock Alert',
      message: `${variant.sku} has only ${variant.availableQuantity} units left (threshold: ${variant.lowStockThreshold})`,
      priority: 'high',
      data: { variantId: variant.id, sku: variant.sku, stock: variant.availableQuantity, threshold: variant.lowStockThreshold },
      targetRoles: ['owner', 'manager', 'salesman'],
    });
  }
}
