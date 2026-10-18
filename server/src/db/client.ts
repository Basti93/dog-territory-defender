import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import * as schema from './schema';

/** Driver-agnostic handle: postgres.js in production, PGlite in tests. A transaction handle is also a Db. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface DbConnection {
  db: Db;
  close(): Promise<void>;
}

export function connectPostgres(databaseUrl: string): DbConnection {
  const client = postgres(databaseUrl, { max: 5, onnotice: () => {} });
  const db = drizzle(client, { schema }) as unknown as Db;
  return { db, close: () => client.end({ timeout: 5 }) };
}

export async function runMigrations(databaseUrl: string, migrationsFolder: string): Promise<void> {
  const client = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(client), { migrationsFolder });
  } finally {
    await client.end({ timeout: 5 });
  }
}

export { schema };
