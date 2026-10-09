// Shared harness for route-level regression tests: an in-memory database with
// a serialized pool, mocked Next.js request APIs and real sessions.
import { mock } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { serializedPool } from "./serialized-pool";

export const db = new PGlite({ extensions: { vector } });
const pool = serializedPool(db);
export const query = pool.rawQuery;

export function installPool() {
  Object.assign(globalThis, { nursingPool: { query: pool.query, connect: pool.connect } });
}

// Cookies for the "current request". Route handlers read them through the
// mocked next/headers module exactly as they would in production.
const jar = new Map<string, string>();
let requestHeaders = new Headers();
/** Headers of the "current request", e.g. the mobile app's Authorization bearer. */
export function setRequestHeaders(headers: Record<string, string>) {
  requestHeaders = new Headers(headers);
}
export function signInAs(tokens: { sessionToken: string; deviceToken: string } | null) {
  jar.clear();
  if (tokens) {
    jar.set("nursing_session", tokens.sessionToken);
    jar.set("nursing_device", tokens.deviceToken);
  }
}

export function mockNextRuntime() {
  mock.module("next/headers", {
    namedExports: {
      cookies: async () => ({
        get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
        set: (name: string, value: string) => { jar.set(name, value); },
        delete: (name: string) => { jar.delete(name); },
      }),
      headers: async () => requestHeaders,
    },
  });
  mock.module("next/cache", { namedExports: { revalidatePath: () => undefined, revalidateTag: () => undefined } });
  const redirectError = (url: string) => Object.assign(new Error(`NEXT_REDIRECT ${url}`), { digest: `NEXT_REDIRECT;${url}` });
  mock.module("next/navigation", {
    namedExports: {
      redirect: (url: string) => { throw redirectError(url); },
      notFound: () => { throw Object.assign(new Error("NEXT_NOT_FOUND"), { digest: "NEXT_NOT_FOUND" }); },
    },
  });
}

export async function bootDatabase() {
  process.env.DATABASE_URL = "postgresql://release-hardening-test";
  process.env.AUTH_SECRET = "release-hardening-secret-".repeat(3);
  process.env.APP_URL = "https://nursing.example.test";
  installPool();
  const { migrate } = await import("../../scripts/migrate.mjs");
  await migrate({ query: pool.rawQuery });
}

/**
 * Runs `run` as a NOSUPERUSER/NOBYPASSRLS role, like production's runtime
 * DATABASE_URL. The default PGlite user is a superuser and bypasses RLS.
 */
export async function asRuntimeRole<T>(run: () => Promise<T>): Promise<T> {
  await db.exec(`do $$ begin
    if not exists (select 1 from pg_roles where rolname='hardening_runtime') then
      create role hardening_runtime nosuperuser nobypassrls;
    end if; end $$;
    grant usage on schema public to hardening_runtime;
    grant select,insert,update,delete on all tables in schema public to hardening_runtime;
    grant usage,select on all sequences in schema public to hardening_runtime;
    grant execute on all functions in schema public to hardening_runtime;`);
  await db.query("set role hardening_runtime");
  try { return await run(); } finally { await db.query("reset role"); }
}

export async function createUser(id: string, role: "student" | "admin" = "student", name = "Test") {
  await db.query("insert into app_users(id,email,password_hash) values($1,$2,'x')", [id, `${id}@example.test`]);
  await db.query("insert into profiles(user_id,email,full_name,role) values($1,$2,$3,$4)", [id, `${id}@example.test`, name, role]);
  const { establishSession } = await import("../../lib/auth/session-store");
  return establishSession(id);
}

export async function setTrialLimit(key: string, value: number) {
  await db.query("insert into settings(key,value) values($1,$2) on conflict(key) do update set value=excluded.value", [key, JSON.stringify(value)]);
}

export function jsonRequest(url: string, body: unknown, init: RequestInit = {}) {
  return new Request(`https://nursing.example.test${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
    body: JSON.stringify(body),
  });
}

export function formRequest(url: string, form: FormData, headers: Record<string, string> = {}) {
  return new Request(`https://nursing.example.test${url}`, { method: "POST", body: form, headers });
}

export const minimalPdf = () => Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
export const minimalPng = () => Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000", "hex");
