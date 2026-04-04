import { eq, and, sql } from 'drizzle-orm';
import { db } from '../config/database.js';
import { syncConflicts } from '../db/schema/sync-conflicts.js';
import { NotFoundError } from '../lib/errors.js';
import type { SyncConflictStatus } from '../types/enums.js';

export async function listConflicts(
  tenantId: string,
  filters?: { status?: SyncConflictStatus; limit?: number; offset?: number },
) {
  const status = filters?.status ?? 'pending';
  const limit = Math.min(filters?.limit || 20, 100);
  const offset = filters?.offset || 0;

  const conditions = [eq(syncConflicts.tenantId, tenantId), eq(syncConflicts.status, status)];

  const items = await db
    .select()
    .from(syncConflicts)
    .where(and(...conditions))
    .orderBy(syncConflicts.createdAt)
    .limit(limit + 1)
    .offset(offset);

  const hasMore = items.length > limit;
  if (hasMore) items.pop();

  return { items, hasMore };
}

export async function getConflictCount(tenantId: string) {
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(syncConflicts)
    .where(and(eq(syncConflicts.tenantId, tenantId), eq(syncConflicts.status, 'pending')));

  return result?.count ?? 0;
}

export async function resolveConflict(
  tenantId: string,
  conflictId: string,
  userId: string,
  action: 'force_accepted' | 'edited' | 'voided',
  notes?: string,
) {
  const [conflict] = await db
    .select()
    .from(syncConflicts)
    .where(and(eq(syncConflicts.id, conflictId), eq(syncConflicts.tenantId, tenantId)))
    .limit(1);

  if (!conflict) throw new NotFoundError('SyncConflict', conflictId);

  const [updated] = await db
    .update(syncConflicts)
    .set({
      status: action,
      resolvedBy: userId,
      resolvedAt: new Date(),
      resolutionNotes: notes ?? null,
    })
    .where(and(eq(syncConflicts.id, conflictId), eq(syncConflicts.tenantId, tenantId)))
    .returning();

  return updated;
}
