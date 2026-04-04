import { Hono } from 'hono';
import auth from './auth.routes.js';
import setup from './setup.routes.js';
import settings from './settings.routes.js';
import usersRouter from './users.routes.js';
import categoriesRouter from './categories.routes.js';
import productsRouter from './products.routes.js';
import stockRouter from './stock.routes.js';
import labelsRouter from './labels.routes.js';
import billsRouter from './bills.routes.js';
import purchasesRouter from './purchases.routes.js';
import uploadsRouter from './uploads.routes.js';
import suppliersRouter from './suppliers.routes.js';
import customersRouter from './customers.routes.js';
import cashRegisterRouter from './cash-register.routes.js';
import dashboardRouter from './dashboard.routes.js';
import { apiRateLimit } from '../middleware/rate-limit.js';
import { auditMiddleware } from '../middleware/audit.js';
import type { AppEnv } from '../types/hono.js';

const api = new Hono<AppEnv>();

// Global API rate limit: 100 req/sec per tenant (skipped if Redis unavailable)
api.use('*', apiRateLimit);

// Audit logging for all write operations (POST/PUT/PATCH/DELETE)
api.use('*', auditMiddleware);

api.route('/auth', auth);
api.route('/setup', setup);
api.route('/settings', settings);
api.route('/users', usersRouter);
api.route('/', categoriesRouter);
api.route('/products', productsRouter);
api.route('/stock', stockRouter);
api.route('/labels', labelsRouter);
api.route('/bills', billsRouter);
api.route('/purchases', purchasesRouter);
api.route('/uploads', uploadsRouter);
api.route('/suppliers', suppliersRouter);
api.route('/customers', customersRouter);
api.route('/cash-register', cashRegisterRouter);
api.route('/dashboard', dashboardRouter);

export default api;
