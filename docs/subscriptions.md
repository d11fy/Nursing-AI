# Subscriptions and manual payments

## Source of truth

`lib/subscriptions/service.ts` is the only subscription/entitlement decision point. UI state is never treated as authorization.

Every paid operation follows: check entitlement → `reserveUsage` (atomic) → do the work → `commitUsage`, or `releaseUsage` when it fails before the cost is incurred. Counters (`subscription_usage`) are conditional PostgreSQL upserts scoped by local day (`Asia/Hebron`), trial, or subscription period, so concurrent requests cannot exceed a limit. Each reservation is a row in `usage_reservations`; release returns exactly its amount, once.

| Operation | Counter | Charged when | Released when |
|---|---|---|---|
| AI tutor question | `ai_questions_daily` | before the provider call | the provider never started |
| Chat image | `images_limit` | before storage | storage fails |
| File upload (subject page and chat) | `files_limit` | before storage, via `lib/lectures/student-upload.ts` | storage or record creation fails; once processing is queued the unit stays used |
| Study pack (summary, key points, flashcards) | `study_pack_limit` | first AI generation for a pack; cached content is free, later sections of the same pack reuse the unit, an explicit regenerate is charged | generation fails |
| Practice exam, study-pack quiz, targeted review | `quiz_limit` | before questions are selected or generated | generation fails |

Requests with an `Idempotency-Key` header (8–128 of `A-Za-z0-9:_-`) are charged once: a repeat returns the original result (same lecture, attempt or quiz) or 409 while the first is still running. Re-sending a file that already exists in the same subject reuses it without a charge. Content is checked by file signature before any quota or storage work.

Trial quizzes are limited by the `trial_quiz_total` setting (default 3). A plan without a numeric `quiz_limit` does not allow generating quizzes.

## Admin usage reset

Admin → Students → the gauge button resets the counter the entitlement service enforces, for one feature or all, in the student's current period. A reason is required. `usage_logs` and `usage_reservations` are kept; the previous and new values, feature, scope, admin and time are written to `admin_audit_logs` (`USAGE_ADJUSTED`) in the same transaction.

## Plan change policy (V1)

Every payment and subscription stores immutable name, price, currency, and duration snapshots. Historical records therefore never change when a plan is edited. Entitlements deliberately read the current `plan_entitlements` configuration, so an admin limit/feature change applies to existing and new subscribers. A future version can add entitlement snapshots if grandfathered benefits are required.

## Trial

New profiles receive one configurable trial. The existing random HttpOnly device token is hashed and claimed by the trial; no browser or hardware fingerprinting is used. Reusing a claimed device for a new account expires the second trial. Admin resets are explicit and audited.

## Payments and receipts

Receipts are stored in the private `stored_files` table under `payment-receipts`, limited to JPG/PNG/PDF (checked by file signature) and 5 MB. RLS and an explicit owner check limit access to the owner and administrators. Approval locks the payment row and links it to one unique subscription, making double approval idempotent. Renewal starts at the latest paid expiry when time remains.

## Email and scheduled work

SMTP credentials managed in Admin are encrypted with AES-256-GCM using `AUTH_SECRET`; the password is never returned to the UI. Templates are rendered into immutable queue snapshots. Delivery is lease-based: a claimed message gets a 2-minute lease and a fresh claim token; if the worker dies, the message becomes claimable again after the lease, and only the current token holder can record the outcome. Failures retry with exponential backoff (1, 2, 4… minutes, capped at 6 hours) for up to 6 attempts, then stay failed until an admin uses Retry. Messages carry a stable Message-ID so a duplicate after a crash can be dropped by mail servers. The app server processes the queue every minute; `POST /api/cron/subscriptions` activates/expires subscriptions, queues reminders, and also processes email. Protect it with `Authorization: Bearer $CRON_SECRET` and schedule it at least daily in the deployment platform.

## Deployment

1. Back up PostgreSQL using the existing project procedure.
2. Set a strong `AUTH_SECRET` and `CRON_SECRET`.
3. Run `npm run db:migrate` with the migration role.
4. Configure payment methods, SMTP, and plan entitlements in Admin.
5. Schedule the protected cron endpoint.
