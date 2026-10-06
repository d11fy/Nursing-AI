-- Security hardening for accounts that had multiple legacy sessions before
-- device binding was introduced. Keep only the newest valid session.
delete from public.app_sessions
where expires_at <= now() or revoked_at is not null;

with ranked_sessions as (
  select token_hash,
         row_number() over (
           partition by user_id
           order by created_at desc, expires_at desc, token_hash desc
         ) as session_rank
  from public.app_sessions
)
delete from public.app_sessions
where token_hash in (
  select token_hash from ranked_sessions where session_rank > 1
);

-- Defense in depth: application locking already serializes login, while this
-- database constraint makes two active session rows structurally impossible.
create unique index if not exists app_sessions_one_active_user_idx
  on public.app_sessions(user_id)
  where revoked_at is null;
