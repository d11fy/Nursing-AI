import { Pool, types, type PoolClient } from "pg";

// Keep the existing UI's serializable timestamp/number shapes.
types.setTypeParser(1184, (value) => new Date(value).toISOString());
types.setTypeParser(1082, (value) => value);
types.setTypeParser(20, Number);
types.setTypeParser(1700, Number);
const globalDb = globalThis as unknown as { nursingPool?: Pool };
let roleVerified:Promise<void>|undefined;
export async function verifyRuntimeRole() {
  if(process.env.NODE_ENV!=='production')return;
  return roleVerified??=getPool().query<{rolsuper:boolean;rolbypassrls:boolean}>('select rolsuper,rolbypassrls from pg_roles where rolname=current_user').then(({rows})=>{
    if(!rows[0]||rows[0].rolsuper||rows[0].rolbypassrls)throw new Error('Runtime DATABASE_URL must use a role without SUPERUSER or BYPASSRLS; use MIGRATION_DATABASE_URL for DDL');
  });
}

export function getPool() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  return globalDb.nursingPool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 8_000,
    statement_timeout: 15_000,
  });
}

export async function transaction<T>(run: (client: PoolClient) => Promise<T>): Promise<T> {
  await verifyRuntimeRole();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await run(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
