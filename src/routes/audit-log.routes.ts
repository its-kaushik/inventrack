import { Hono } from 'hono';
import * as auditLogQueryService from '../services/audit-log-query.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { tenantScope } from '../middleware/tenant-scope.js';
import { requireRole } from '../middleware/rbac.js';
import { paginated } from '../lib/response.js';
import type { AppEnv } from '../types/hono.js';

const auditLogRouter = new Hono<AppEnv>();

auditLogRouter.use('*', authMiddleware, tenantScope, requireRole('owner'));

// GET / — list audit logs with optional filters
auditLogRouter.get('/', async (c) => {
  const { tenantId } = c.get('tenant');
  const filters = {
    userId: c.req.query('user_id'),
    action: c.req.query('action'),
    entityType: c.req.query('entity_type'),
    from: c.req.query('from'),
    to: c.req.query('to'),
    limit: c.req.query('limit') ? Number(c.req.query('limit')) : 20,
    offset: c.req.query('offset') ? Number(c.req.query('offset')) : 0,
  };
  const result = await auditLogQueryService.listAuditLogs(tenantId, filters);
  return c.json(paginated(result.items, result.hasMore ? 'next' : null, result.hasMore));
});

export default auditLogRouter;
