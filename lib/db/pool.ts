import { Pool, types, type PoolClient } from "pg";

// Keep the existing UI's serializable timestamp/number shapes.
types.setTypeParser(1184, (value) => new Date(value).toISOString());
types.setTypeParser(1082, (value) => value);
types.setTypeParser(20, Number);
types.setTypeParser(1700, Number);
const globalDb = globalThis as unknown as { nursingPool?: Pool };

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
