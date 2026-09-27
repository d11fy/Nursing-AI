import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import pg from "pg";

export async function migrate(client) {
  const sql = await readFile(new URL("../database/0001_init.sql", import.meta.url), "utf8");
  const seed = await readFile(new URL("../database/seed.sql", import.meta.url), "utf8");
  const checksum = createHash("sha256").update(sql).digest("hex");
  await client.query("BEGIN");
  try {
    await client.query("SELECT pg_advisory_xact_lock(73194025)");
    await client.query("CREATE TABLE IF NOT EXISTS app_migrations (version text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())");
    const { rows } = await client.query("SELECT checksum FROM app_migrations WHERE version='0001'");
    if (rows[0] && rows[0].checksum !== checksum) throw new Error("Migration checksum mismatch; do not modify an applied migration");
    if (!rows.length) {
      // Refuse to overwrite an existing Supabase/other application's schema.
      const existing = await client.query("SELECT to_regclass('public.profiles') AS profiles");
      if (existing.rows[0].profiles) throw new Error("Use a new dedicated database; profiles already exists");
      await client.query(sql);
      await client.query(seed);
      await client.query("INSERT INTO app_migrations(version,checksum) VALUES('0001',$1)", [checksum]);
    }
    for (const file of ["0002_embedding_spaces.sql", "0003_academic_year_subjects.sql", "0004_lectures.sql"]) {
      const version = file.split("_")[0];
      const migration = await readFile(new URL(`../database/${file}`, import.meta.url), "utf8");
      const digest = createHash("sha256").update(migration).digest("hex");
      const applied = await client.query("SELECT checksum FROM app_migrations WHERE version=$1", [version]);
      if (applied.rows[0] && applied.rows[0].checksum !== digest) throw new Error(`Migration ${version} checksum mismatch`);
      if (!applied.rows.length) {
        // ALTER TYPE ... ADD VALUE cannot appear in a multi-statement command
        // string alongside other statements (a real PostgreSQL restriction),
        // so pull those lines out and run each as its own single statement.
        const enumAdds = [...migration.matchAll(/^alter type .+ add value.*;$/gim)].map((m) => m[0]);
        const rest = migration.replace(/^alter type .+ add value.*;$/gim, "").trim();
        if (rest) await client.query(rest);
        for (const statement of enumAdds) await client.query(statement);
        await client.query("INSERT INTO app_migrations(version,checksum) VALUES($1,$2)", [version, digest]);
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

export async function runMigrations() {
  if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL to the internal PostgreSQL connection URL");
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10_000 });
  try {
    await client.connect();
    await migrate(client);
    console.log("PostgreSQL schema ready");
  } finally { await client.end(); }
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/migrate.mjs")) {
  import("@next/env").then(({ default: nextEnv }) => {
    nextEnv.loadEnvConfig(process.cwd());
    return runMigrations();
  }).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
