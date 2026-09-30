import 'server-only';
import { transaction } from '@/lib/db/pool';
import type { PoolClient } from 'pg';

export async function withIdentity<T>(userId: string | null, run: (db: PoolClient) => Promise<T>, worker = false): Promise<T> {
  return transaction(async db => {
    await db.query("select set_config('app.user_id',$1,true),set_config('app.ai_worker',$2,true)", [userId ?? '', worker ? 'on' : 'off']);
    return run(db);
  });
}
export const workerDb = { query: <T extends import('pg').QueryResultRow = Record<string, unknown>>(sql: string, values?: unknown[]) =>
  withIdentity(null, db => db.query<T>(sql, values), true) };
export function identityDb(userId: string) {
  return { query: <T extends import('pg').QueryResultRow = Record<string, unknown>>(sql: string, values?: unknown[]) =>
    withIdentity(userId, db => db.query<T>(sql, values)) };
}
