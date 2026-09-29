import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

async function main() {
  // Dynamic imports ensure provider configuration is read after .env.local.
  const { getAIConfig } = await import("../lib/ai/config.mjs");
  const { runMigrations } = await import("./migrate.mjs");
  const { getPool } = await import("../lib/db/pool");
  const { processDocument } = await import("../lib/knowledge");
  let pool: ReturnType<typeof getPool> | undefined;

  try {
    const config = getAIConfig();
    await runMigrations();
    pool = getPool();
    const staleOnly = process.argv.includes("--stale-only");
    const documents = await pool.query<{ id: string }>(`SELECT id FROM documents ${staleOnly ? "WHERE index_version<2 OR status='failed'" : ""} ORDER BY created_at`);
    console.log(`Reindexing ${documents.rows.length} documents with ${config.provider}/${config.embeddingModel}`);
    let failed = 0;
    for (const { id } of documents.rows) {
      try { await processDocument(id); console.log(`Indexed ${id}`); }
      catch(error) { failed++; console.error(`Failed ${id}: ${error instanceof Error ? error.message : "Indexing error"}`); }
    }
    if(failed) process.exitCode=1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Reindex failed");
    process.exitCode = 1;
  } finally { await pool?.end(); }
}

void main().catch((error) => { console.error(error instanceof Error ? error.message : "Reindex failed"); process.exitCode = 1; });
