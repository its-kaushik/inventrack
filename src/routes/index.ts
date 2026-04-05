import { Hono } from 'hono';
import { authRoutes } from './auth.routes.js';
import { userRoutes } from './users.routes.js';
import { adminRoutes } from './admin.routes.js';
import { settingsRoutes } from './settings.routes.js';
import type { AppEnv } from '../types/hono.js';

export const routes = new Hono<AppEnv>();

routes.route('/auth', authRoutes);
routes.route('/users', userRoutes);
routes.route('/admin', adminRoutes);
routes.route('/settings', settingsRoutes);
