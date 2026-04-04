import { Hono } from 'hono';
import { z } from 'zod';
import * as productService from '../services/product.service.js';
import * as barcodeService from '../services/barcode.service.js';
import * as labelTemplateService from '../services/label-template.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { tenantScope } from '../middleware/tenant-scope.js';
import { requireRole } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { success } from '../lib/response.js';
import { formatINR } from '../lib/indian-format.js';
import type { AppEnv } from '../types/hono.js';

const labelsRouter = new Hono<AppEnv>();

labelsRouter.use('*', authMiddleware, tenantScope);

const generateLabelsSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().int().positive(),
      }),
    )
    .min(1),
  templateId: z.string().optional().default('default'),
  format: z.enum(['html', 'json']).optional().default('html'),
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

  // Return printable HTML label sheet
  if (input.format === 'html') {
    const html = generateLabelSheetHtml(labels, input.templateId);
    c.header('Content-Type', 'text/html; charset=utf-8');
    return c.body(html);
  }

  // Return JSON data (for custom rendering on frontend)
  return c.json(success({ labels, templateId: input.templateId }));
});

labelsRouter.get('/templates', async (c) => {
  const { tenantId } = c.get('tenant');
  const templates = await labelTemplateService.listTemplates(tenantId);
  return c.json(success(templates));
});

const createTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(255).optional(),
  fields: z.array(z.string()).min(1),
  layout: z.record(z.string(), z.unknown()).optional(),
});

labelsRouter.post(
  '/templates',
  requireRole('owner', 'manager'),
  validate(createTemplateSchema),
  async (c) => {
    const { tenantId } = c.get('tenant');
    const input = c.get('validatedBody') as z.infer<typeof createTemplateSchema>;
    const template = await labelTemplateService.createTemplate(tenantId, input);
    return c.json(success(template), 201);
  },
);

const updateTemplateSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(255).optional(),
    fields: z.array(z.string()).min(1).optional(),
    layout: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'At least one field required' });

labelsRouter.put(
  '/templates/:id',
  requireRole('owner', 'manager'),
  validate(updateTemplateSchema),
  async (c) => {
    const { tenantId } = c.get('tenant');
    const id = c.req.param('id')!;
    const patch = c.get('validatedBody') as z.infer<typeof updateTemplateSchema>;
    const template = await labelTemplateService.updateTemplate(tenantId, id, patch);
    return c.json(success(template));
  },
);

function generateLabelSheetHtml(
  labels: Array<{
    productName: string;
    sku: string;
    barcode: string;
    size: string | null;
    sellingPrice: string;
    quantity: number;
    barcodeDataUrl: string;
  }>,
  templateId: string,
): string {
  // Expand labels by quantity
  const expandedLabels: typeof labels = [];
  for (const label of labels) {
    for (let i = 0; i < label.quantity; i++) {
      expandedLabels.push(label);
    }
  }

  const isThermal = templateId === 'thermal';
  const isMinimal = templateId === 'minimal';
  const columns = isThermal ? 1 : 3;

  const labelHtmlItems = expandedLabels.map((label) => {
    const price = formatINR(Number(label.sellingPrice));
    if (isMinimal) {
      return `
        <div class="label">
          <img src="${label.barcodeDataUrl}" class="barcode-img" alt="${label.barcode}">
          <div class="price">${price}</div>
        </div>`;
    }
    return `
      <div class="label">
        <div class="product-name">${escapeHtml(label.productName)}</div>
        ${label.size ? `<div class="size">Size: ${escapeHtml(label.size)}</div>` : ''}
        <img src="${label.barcodeDataUrl}" class="barcode-img" alt="${label.barcode}">
        <div class="sku">${escapeHtml(label.sku)}</div>
        <div class="price">${price}</div>
      </div>`;
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Labels</title>
  <style>
    @media print {
      body { margin: 0; }
      .no-print { display: none; }
    }
    body { font-family: Arial, sans-serif; margin: 0; padding: ${isThermal ? '0' : '10mm'}; }
    .grid {
      display: grid;
      grid-template-columns: repeat(${columns}, 1fr);
      gap: ${isThermal ? '2mm' : '4mm'};
    }
    .label {
      border: 1px dashed #ccc;
      padding: ${isThermal ? '2mm' : '3mm'};
      text-align: center;
      page-break-inside: avoid;
      overflow: hidden;
    }
    .product-name { font-size: ${isThermal ? '8pt' : '9pt'}; font-weight: bold; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .size { font-size: 8pt; color: #555; }
    .barcode-img { max-width: 100%; height: ${isThermal ? '15mm' : '20mm'}; margin: 2px 0; }
    .sku { font-size: 7pt; color: #777; }
    .price { font-size: ${isThermal ? '10pt' : '11pt'}; font-weight: bold; margin-top: 2px; }
    .no-print { text-align: center; padding: 10px; }
    .no-print button { padding: 8px 24px; font-size: 14px; cursor: pointer; }
  </style>
</head>
<body>
  <div class="no-print"><button onclick="window.print()">Print Labels</button></div>
  <div class="grid">
    ${labelHtmlItems.join('\n')}
  </div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default labelsRouter;
