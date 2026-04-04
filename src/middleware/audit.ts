import type { Context, Next } from 'hono';
import { logAudit } from '../services/audit.service.js';

const METHOD_TO_ACTION: Record<string, 'create' | 'update' | 'delete'> = {
  POST: 'create',
  PUT: 'update',
  PATCH: 'update',
  DELETE: 'delete',
};

// Extract entity type and ID from URL path like /api/v1/products/uuid
function parseEntityFromPath(path: string): { entityType: string; entityId?: string } {
  const segments = path
    .replace(/^\/api\/v1\/?/, '')
    .split('/')
    .filter(Boolean);
  if (segments.length === 0) return { entityType: 'unknown' };

  const entityType = segments[0].replace(/-/g, '_');
  // If second segment looks like a UUID, treat it as the entity ID
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const entityId = segments[1] && uuidPattern.test(segments[1]) ? segments[1] : undefined;

  return { entityType, entityId };
}

export async function auditMiddleware(c: Context, next: Next) {
  const method = c.req.method;

  // Only audit write operations
  if (!METHOD_TO_ACTION[method]) {
    await next();
    return;
  }

  await next();

  // Only log successful mutations (2xx status)
  const status = c.res.status;
  if (status < 200 || status >= 300) return;

  const tenant = c.get('tenant') as { tenantId: string; userId: string } | undefined;
  if (!tenant) return;

  const action = METHOD_TO_ACTION[method];
  const { entityType, entityId } = parseEntityFromPath(c.req.path);
  const ipAddress = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || undefined;

  // Fire-and-forget — don't block the response
  logAudit({
    tenantId: tenant.tenantId,
    userId: tenant.userId,
    action,
    entityType,
    entityId,
    ipAddress,
  });
}
