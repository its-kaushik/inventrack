import { Hono } from 'hono';
import auth from './auth.routes.js';
import setup from './setup.routes.js';
import settings from './settings.routes.js';
import usersRouter from './users.routes.js';
import type { AppEnv } from '../types/hono.js';

const api = new Hono<AppEnv>();

api.route('/auth', auth);
api.route('/setup', setup);
api.route('/settings', settings);
api.route('/users', usersRouter);

export default api;
