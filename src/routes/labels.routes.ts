import { Hono } from 'hono';
import { z } from 'zod';
import * as productService from '../services/product.service.js';
import * as barcodeService from '../services/barcode.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { tenantScope } from '../middleware/tenant-scope.js';
import { validate } from '../middleware/validate.js';
import { success } from '../lib/response.js';
import type { AppEnv } from '../types/hono.js';

const labelsRouter = new Hono<AppEnv>();

labelsRouter.use('*', authMiddleware, tenantScope);

const generateLabelsSchema = z.object({
  items: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.number().int().positive(),
  })).min(1),
  templateId: z.string().optional().default('default'),
});

labelsRouter.post('/generate', validate(generateLabelsSchema), async (c) => {
  const { tenantId } = c.get('tenant');
  const input = c.get('validatedBody') as z.infer<typeof generateLabelsSchema>;

  const labels: Array<{
    productName: string;
    sku: string;
    barcode: string;
    size: string | null;
    sellingPrice: string;
    quantity: number;
    barcodeDataUrl: string;
  }> = [];

  for (const item of input.items) {
    const product = await productService.getProductById(tenantId, item.productId);
    const barcodeValue = product.barcode || product.sku;
    const png = await barcodeService.generateBarcode(barcodeValue);
    const dataUrl = `data:image/png;base64,${png.toString('base64')}`;

    labels.push({
      productName: product.name,
      sku: product.sku,
      barcode: barcodeValue,
      size: product.size,
      sellingPrice: product.sellingPrice,
      quantity: item.quantity,
      barcodeDataUrl: dataUrl,
    });
  }

  return c.json(success({ labels, templateId: input.templateId }));
});

labelsRouter.get('/templates', async (c) => {
  return c.json(success([
    { id: 'default', name: 'Standard Label', description: 'Barcode + Name + Size + Price', fields: ['barcode', 'name', 'size', 'price'] },
    { id: 'minimal', name: 'Minimal Label', description: 'Barcode + Price only', fields: ['barcode', 'price'] },
  ]));
});

export default labelsRouter;
