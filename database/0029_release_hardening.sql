-- Release hardening: quota reservations, admin usage adjustments, email leases.

-- One row per metered operation. subscription_usage remains the counter the
-- entitlement service enforces; a reservation records what was added to it so
-- a failed operation can release exactly that amount, once.
create table public.usage_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  feature_key text not null,
  scope_type text not null check (scope_type in ('daily','trial','subscription')),
  scope_key text not null,
  amount integer not null check (amount > 0),
  status text not null default 'reserved' check (status in ('reserved','committed','released')),
  idempotency_key text check (idempotency_key is null or length(idempotency_key) between 8 and 160),
  result_ref jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index usage_reservations_idempotency_idx
  on public.usage_reservations(user_id, feature_key, idempotency_key) where idempotency_key is not null;
create index usage_reservations_user_idx on public.usage_reservations(user_id, created_at desc);
alter table public.usage_reservations enable row level security;
alter table public.usage_reservations force row level security;
create policy usage_reservations_owner on public.usage_reservations for all
  using (user_id = ai_user_id() or ai_is_admin() or ai_is_worker())
  with check (user_id = ai_user_id() or ai_is_admin() or ai_is_worker());

-- Trial quiz generation was previously unmetered. Admins can change this value.
insert into public.settings(key, value) values ('trial_quiz_total', '3') on conflict (key) do nothing;

-- Lease-based email delivery: a claimed message that is not finished before
-- its lease expires becomes claimable again instead of staying in "sending".
alter table public.email_logs
  add column if not exists claim_token uuid,
  add column if not exists claimed_at timestamptz,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists next_retry_at timestamptz,
  add column if not exists last_attempt_at timestamptz;
create index if not exists email_logs_claimable_idx on public.email_logs(status, next_retry_at, scheduled_at);

-- Android 1.2.0: first production build of the native app line, signed with
-- the original release key (certificate SHA-256 abe0a4ab...2fc8) so it
-- updates installed 1.0.x apps in place. The checksum is enforced by the
-- download route. A newer version configured by an admin is not overwritten.
insert into public.settings(key,value)
values ('mobile_app_version', '{
  "latest_version":"1.2.0",
  "latest_version_code":5,
  "apk_url":"/api/download/apk",
  "sha256":"ec87750458c991b9a64b950418dd61daeb12a7cdc58224ff3b5669fe07724974",
  "release_notes":"تطبيق Nursing AI الجديد بواجهة مصممة للهاتف: المكتبة وحزم الدراسة والبطاقات والاختبارات والأخطاء والتقدم، مع وضع فاتح وداكن، وتحسينات في الوصول وقراءة النص المختلط، وشاشة واضحة عند انقطاع الإنترنت.",
  "force_update":false,
  "published_at":"2026-10-09T08:00:00.000Z",
  "preview":{"enabled":false,"version":"1.1.1","apk_url":"/downloads/nursing-ai-preview-v1.1.1.apk","notes":"نسخة المعاينة السابقة للمختبرين."}
}'::jsonb)
on conflict(key) do update
set value = settings.value || excluded.value,
    updated_at = now()
where coalesce((settings.value->>'latest_version_code')::int,0) < 5;
