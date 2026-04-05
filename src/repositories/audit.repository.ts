import { auditLogs } from '../db/schema/audit.js';
import type { Database, Transaction } from '../db/client.js';

export interface AuditLogEntry {
  tenantId?: string | null;
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  metadata?: unknown;
  ipAddress?: string;
}

export class AuditRepository {
  constructor(private db: Database | Transaction) {}

  async log(entry: AuditLogEntry): Promise<void> {
    await this.db.insert(auditLogs).values({
      tenantId: entry.tenantId ?? null,
      userId: entry.userId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      oldValue: entry.oldValue ?? null,
      newValue: entry.newValue ?? null,
      metadata: entry.metadata ?? null,
      ipAddress: entry.ipAddress ?? null,
    });
  }

  withTransaction(tx: Transaction): AuditRepository {
    return new AuditRepository(tx);
  }
}
