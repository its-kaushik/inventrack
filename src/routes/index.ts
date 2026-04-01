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
import type { AppEnv } from '../types/hono.js';

const api = new Hono<AppEnv>();

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

export default api;
