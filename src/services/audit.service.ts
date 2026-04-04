import { sql } from 'drizzle-orm';
import { db } from '../config/database.js';
import { logger } from '../lib/logger.js';

interface AuditEntry {
  tenantId: string;
  userId: string;
  action: 'create' | 'update' | 'delete' | 'login' | 'logout' | 'void';
  entityType: string;
  entityId?: string;
  oldValue?: unknown;
  newValue?: unknown;
  ipAddress?: string;
}

export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, old_value, new_value, ip_address)
      VALUES (
        ${entry.tenantId},
        ${entry.userId},
        ${entry.action},
        ${entry.entityType},
        ${entry.entityId ?? null},
        ${entry.oldValue ? JSON.stringify(entry.oldValue) : null}::jsonb,
        ${entry.newValue ? JSON.stringify(entry.newValue) : null}::jsonb,
        ${entry.ipAddress ?? null}::inet
      )
    `);
  } catch (err) {
    // Audit logging should never break the request — log and continue
    logger.error({ err, entry }, 'Failed to write audit log');
  }
}
