// A node-postgres-like pool over one PGlite connection.
//
// PGlite is a single connection. Independent requests running concurrently
// would interleave statements of different transactions on it, which real
// Postgres never does. This pool serializes transactions with a lock that is
// re-entrant within one async call chain (nested helpers keep working), so
// concurrent requests behave like separate, serialized transactions. That is
// enough to catch check-then-act races split across statements or
// transactions; it does not reproduce Postgres row-lock timing exactly.
import { AsyncLocalStorage } from "node:async_hooks";
import type { PGlite } from "@electric-sql/pglite";

export function serializedPool(db: PGlite) {
  const lockOwner = new AsyncLocalStorage<symbol>();
  let held: symbol | null = null;
  let waiters: Array<() => void> = [];

  async function acquire(token: symbol) {
    while (held) await new Promise<void>((resolve) => waiters.push(resolve));
    held = token;
  }
  function release(token: symbol) {
    if (held !== token) return;
    held = null;
    const next = waiters;
    waiters = [];
    next.forEach((resume) => resume());
  }
  const ownsLock = () => { const current = lockOwner.getStore(); return Boolean(current && current === held); };

  async function rawQuery(sql: string, values?: unknown[]) {
    if (!values && (sql.includes(";") || sql.includes("--"))) {
      await db.exec(sql);
      return { rows: [] as never[] };
    }
    const result = await db.query<Record<string, unknown>>(sql, values);
    // node-postgres returns bytea as Buffer; PGlite returns Uint8Array.
    for (const row of result.rows) for (const [key, value] of Object.entries(row))
      if (value instanceof Uint8Array && !Buffer.isBuffer(value)) row[key] = Buffer.from(value);
    return result;
  }

  return {
    rawQuery,
    query: async (sql: string, values?: unknown[]) => {
      if (ownsLock()) return rawQuery(sql, values);
      const token = Symbol("query");
      await acquire(token);
      try { return await lockOwner.run(token, () => rawQuery(sql, values)); } finally { release(token); }
    },
    // Deliberately not async: enterWith must run synchronously in the
    // caller's frame so nested connects later in the same call chain are
    // recognized as re-entrant instead of waiting on their own transaction.
    connect: () => {
      if (ownsLock()) return Promise.resolve({ query: rawQuery, release() {} });
      const token = Symbol("tx");
      lockOwner.enterWith(token);
      return acquire(token).then(() => ({ query: rawQuery, release() { release(token); } }));
    },
  };
}
