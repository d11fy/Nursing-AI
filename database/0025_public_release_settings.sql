-- Public release configuration used by the website and the bundled Android app.
-- Contact fields remain empty until an administrator publishes real support details.
insert into public.settings(key,value) values
  ('public_site', '{"contact_email":"","whatsapp":"","refund_policy":""}'::jsonb),
  ('mobile_app_version', '{
    "latest_version":"1.0.0",
    "latest_version_code":1,
    "apk_url":"/api/download/apk",
    "file_size":"1.17 MB",
    "release_notes":"الإصدار الرسمي الأول من تطبيق Nursing AI.",
    "force_update":false,
    "published_at":"2026-10-07T12:00:00.000Z"
  }'::jsonb)
on conflict(key) do nothing;
