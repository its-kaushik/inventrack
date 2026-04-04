import { Hono } from 'hono';
import { z } from 'zod';
import * as productService from '../services/product.service.js';
import * as barcodeService from '../services/barcode.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { tenantScope } from '../middleware/tenant-scope.js';
import { requireRole } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { success, paginated } from '../lib/response.js';
import type { AppEnv } from '../types/hono.js';

const productsRouter = new Hono<AppEnv>();

productsRouter.use('*', authMiddleware, tenantScope);

// POS search — must be before /:id to avoid route conflict
productsRouter.get('/search', async (c) => {
  const { tenantId, role } = c.get('tenant');
  const query = c.req.query('q') || '';
  const results = await productService.searchProducts(tenantId, query);
  return c.json(success(productService.serializeProducts(results, role)));
});

productsRouter.get('/', async (c) => {
  const { tenantId, role } = c.get('tenant');
  const filters = {
    categoryId: c.req.query('category_id'),
    brandId: c.req.query('brand_id'),
    search: c.req.query('search'),
    updatedAfter: c.req.query('updated_after'),
    isActive: c.req.query('is_active') === 'false' ? false : undefined,
    limit: Number(c.req.query('limit')) || 20,
    offset: Number(c.req.query('offset')) || 0,
  };

  const result = await productService.listProducts(tenantId, filters);
  return c.json(
    paginated(
      productService.serializeProducts(result.items, role),
      result.hasMore ? String(result.offset) : null,
      result.hasMore,
    ),
  );
});

productsRouter.get('/:id', async (c) => {
  const { tenantId, role } = c.get('tenant');
  const id = c.req.param('id')!;
  const product = await productService.getProductById(tenantId, id);
  return c.json(success(productService.serializeProduct(product, role)));
});

const createProductSchema = z.object({
  name: z.string().min(1),
  sku: z.string().min(1).max(50),
  barcode: z.string().max(50).optional(),
  categoryId: z.string().uuid(),
  subTypeId: z.string().uuid().optional(),
  brandId: z.string().uuid().optional(),
  size: z.string().max(20).optional(),
  color: z.string().max(50).optional(),
  hsnCode: z.string().max(8).optional(),
  gstRate: z.number().min(0).max(100).optional(),
  sellingPrice: z.number().positive(),
  costPrice: z.number().min(0).optional(),
  mrp: z.number().positive().optional(),
  catalogDiscountPct: z.number().min(0).max(100).optional(),
  minStockLevel: z.number().int().min(0).optional(),
  reorderPoint: z.number().int().min(0).optional(),
  description: z.string().optional(),
  imageUrls: z.array(z.string()).optional(),
});

productsRouter.post(
  '/',
  requireRole('owner', 'manager'),
  validate(createProductSchema),
  async (c) => {
    const { tenantId, role } = c.get('tenant');
    const input = c.get('validatedBody') as z.infer<typeof createProductSchema>;
    const product = await productService.createProduct(tenantId, input);
    return c.json(success(productService.serializeProduct(product, role)), 201);
  },
);

const updateProductSchema = z
  .object({
    name: z.string().min(1).optional(),
    sku: z.string().min(1).max(50).optional(),
    barcode: z.string().max(50).optional(),
    categoryId: z.string().uuid().optional(),
    subTypeId: z.string().uuid().nullable().optional(),
    brandId: z.string().uuid().nullable().optional(),
    size: z.string().max(20).nullable().optional(),
    color: z.string().max(50).nullable().optional(),
    hsnCode: z.string().max(8).optional(),
    gstRate: z.number().min(0).max(100).optional(),
    sellingPrice: z.number().positive().optional(),
    costPrice: z.number().min(0).optional(),
    mrp: z.number().positive().nullable().optional(),
    catalogDiscountPct: z.number().min(0).max(100).optional(),
    minStockLevel: z.number().int().min(0).optional(),
    reorderPoint: z.number().int().min(0).nullable().optional(),
    description: z.string().nullable().optional(),
    imageUrls: z.array(z.string()).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'At least one field required' });

productsRouter.put(
  '/:id',
  requireRole('owner', 'manager'),
  validate(updateProductSchema),
  async (c) => {
    const { tenantId, role } = c.get('tenant');
    const id = c.req.param('id')!;
    const patch = c.get('validatedBody') as Record<string, unknown>;
    const product = await productService.updateProduct(tenantId, id, patch);
    return c.json(success(productService.serializeProduct(product, role)));
  },
);

// Soft-delete only — NEVER hard delete
productsRouter.delete('/:id', requireRole('owner'), async (c) => {
  const { tenantId } = c.get('tenant');
  const id = c.req.param('id')!;
  const result = await productService.softDeleteProduct(tenantId, id);
  return c.json(success(result));
});

productsRouter.post('/:id/barcode', requireRole('owner', 'manager'), async (c) => {
  const { tenantId } = c.get('tenant');
  const id = c.req.param('id')!;
  const product = await productService.getProductById(tenantId, id);
  const png = await barcodeService.generateBarcode(product.barcode || product.sku);

  c.header('Content-Type', 'image/png');
  c.header('Content-Disposition', `inline; filename="${product.sku}.png"`);
  return c.body(png as any);
});

// Bulk import stub (real implementation needs BullMQ — Phase 2)
productsRouter.post('/import', requireRole('owner', 'manager'), async (c) => {
  return c.json(
    success({ message: 'Bulk import coming soon. Use POST /products for individual creation.' }),
  );
});

// Import job status (stub — will poll BullMQ when implemented)
productsRouter.get('/import/:jobId/status', requireRole('owner', 'manager'), async (c) => {
  const jobId = c.req.param('jobId')!;
  return c.json(
    success({ jobId, status: 'not_implemented', message: 'Import jobs not yet available.' }),
  );
});

export default productsRouter;
