-- Link a verified Google identity to an application account. Password login
-- remains available for existing accounts; OAuth-only accounts use a marker
-- that can never pass the scrypt password verifier.
alter table public.app_users add column google_subject text unique;
