-- Administrators may keep one active session per device. Students remain
-- structurally limited to one active session across all devices.
alter table public.app_sessions
  add column if not exists is_admin_session boolean not null default false;

update public.app_sessions s
set is_admin_session = true
from public.profiles p
where p.user_id = s.user_id and p.role = 'admin';

drop index if exists public.app_sessions_one_active_user_idx;

-- Prevent trusted application code (or a future caller) from marking a
-- student session as administrative merely by supplying a boolean.
create or replace function public.set_app_session_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.is_admin_session := exists (
    select 1 from profiles p
    where p.user_id = new.user_id and p.role = 'admin'
  );
  return new;
end;
$$;

drop trigger if exists set_app_session_role on public.app_sessions;
create trigger set_app_session_role
before insert or update of user_id, is_admin_session on public.app_sessions
for each row execute function public.set_app_session_role();

create unique index app_sessions_one_active_student_idx
  on public.app_sessions(user_id)
  where revoked_at is null and not is_admin_session;
