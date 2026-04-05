export const CONSTANTS = {
  PAGINATION: {
    DEFAULT_PAGE: 1,
    DEFAULT_LIMIT: 50,
    MAX_LIMIT: 200,
  },
  AUTH: {
    PIN_MAX_ATTEMPTS: 5,
    PIN_LOCKOUT_MINUTES: 15,
    PIN_APPROVAL_TOKEN_EXPIRY: '2m',
    RATE_LIMIT_LOGIN: { max: 5, windowMs: 60_000 },
  },
  STOCK: {
    OPTIMISTIC_LOCK_MAX_RETRIES: 3,
    OPTIMISTIC_LOCK_BASE_DELAY_MS: 50,
  },
  SYNC: {
    MAX_BILLS_PER_SYNC: 50,
  },
  IMAGES: {
    MAX_SIZE_BYTES: 5 * 1024 * 1024,
    THUMBNAIL: { width: 200, height: 200, quality: 80 },
    MEDIUM: { width: 600, height: 600, quality: 85 },
  },
  FINANCIAL_YEAR: {
    START_MONTH: 3, // April (0-indexed)
  },
  JOBS: {
    PARKED_BILL_EXPIRY_HOURS: 24,
    NOTIFICATION_RETENTION_DAYS: 90,
  },
} as const;
