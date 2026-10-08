-- Short-lived, single-use OAuth handoffs. Session credentials are encrypted.
create table public.mobile_auth_handoffs (
 code_hash text primary key,
 challenge text not null,
 session_ciphertext text not null,
 expires_at timestamptz not null
);
create index mobile_auth_handoffs_expiry on public.mobile_auth_handoffs(expires_at);
revoke all on public.mobile_auth_handoffs from public;
