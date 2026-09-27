import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());

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
    const documents = await pool.query<{ id: string }>("SELECT id FROM documents ORDER BY created_at");
    console.log(`Reindexing ${documents.rows.length} documents with ${config.provider}/${config.embeddingModel}`);
    for (const { id } of documents.rows) {
      await processDocument(id);
      console.log(`Indexed ${id}`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Reindex failed");
    process.exitCode = 1;
  } finally { await pool?.end(); }
}

void main().catch((error) => { console.error(error instanceof Error ? error.message : "Reindex failed"); process.exitCode = 1; });
