import { eq, and, isNull, type SQL } from 'drizzle-orm';
import type { PgTable, PgColumn } from 'drizzle-orm/pg-core';
import type { Database, Transaction } from '../db/client.js';
import { AppError } from '../types/errors.js';

/**
 * Base repository enforcing:
 * 1. Tenant isolation (WHERE tenant_id = ?)
 * 2. Soft delete filtering (AND deleted_at IS NULL)
 *
 * All repositories extend this. Individual queries NEVER manually
 * add tenant_id or deleted_at filters.
 */
export class BaseRepository {
  constructor(protected db: Database | Transaction) {}

  /**
   * Returns base WHERE conditions for any query on a tenant-scoped table.
   * Automatically appends deleted_at IS NULL if the table has a deletedAt column.
   */
  protected tenantScope(
    tenantIdCol: PgColumn,
    tenantId: string,
    deletedAtCol?: PgColumn,
  ): SQL {
    const conditions: SQL[] = [eq(tenantIdCol, tenantId)];
    if (deletedAtCol) {
      conditions.push(isNull(deletedAtCol));
    }
    return and(...conditions)!;
  }

  /**
   * Returns a new repository instance bound to a transaction.
   */
  withTx(tx: Transaction): this {
    const clone = Object.create(Object.getPrototypeOf(this));
    Object.assign(clone, this);
    clone.db = tx;
    return clone;
  }
}

/**
 * Validates that a referenced entity exists and is not soft-deleted.
 * Use in the service layer before creating records with foreign keys.
 */
export function assertExists<T>(
  result: T | undefined | null,
  entityName: string,
): asserts result is T {
  if (!result) {
    throw new AppError('NOT_FOUND', `${entityName} not found or has been deactivated`, 404);
  }
}
