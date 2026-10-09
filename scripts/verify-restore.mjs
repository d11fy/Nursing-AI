// Restore drill: restores a pg_dump custom-format backup into a SEPARATE,
// disposable database and checks that the important tables came back.
//
//   RESTORE_DATABASE_URL=postgresql://.../nursing_restore_test \
//   node scripts/verify-restore.mjs /path/to/nursing-....dump
//
// Safety: refuses to run against DATABASE_URL / MIGRATION_DATABASE_URL, and
// the target database name must contain "restore" or "test". The target is
// cleaned with pg_restore --clean, so never point it at real data.
import nextEnv from "@next/env";
import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import pg from "pg";
import { databaseFingerprint } from "./backup-receipt.mjs";

nextEnv.loadEnvConfig(process.cwd());
const dump = process.argv[2];
const target = process.env.RESTORE_DATABASE_URL;
if (!dump || !target) throw new Error("Usage: RESTORE_DATABASE_URL=... node scripts/verify-restore.mjs <dump-file>");
const url = new URL(target);
const name = decodeURIComponent(url.pathname.slice(1));
for (const live of [process.env.DATABASE_URL, process.env.MIGRATION_DATABASE_URL].filter(Boolean))
  if (databaseFingerprint(live) === databaseFingerprint(target)) throw new Error("Refusing to restore over the live database");
if (!/restore|test/i.test(name)) throw new Error(`Target database "${name}" must contain "restore" or "test" in its name`);
if ((await stat(dump)).size < 100) throw new Error("Dump file is missing or empty");

const env = { ...process.env, PGPASSWORD: decodeURIComponent(url.password), PGHOST: url.hostname, PGPORT: url.port || "5432",
  PGUSER: decodeURIComponent(url.username), PGDATABASE: name };
if (url.searchParams.get("sslmode")) env.PGSSLMODE = url.searchParams.get("sslmode");

const started = Date.now();
await new Promise((ok, fail) => {
  const child = spawn(process.env.PG_RESTORE_PATH || "pg_restore",
    ["--clean", "--if-exists", "--no-owner", "--no-privileges", "--exit-on-error", "--dbname", name, dump],
    { env, windowsHide: true, stdio: ["ignore", "inherit", "inherit"] });
  child.on("error", fail);
  child.on("exit", (code) => (code === 0 ? ok() : fail(new Error(`pg_restore failed (${code})`))));
});
const restoreSeconds = Math.round((Date.now() - started) / 1000);

// Tables a working platform cannot do without; each must exist and be readable.
const CRITICAL = ["app_migrations", "app_users", "profiles", "subjects", "conversations", "messages", "lectures",
  "knowledge_documents", "knowledge_chunks", "study_packs", "subscription_plans", "user_subscriptions",
  "payment_requests", "subscription_usage", "stored_files", "settings", "email_logs"];
const client = new pg.Client({ connectionString: target });
await client.connect();
try {
  const counts = {};
  for (const table of CRITICAL) {
    const exists = (await client.query("select to_regclass($1) t", [`public.${table}`])).rows[0].t;
    if (!exists) throw new Error(`Restored database is missing table ${table}`);
    counts[table] = Number((await client.query(`select count(*)::bigint n from public.${table}`)).rows[0].n);
  }
  const latest = (await client.query("select max(version) v from app_migrations")).rows[0].v;
  const orphanProfiles = Number((await client.query("select count(*) n from profiles p left join app_users u on u.id=p.user_id where u.id is null")).rows[0].n);
  if (orphanProfiles) throw new Error(`${orphanProfiles} profiles reference missing users`);
  if (counts.app_users > 0 && counts.profiles === 0) throw new Error("Users restored without profiles");
  console.log(JSON.stringify({ ok: true, restoreSeconds, latestMigration: latest, counts }, null, 2));
} finally {
  await client.end();
}
