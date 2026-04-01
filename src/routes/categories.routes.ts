import { Hono } from 'hono';
import { z } from 'zod';
import * as categoryService from '../services/category.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { tenantScope } from '../middleware/tenant-scope.js';
import { requireRole } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { success } from '../lib/response.js';
import type { AppEnv } from '../types/hono.js';

const categoriesRouter = new Hono<AppEnv>();

// All routes require auth
categoriesRouter.use('*', authMiddleware, tenantScope);

// ======================== CATEGORIES ========================

categoriesRouter.get('/categories', async (c) => {
  const { tenantId } = c.get('tenant');
  const data = await categoryService.listCategories(tenantId);
  return c.json(success(data));
});

categoriesRouter.post('/categories', requireRole('owner', 'manager'), validate(z.object({
  name: z.string().min(1),
  code: z.string().min(1).max(10),
  sortOrder: z.number().int().optional(),
})), async (c) => {
  const { tenantId } = c.get('tenant');
  const input = c.get('validatedBody') as any;
  const cat = await categoryService.createCategory(tenantId, input);
  return c.json(success(cat), 201);
});

categoriesRouter.patch('/categories/:id', requireRole('owner', 'manager'), validate(z.object({
  name: z.string().min(1).optional(),
  code: z.string().min(1).max(10).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
}).refine(d => Object.keys(d).length > 0, { message: 'At least one field required' })), async (c) => {
  const { tenantId } = c.get('tenant');
  const id = c.req.param('id')!;
  const patch = c.get('validatedBody') as any;
  const cat = await categoryService.updateCategory(tenantId, id, patch);
  return c.json(success(cat));
});

categoriesRouter.delete('/categories/:id', requireRole('owner'), async (c) => {
  const { tenantId } = c.get('tenant');
  const id = c.req.param('id')!;
  const cat = await categoryService.deactivateCategory(tenantId, id);
  return c.json(success(cat));
});

// ======================== SUB-TYPES ========================

categoriesRouter.get('/categories/:id/sub-types', async (c) => {
  const { tenantId } = c.get('tenant');
  const categoryId = c.req.param('id')!;
  const data = await categoryService.listSubTypes(tenantId, categoryId);
  return c.json(success(data));
});

categoriesRouter.post('/sub-types', requireRole('owner', 'manager'), validate(z.object({
  categoryId: z.string().uuid(),
  name: z.string().min(1),
  code: z.string().min(1).max(10),
})), async (c) => {
  const { tenantId } = c.get('tenant');
  const input = c.get('validatedBody') as any;
  const st = await categoryService.createSubType(tenantId, input);
  return c.json(success(st), 201);
});

categoriesRouter.patch('/sub-types/:id', requireRole('owner', 'manager'), validate(z.object({
  name: z.string().min(1).optional(),
  code: z.string().min(1).max(10).optional(),
}).refine(d => Object.keys(d).length > 0, { message: 'At least one field required' })), async (c) => {
  const { tenantId } = c.get('tenant');
  const id = c.req.param('id')!;
  const patch = c.get('validatedBody') as any;
  const st = await categoryService.updateSubType(tenantId, id, patch);
  return c.json(success(st));
});

// ======================== SIZE SYSTEMS ========================

categoriesRouter.get('/size-systems', async (c) => {
  const { tenantId } = c.get('tenant');
  const data = await categoryService.listSizeSystems(tenantId);
  return c.json(success(data));
});

categoriesRouter.post('/size-systems', requireRole('owner', 'manager'), validate(z.object({
  name: z.string().min(1),
  values: z.array(z.string()).min(1),
})), async (c) => {
  const { tenantId } = c.get('tenant');
  const input = c.get('validatedBody') as any;
  const ss = await categoryService.createSizeSystem(tenantId, input);
  return c.json(success(ss), 201);
});

categoriesRouter.patch('/size-systems/:id', requireRole('owner', 'manager'), validate(z.object({
  name: z.string().min(1).optional(),
  values: z.array(z.string()).min(1).optional(),
}).refine(d => Object.keys(d).length > 0, { message: 'At least one field required' })), async (c) => {
  const { tenantId } = c.get('tenant');
  const id = c.req.param('id')!;
  const patch = c.get('validatedBody') as any;
  const ss = await categoryService.updateSizeSystem(tenantId, id, patch);
  return c.json(success(ss));
});

// ======================== BRANDS ========================

categoriesRouter.get('/brands', async (c) => {
  const { tenantId } = c.get('tenant');
  const data = await categoryService.listBrands(tenantId);
  return c.json(success(data));
});

categoriesRouter.post('/brands', requireRole('owner', 'manager'), validate(z.object({
  name: z.string().min(1),
  code: z.string().min(1).max(10),
})), async (c) => {
  const { tenantId } = c.get('tenant');
  const input = c.get('validatedBody') as any;
  const brand = await categoryService.createBrand(tenantId, input);
  return c.json(success(brand), 201);
});

categoriesRouter.patch('/brands/:id', requireRole('owner', 'manager'), validate(z.object({
  name: z.string().min(1).optional(),
  code: z.string().min(1).max(10).optional(),
}).refine(d => Object.keys(d).length > 0, { message: 'At least one field required' })), async (c) => {
  const { tenantId } = c.get('tenant');
  const id = c.req.param('id')!;
  const patch = c.get('validatedBody') as any;
  const brand = await categoryService.updateBrand(tenantId, id, patch);
  return c.json(success(brand));
});

export default categoriesRouter;
