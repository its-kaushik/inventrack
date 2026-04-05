import { Hono } from 'hono';
import { validate, uuidParam } from '../validators/common.validators.js';
import {
  createCategorySchema,
  updateCategorySchema,
  createBrandSchema,
  updateBrandSchema,
  createProductSchema,
  updateProductSchema,
  productListQuerySchema,
} from '../validators/product.validators.js';
import * as productService from '../services/product.service.js';
import { authorize } from '../middleware/rbac.js';
import { AppError } from '../types/errors.js';
import { enqueueJob } from '../jobs/worker.js';
import { getUploadUrl } from '../lib/s3-client.js';
import { db } from '../db/client.js';
import { productImages } from '../db/schema/products.js';
import { eq, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import type { AppEnv } from '../types/hono.js';

export const productRoutes = new Hono<AppEnv>();

// ──────── Categories ────────

productRoutes.get('/categories', async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const cats = await productService.listCategories(auth.tenantId);
  return c.json({ data: cats });
});

productRoutes.post('/categories', authorize('owner', 'manager'), async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const body = validate(createCategorySchema, await c.req.json());
  const cat = await productService.createCategory(auth.tenantId, body);
  return c.json({ data: cat }, 201);
});

productRoutes.patch('/categories/:id', authorize('owner', 'manager'), async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const { id } = validate(uuidParam, c.req.param());
  const body = validate(updateCategorySchema, await c.req.json());
  const cat = await productService.updateCategory(auth.tenantId, id, body);
  return c.json({ data: cat });
});

productRoutes.delete('/categories/:id', authorize('owner', 'manager'), async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const { id } = validate(uuidParam, c.req.param());
  await productService.deleteCategory(auth.tenantId, id);
  return c.json({ data: { message: 'Category deleted' } });
});

// ──────── Brands ────────

productRoutes.get('/brands', async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const brandsList = await productService.listBrands(auth.tenantId);
  return c.json({ data: brandsList });
});

productRoutes.post('/brands', authorize('owner', 'manager'), async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const body = validate(createBrandSchema, await c.req.json());
  const brand = await productService.createBrand(auth.tenantId, body.name);
  return c.json({ data: brand }, 201);
});

productRoutes.patch('/brands/:id', authorize('owner', 'manager'), async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const { id } = validate(uuidParam, c.req.param());
  const body = validate(updateBrandSchema, await c.req.json());
  const brand = await productService.updateBrand(auth.tenantId, id, body.name);
  return c.json({ data: brand });
});

productRoutes.delete('/brands/:id', authorize('owner', 'manager'), async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const { id } = validate(uuidParam, c.req.param());
  await productService.deleteBrand(auth.tenantId, id);
  return c.json({ data: { message: 'Brand deleted' } });
});

// ──────── Products ────────

productRoutes.get('/', async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const query = validate(productListQuerySchema, c.req.query());
  const result = await productService.listProducts(auth.tenantId, query);
  return c.json({
    data: result.data,
    meta: { total: result.total, page: result.page, limit: result.limit, totalPages: Math.ceil(result.total / result.limit) },
  });
});

productRoutes.get('/:id', async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const { id } = validate(uuidParam, c.req.param());
  const product = await productService.getProductById(auth.tenantId, id);
  return c.json({ data: product });
});

productRoutes.post('/', authorize('owner', 'manager'), async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const body = validate(createProductSchema, await c.req.json());
  const product = await productService.createProduct(auth.tenantId, auth.userId, body);
  return c.json({ data: product }, 201);
});

productRoutes.patch('/:id', authorize('owner', 'manager'), async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const { id } = validate(uuidParam, c.req.param());
  const body = validate(updateProductSchema, await c.req.json());
  const product = await productService.updateProduct(auth.tenantId, id, body);
  return c.json({ data: product });
});

productRoutes.delete('/:id', authorize('owner', 'manager'), async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const { id } = validate(uuidParam, c.req.param());
  await productService.archiveProduct(auth.tenantId, id);
  return c.json({ data: { message: 'Product archived' } });
});

productRoutes.post('/:id/unarchive', authorize('owner', 'manager'), async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const { id } = validate(uuidParam, c.req.param());
  await productService.unarchiveProduct(auth.tenantId, id);
  return c.json({ data: { message: 'Product unarchived' } });
});

// ──────── Product Images ────────

productRoutes.post('/:id/images/upload-url', authorize('owner', 'manager'), async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const { id: productId } = validate(uuidParam, c.req.param());
  const { contentType } = await c.req.json() as { contentType: string };

  const ext = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
  const key = `${auth.tenantId}/products/${productId}/${nanoid()}.${ext}`;
  const result = await getUploadUrl(key, contentType);
  return c.json({ data: result });
});

productRoutes.post('/:id/images', authorize('owner', 'manager'), async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const { id: productId } = validate(uuidParam, c.req.param());
  const { key, publicUrl, variantId, sortOrder } = await c.req.json() as {
    key: string; publicUrl: string; variantId?: string; sortOrder?: number;
  };

  const [image] = await db
    .insert(productImages)
    .values({
      tenantId: auth.tenantId,
      productId,
      variantId: variantId ?? null,
      imageUrl: publicUrl,
      sortOrder: sortOrder ?? 0,
    })
    .returning();

  // Enqueue background resize job
  await enqueueJob('resize-product-image', { s3Key: key, productImageId: image.id });

  return c.json({ data: image }, 201);
});

productRoutes.delete('/:id/images/:imageId', authorize('owner', 'manager'), async (c) => {
  const auth = c.get('auth');
  if (!auth.tenantId) throw new AppError('FORBIDDEN', 'No tenant context', 403);
  const productId = c.req.param('id');
  const imageId = c.req.param('imageId');

  const [deleted] = await db
    .delete(productImages)
    .where(
      and(
        eq(productImages.id, imageId),
        eq(productImages.productId, productId),
        eq(productImages.tenantId, auth.tenantId),
      ),
    )
    .returning({ id: productImages.id });

  if (!deleted) throw new AppError('NOT_FOUND', 'Image not found', 404);
  return c.json({ data: { message: 'Image deleted' } });
});

// ──────── HSN Codes ────────

productRoutes.get('/hsn-codes', async (c) => {
  const search = c.req.query('search') ?? '';
  const codes = await productService.searchHsnCodes(search);
  return c.json({ data: codes });
});
