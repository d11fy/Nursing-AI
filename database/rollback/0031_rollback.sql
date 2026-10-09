-- MANUAL rollback of migration 0031. It is never executed by `npm run db:migrate`
-- (the runner only reads database/NNNN_*.sql).
--
-- Before running it:
--   1. Take and verify a database backup.
--   2. Deploy an application build that does not use these objects (the build before
--      commit 47c12d3). The build that includes this migration reads and writes them,
--      the previous build ignores them, so migration 0031 itself is safe to leave in place.
--
-- What is lost: the generation history (chat_generations), the stored book outlines,
-- the chapter labels on chunks and each conversation's chapter position. All of it can be
-- rebuilt: `npm run knowledge:restructure -- --run --force` after re-applying 0031.
-- What is kept: every message, conversation, document, chunk and embedding.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/rollback/0031_rollback.sql
begin;
set local lock_timeout = '15s';

drop table if exists chat_generations;

drop index if exists messages_generation_unique;
alter table messages drop column if exists generation_id;

alter table conversation_summaries
  drop column if exists current_chapter_index,
  drop column if exists current_chapter_number,
  drop column if exists current_chapter_title,
  drop column if exists current_section_title,
  drop column if exists current_part,
  drop column if exists total_parts,
  drop column if exists current_position,
  drop column if exists study_mode,
  drop column if exists study_updated_at;

drop index if exists knowledge_chunks_chapter;
alter table knowledge_chunks
  drop column if exists chapter_index,
  drop column if exists chapter_number,
  drop column if exists chapter_title,
  drop column if exists section_title,
  drop column if exists subsection_title,
  drop column if exists slide_number;

alter table knowledge_documents
  drop column if exists outline_json,
  drop column if exists structure_version,
  drop column if exists structure_confidence,
  drop column if exists structure_method,
  drop column if exists chapter_count,
  drop column if exists section_count;

-- Lets `npm run db:migrate` apply 0031 again later.
delete from app_migrations where version = '0031';
commit;
