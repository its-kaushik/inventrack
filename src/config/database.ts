import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from './env.js';
import * as schema from '../db/schema/index.js';

const queryClient = postgres(env.DATABASE_URL, {
  max: 20,
  idle_timeout: 30,
  connect_timeout: 10,
  ssl: env.NODE_ENV === 'production' || env.DATABASE_URL.includes('supabase') ? 'require' : undefined,
});

export const db = drizzle(queryClient, { schema });
export { queryClient };
