# Subscriptions and manual payments

## Source of truth

`lib/subscriptions/service.ts` is the only subscription/entitlement decision point. Server routes call `canUseFeature`, `consumeUsage`, `refundUsage`, or `getRemainingUsage`; UI state is never treated as authorization.

Usage counters are atomic PostgreSQL upserts scoped by local day (`Asia/Hebron`), trial, or subscription period. AI usage is reserved before the provider call. Early failures and cache hits release the reservation.

## Plan change policy (V1)

Every payment and subscription stores immutable name, price, currency, and duration snapshots. Historical records therefore never change when a plan is edited. Entitlements deliberately read the current `plan_entitlements` configuration, so an admin limit/feature change applies to existing and new subscribers. A future version can add entitlement snapshots if grandfathered benefits are required.

## Trial

New profiles receive one configurable trial. The existing random HttpOnly device token is hashed and claimed by the trial; no browser or hardware fingerprinting is used. Reusing a claimed device for a new account expires the second trial. Admin resets are explicit and audited.

## Payments and receipts

Receipts are stored in the private `stored_files` table under `payment-receipts`, limited to JPG/PNG/PDF and 5 MB. RLS limits access to the owner and administrators. Approval locks the payment row and links it to one unique subscription, making double approval idempotent. Renewal starts at the latest paid expiry when time remains.

## Email and scheduled work

SMTP credentials managed in Admin are encrypted with AES-256-GCM using `AUTH_SECRET`; the password is never returned to the UI. Templates are rendered into immutable queue snapshots. `POST /api/cron/subscriptions` activates/expires subscriptions, queues reminders, and retries email. Protect it with `Authorization: Bearer $CRON_SECRET` and schedule it at least daily in the deployment platform.

## Deployment

1. Back up PostgreSQL using the existing project procedure.
2. Set a strong `AUTH_SECRET` and `CRON_SECRET`.
3. Run `npm run db:migrate` with the migration role.
4. Configure payment methods, SMTP, and plan entitlements in Admin.
5. Schedule the protected cron endpoint.
