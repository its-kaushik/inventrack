import { sql } from 'drizzle-orm';
import { db } from '../config/database.js';

interface AuditLogFilters {
  userId?: string;
  action?: string;
  entityType?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export async function listAuditLogs(tenantId: string, filters: AuditLogFilters) {
  const limit = filters.limit ?? 20;
  const offset = filters.offset ?? 0;

  // Build WHERE clauses; always include created_at range for partition pruning
  const conditions: string[] = [`al.tenant_id = '${tenantId}'`];

  // Default to last 30 days if no date range specified (partition pruning)
  const fromDate =
    filters.from ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  conditions.push(`al.created_at >= '${fromDate}'`);

  if (filters.to) {
    conditions.push(`al.created_at <= '${filters.to}'`);
  }

  if (filters.userId) {
    conditions.push(`al.user_id = '${filters.userId}'`);
  }

  if (filters.action) {
    conditions.push(`al.action = '${filters.action}'`);
  }

  if (filters.entityType) {
    conditions.push(`al.entity_type = '${filters.entityType}'`);
  }

  const whereClause = conditions.join(' AND ');

  const rows = await db.execute(
    sql.raw(`
    SELECT al.id, al.user_id, u.name AS user_name,
           al.action, al.entity_type, al.entity_id,
           al.old_value, al.new_value, al.ip_address,
           al.created_at
    FROM audit_logs al
    LEFT JOIN users u ON al.user_id = u.id
    WHERE ${whereClause}
    ORDER BY al.created_at DESC
    LIMIT ${limit + 1} OFFSET ${offset}
  `),
  );

  const items = (rows as any[]).slice(0, limit);
  const hasMore = (rows as any[]).length > limit;

  return { items, hasMore };
}
