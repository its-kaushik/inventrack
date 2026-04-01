export function success<T>(data: T, meta?: Record<string, unknown>) {
  return {
    success: true as const,
    data,
    meta: meta ?? null,
    error: null,
  };
}

export function paginated<T>(data: T[], cursor: string | null, hasMore: boolean) {
  return {
    success: true as const,
    data,
    meta: { cursor, has_more: hasMore },
    error: null,
  };
}
