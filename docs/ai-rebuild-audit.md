# Nursing AI architecture audit — 2026-09-30

Baseline: `ff7c2857725e27dd97f69caddeb73647e0dbfae4`. Working tree was clean.

## Preserved data and dependencies

Authentication uses app_users, app_sessions, password_resets and profiles. Academic access uses academic_years, subject_academic_years and subjects. Conversations/messages and existing dashboards remain. Originals are database bytea values in stored_files and knowledge_document_chunks; copying the repository does **not** back these up.

documents/document_chunks are referenced by exams, question_sources and summary_knowledge_points. lectures/lecture_chunks are private and referenced by generated_study_content and explicit-consent contributions. Old tables must survive the rollout; no applied migration may be edited. Existing exam answers and verified practice grading must be preserved.

## Old execution paths

AI router imports OpenAI, Gemini, Groq and Cloudflare. OpenAI silently falls back to gpt-4o-mini and uses Chat Completions. Chat classifies scope, retrieves array embeddings, generates/reviews JSON evidence paragraphs, then returns the entire answer at once. No-source refusal blocks general knowledge. Memory summary is truncated recent text. Student lecture reprocessing deletes chunks before embedding finishes. Provider settings/status APIs expose the obsolete router.

## Backup and rollout constraints

Before edits, repository.bundle, source-before-ai-rebuild.zip and a private copy of .env.local were saved outside the checkout in `D:\مشااريع برمحيه\narsing-ai-backups\20260930-ai-rebuild`.

DATABASE_URL is absent in this environment. There is no connected production data backup and no real curriculum available locally. `db:backup` must succeed against the deployment database before migration/cutover. New migration is additive, preserves legacy indexes for rollback and does not import old AI answers into learning memory. Production activation requires a real-curriculum evaluation artifact. Never report the quality targets achieved from synthetic tests.
