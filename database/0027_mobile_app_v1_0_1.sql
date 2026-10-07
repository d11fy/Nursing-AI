-- Publish the corrected Android build without overwriting a newer version an
-- administrator may already have configured.
insert into public.settings(key,value)
values ('mobile_app_version', '{
  "latest_version":"1.0.1",
  "latest_version_code":2,
  "apk_url":"/api/download/apk",
  "file_size":"1.18 MB",
  "release_notes":"تحسين واجهة أندرويد وإظهار صندوق المحادثة وإصلاح المكتبة وحزم الدراسة.",
  "force_update":false,
  "published_at":"2026-10-07T18:20:00.000Z"
}'::jsonb)
on conflict(key) do update
set value = settings.value || excluded.value,
    updated_at = now()
where coalesce((settings.value->>'latest_version_code')::int,0) < 2;
