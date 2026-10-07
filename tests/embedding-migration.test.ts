import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { vector } from '@electric-sql/pglite-pgvector';
import { migrate } from "../scripts/migrate.mjs";

test("upgrade preserves legacy data, excludes unlabelled vectors, and is repeatable", async () => {
  const db = new PGlite({extensions:{vector}});
  try {
    const initial = await readFile(new URL("../database/0001_init.sql", import.meta.url), "utf8");
    await db.exec(initial);
    await db.exec("CREATE TABLE app_migrations(version text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz DEFAULT now())");
    await db.query("INSERT INTO app_migrations(version,checksum) VALUES('0001',$1)", [createHash("sha256").update(initial).digest("hex")]);
    const doc = await db.query<{ id: string }>("INSERT INTO documents(title,file_name,file_url,status) VALUES('legacy','legacy.txt','legacy-file','ready') RETURNING id");
    const vector = Array(1536).fill(0.5);
    await db.query("INSERT INTO document_chunks(document_id,content,embedding,chunk_index) VALUES($1,'legacy content',$2,0)", [doc.rows[0].id, vector]);
    const client = { query: async (sql: string, values?: unknown[]) => {
      if (!values && (sql.includes(';') || sql.includes('--'))) { await db.exec(sql); return { rows: [] }; }
      return db.query(sql, values);
    } };
    await migrate(client);
    await migrate(client);
    assert.equal((await db.query("SELECT * FROM document_chunks")).rows.length, 1);
    assert.equal((await db.query("SELECT * FROM documents")).rows.length, 1);
    assert.equal((await db.query("SELECT * FROM match_document_chunks($1,null,5,'openai','text-embedding-3-small')", [vector])).rows.length, 0);
    assert.equal((await db.query("SELECT * FROM app_migrations")).rows.length, 23);
    await assert.rejects(db.query("SELECT * FROM match_document_chunks($1,null,5)", [vector]), /does not exist/);
  } finally { await db.close(); }
});
