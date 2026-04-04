export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

export function parsePagination(query: { limit?: number; offset?: number }) {
  const limit = Math.min(Math.max(query.limit || DEFAULT_LIMIT, 1), MAX_LIMIT);
  const offset = Math.max(query.offset || 0, 0);
  return { limit, offset };
}

/**
 * Fetch one extra row to detect hasMore, then trim.
 * Call with limit + 1 in your query, then pass results here.
 */
export function paginateResults<T>(items: T[], limit: number, offset: number) {
  const hasMore = items.length > limit;
  if (hasMore) items.pop();
  return { items, hasMore, nextOffset: hasMore ? offset + limit : null };
}
