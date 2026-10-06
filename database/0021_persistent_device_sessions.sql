-- Persistent, server-revocable sessions bound to a non-invasive random device id.
-- Existing sessions remain readable and are claimed by the first returning device.
alter table public.app_sessions
  add column if not exists device_hash text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists last_seen_at timestamptz not null default now(),
  add column if not exists revoked_at timestamptz;

create index if not exists app_sessions_active_user_idx
  on public.app_sessions(user_id, expires_at)
  where revoked_at is null;

create index if not exists app_sessions_device_idx
  on public.app_sessions(user_id, device_hash)
  where revoked_at is null;
