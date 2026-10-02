import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
export { sql } from 'drizzle-orm';
export { v7 as newId } from 'uuid';
export * as schema from './schema.js';

export function createDatabase(url: string, max = 4) {
  const pool = new pg.Pool({ connectionString: url, max, connectionTimeoutMillis: 5000, idleTimeoutMillis: 10000 });
  pool.on('error', () => console.error(JSON.stringify({ event: 'database_pool_error' })));
  const db = drizzle(pool);
  return { pool, db };
}
export type Database = ReturnType<typeof createDatabase>;
export type Transaction = Parameters<Parameters<Database['db']['transaction']>[0]>[0];
export async function rows<T>(tx: Transaction, query: ReturnType<typeof sql>): Promise<T[]> {
  const result = await tx.execute(query);
  return result.rows as T[];
}
export function withTenant<T>(database: Database, tenantId: string, userId: string | null, action: (tx: Transaction) => Promise<T>) {
  if (!/^[0-9a-f-]{36}$/i.test(tenantId) || (userId !== null && !/^[0-9a-f-]{36}$/i.test(userId))) throw new Error('Invalid trusted context');
  return database.db.transaction(async tx => {
    await tx.execute(sql`select set_config('app.current_tenant_id', ${tenantId}, true), set_config('app.current_user_id', ${userId ?? ''}, true)`);
    return action(tx);
  });
}
export async function assertApplicationRole(database: Database, expected: string) {
  const result = await database.pool.query('select current_user as name, rolsuper, rolbypassrls from pg_roles where rolname=current_user');
  const role = result.rows[0];
  if (role.name !== expected || role.rolsuper || role.rolbypassrls) throw new Error('Unsafe database role');
}
