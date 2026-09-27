# Nursing AI

منصة تعليمية بالذكاء الاصطناعي لطلاب التمريض. الطالب يسأل أو يرفع صورة (كتاب، محاضرة،
PowerPoint، ملاحظات، سؤال جامعي) ويحصل على شرح مبسط ومنظم، مبني أولًا على قاعدة معرفة
تمريضية خاصة (RAG) قبل اللجوء للمعرفة العامة للنموذج. **هذه منصة تعليمية فقط، وليست أداة
لتشخيص المرضى أو اتخاذ قرارات علاجية.**

## Stack

- **Frontend:** Next.js 16 (App Router), TypeScript, Tailwind CSS v4, shadcn/ui (Base UI), Lucide Icons.
- **Backend:** Next.js Server Actions + Route Handlers.
- **Database:** Supabase PostgreSQL + pgvector.
- **Auth:** Supabase Auth.
- **Storage:** Supabase Storage (private buckets, signed URLs).
- **AI:** OpenAI (chat, vision, embeddings) behind a provider-agnostic interface (`lib/ai/`) — swapping to Gemini/Claude later only means adding `lib/ai/providers/<name>.ts`.

## 1. Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project
- An [OpenAI](https://platform.openai.com) API key

## 2. Supabase setup

1. Create a new Supabase project.
2. In **SQL Editor**, run the migration in order:
   - [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) — schema, RLS policies, storage buckets, and helper functions (requires the `vector` extension, enabled automatically by the migration).
   - [`supabase/seed.sql`](supabase/seed.sql) — the default subject list (safe to re-run).
3. In **Authentication → Providers**, keep Email enabled. Decide whether to require email confirmation (the register flow works either way).
4. Copy your **Project URL**, **anon public key**, and **service_role key** from **Project Settings → API**.

> The two Storage buckets (`chat-images`, `knowledge-documents`) are created by the migration itself and are **private** — the app always serves files through short-lived signed URLs, never public links.

## 3. Environment variables

```bash
cp .env.example .env.local
```

Fill in:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
```

`SUPABASE_SERVICE_ROLE_KEY` and `OPENAI_API_KEY` are server-only and are never sent to the browser — only imported from Server Components, Server Actions, and Route Handlers.

## 4. Install & run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## 5. Creating the first admin account

There's no public admin sign-up (by design). To promote a normal registered account:

1. Register a normal account at `/register`.
2. In Supabase **SQL Editor**, run:
   ```sql
   update public.profiles set role = 'admin' where email = 'you@example.com';
   ```
3. Log out and back in, then visit `/admin`.

For local testing you can instead seed one admin + 5 demo students in one shot (random passwords, printed to the terminal only — never written to disk or git):

```bash
node --env-file=.env.local scripts/seed-users.mjs
```

## 6. Uploading the knowledge base (RAG)

Go to `/admin/knowledge` → **رفع ملف**:

1. Pick a title, a subject, and a source type (book/lecture/notes/questions/reference).
2. Upload a `.pdf`, `.txt`, or `.docx` file.
3. The pipeline runs synchronously on upload: extract text → chunk (~1200 chars, page-aware for PDFs) → embed (`text-embedding-3-small`) → store in `document_chunks` with metadata (`document_id`, `subject_id`, `page_number`, `chunk_index`).
4. Status flips to **جاهز** when done, or **فشل** with an error message if extraction failed. Use **إعادة المعالجة** to retry.

When a student asks a question, `lib/ai/rag.ts` embeds the question, calls the `match_document_chunks` pgvector RPC (cosine similarity, threshold 0.72), and passes the top matches to the model as prioritized context — the full document is never sent to the model.

> PDF/DOCX/TXT only in this MVP; PowerPoint ingestion is intentionally deferred (per spec).

## 7. AI provider architecture

```
lib/ai/provider.ts          — the AIProvider interface (generateText, generateStream,
                               generateVisionResponse, createEmbedding(s), calculateCost)
lib/ai/providers/openai.ts  — the OpenAI implementation
lib/ai/index.ts             — getAIProvider() factory, switched by AI_PROVIDER env var
lib/ai/system-prompt.ts     — the Nursing AI system prompt + knowledge-context builder
lib/ai/rag.ts               — chunking + pgvector search
```

To add Gemini/Claude later: implement `AIProvider` in a new file under `lib/ai/providers/`,
add a `case` in `getAIProvider()`, no call-site changes needed.

## 8. Usage limits & rate limiting

Both are configurable from `/admin/settings` (backed by the `settings` table, no redeploy needed):

- **Daily limit** (`free_daily_limit`, default 20): computed live from `usage_logs` rows created since midnight — not a cron counter, so it can't drift out of sync.
- **Rate limit** (`rate_limit_seconds`, default 3): enforced by checking the timestamp of the user's most recent `usage_logs` row, which works correctly across serverless instances (no in-memory state).

## 9. Security

- Row Level Security is enabled on every table. Students can only read/write their own profile, conversations, messages, and feedback. Admins bypass via an `is_admin()` helper.
- Storage objects are scoped per-user by folder path (`chat-images/<user_id>/...`) and enforced by storage RLS policies.
- All OpenAI calls happen server-side only; no API key ever reaches the client.
- `proxy.ts` (Next.js 16's replacement for `middleware.ts`) refreshes the Supabase session on every request and redirects unauthenticated users away from `/dashboard` and `/admin`, and non-admins away from `/admin`. Admin API routes additionally return a clean 403 for non-admins (see `lib/auth.ts#getAdminProfileOrNull`).

## 10. Project structure

```
app/
  (auth)/            — /login, /register, /forgot-password
  dashboard/         — student area (chat, history, subjects, profile)
  admin/             — admin area (students, knowledge base, subjects, usage, settings)
  api/               — chat streaming, image/knowledge upload, feedback
components/
  auth/, chat/, dashboard/, admin/, landing/, ui/ (shadcn)
lib/
  ai/                — provider-agnostic AI layer + RAG
  supabase/          — browser/server/service-role clients + proxy session helper
  validations/       — zod schemas
  auth.ts, usage.ts, storage.ts, knowledge.ts
supabase/
  migrations/0001_init.sql, seed.sql
```

## 11. Deployment

### Building on a shared VPS

`npm run build` uses Webpack with Next.js memory optimizations and one
page-generation worker. PDF/DOCX parsers stay external to the server bundle.
TypeScript checks remain enabled. `npm run build:turbo` is available for machines
with more resources. These settings reduce build concurrency; they do not cap
total build memory or guarantee that a crowded 4 GB VPS can build safely.

In Dokploy, use `npm run build` as the build command and `npm run start` as the
start command, with container port `3000`. Do not run `npm run dev` in production.
If the VPS still runs out of memory, build the deployment image on another
machine/CI and deploy that image, or provide more memory for the build.

The public Supabase URL and anon key must be configured **before building**;
Next.js embeds `NEXT_PUBLIC_*` values in browser assets. Server-only keys must
also be available at runtime. A self-hosted Supabase installation needs its own
reachable API gateway URL, not a `placeholder.supabase.co` URL or its Studio URL.
The schema migration and seed still need to be applied to that database.

Any Next.js host works (Vercel, a Node server, Docker). Set the same environment variables
from `.env.example` in your host's dashboard. No build-time secrets are required beyond
`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` (both public by design).

> Knowledge-base uploads (up to 50MB) and the synchronous ingestion pipeline run inside a
> single request. Default serverless function limits on some platforms (e.g. Vercel Hobby)
> cap both request body size and execution time below that — a self-hosted Node server or a
> platform with configurable function limits is recommended for large PDF uploads.

## 12. What's intentionally out of scope for this MVP

Payments/subscriptions, a full exam/flashcards system, student-to-student chat, a teacher
platform, a native mobile app, and gamification — per the product brief, this MVP focuses on
a working golden path: register → chat → upload image → RAG-grounded answer → saved
conversation, plus an admin able to manage the knowledge base, students, and usage/cost.
