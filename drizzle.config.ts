import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    // Use direct connection for migrations (DDL doesn't work through PgBouncer)
    url: process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL!,
  },
});
