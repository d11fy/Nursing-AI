import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { vector } from '@electric-sql/pglite-pgvector';
import { migrate } from "../scripts/migrate.mjs";
import {
  saveKnowledgeChunk,
  getUploadedChunksList,
  downloadKnowledgeDocument,
  deleteKnowledgeChunks,
} from "../lib/storage";

test("large knowledge chunked upload, assembly and purge lifecycle", async () => {
  process.env.DATABASE_URL = "postgresql://integration-test-only";
  const db = new PGlite({extensions:{vector}});
  const executor = (sql: string, values?: unknown[]) => db.query(sql, values);

  const migrationClient = {
    query: async (sql: string, values?: unknown[]) => {
      if (!values && (sql.includes(";") || sql.includes("--"))) {
        await db.exec(sql);
        return { rows: [] };
      }
      return db.query(sql, values);
    },
  };

  Object.assign(globalThis, {
    nursingPool: {
      query: executor,
      connect: async () => ({ query: executor, release() {} }),
    },
  });

  // Run migrations including 0008
  await migrate(migrationClient);

  const testPath = "knowledge/test-large-file-uuid";

  // Simulate uploading 3 chunks (e.g. 3 x 1MB for unit test)
  const chunk0 = Buffer.from("CHUNK_ZERO_DATA_".repeat(1000));
  const chunk1 = Buffer.from("CHUNK_ONE_DATA__".repeat(1000));
  const chunk2 = Buffer.from("CHUNK_TWO_DATA__".repeat(1000));
  const fullExpected = Buffer.concat([chunk0, chunk1, chunk2]);

  // Save chunks sequentially
  await saveKnowledgeChunk(testPath, 0, chunk0);
  await saveKnowledgeChunk(testPath, 1, chunk1);
  await saveKnowledgeChunk(testPath, 2, chunk2);

  // Verify getUploadedChunksList
  const uploadedIndices = await getUploadedChunksList(testPath);
  assert.deepEqual(uploadedIndices, [0, 1, 2]);

  // Verify downloadKnowledgeDocument correctly assembles all chunks in order
  const downloaded = await downloadKnowledgeDocument(testPath);
  assert.equal(downloaded.length, fullExpected.length);
  assert.deepEqual(downloaded, fullExpected);

  // Test cancellation purge: deleteKnowledgeChunks
  await deleteKnowledgeChunks(testPath);
  const afterDeleteIndices = await getUploadedChunksList(testPath);
  assert.equal(afterDeleteIndices.length, 0);

  // Verify downloading after deletion fails properly
  await assert.rejects(downloadKnowledgeDocument(testPath));

  // Test 50MB simulated file across ten 5MB chunks
  const fiftyMbPath = "knowledge/test-50mb-uuid";
  const CHUNK_5MB = 5 * 1024 * 1024;
  const chunkBuffer = Buffer.alloc(CHUNK_5MB, 65); // 'A'
  for (let i = 0; i < 10; i++) {
    await saveKnowledgeChunk(fiftyMbPath, i, chunkBuffer);
  }
  const chunkList50Mb = await getUploadedChunksList(fiftyMbPath);
  assert.equal(chunkList50Mb.length, 10);

  const downloaded50Mb = await downloadKnowledgeDocument(fiftyMbPath);
  assert.equal(downloaded50Mb.length, 50 * 1024 * 1024);
  assert.equal(downloaded50Mb[0], 65);
  assert.equal(downloaded50Mb[downloaded50Mb.length - 1], 65);

  await deleteKnowledgeChunks(fiftyMbPath);
  assert.equal((await getUploadedChunksList(fiftyMbPath)).length, 0);

  await db.close();
});
