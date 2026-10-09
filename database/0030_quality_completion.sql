-- Additive migration: preserve existing accounts, study data and audit history.
alter table usage_reservations add column lease_expires_at timestamptz,
  add column work_started_at timestamptz;
-- Legacy rows cannot be safely refunded: some were already delivered.
update usage_reservations set status='committed' where status='reserved';
create index usage_reservations_lease_idx on usage_reservations(lease_expires_at) where status='reserved';

alter table student_flashcard_progress add column next_review_at timestamptz,
  add column interval_days integer not null default 0;
create table flashcard_review_receipts (
  user_id uuid not null references app_users(id) on delete cascade,
  event_id uuid not null, flashcard_id uuid not null references study_pack_flashcards(id) on delete cascade,
  result jsonb not null, created_at timestamptz not null default now(), primary key(user_id,event_id)
);
alter table flashcard_review_receipts enable row level security;
alter table flashcard_review_receipts force row level security;
create policy review_owner on flashcard_review_receipts for all
  using(user_id=ai_user_id() or ai_is_worker()) with check(user_id=ai_user_id() or ai_is_worker());

create table support_tickets (
 id uuid primary key default gen_random_uuid(), token_hash text not null unique,
 email text not null, subject text not null, message text not null,
 status text not null default 'open' check(status in('open','answered','closed')),
 reply text, replied_by uuid references app_users(id) on delete set null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table support_tickets enable row level security;
alter table support_tickets force row level security;
create policy support_staff on support_tickets for all using(ai_is_admin() or ai_is_worker()) with check(ai_is_admin() or ai_is_worker());

create table admin_second_factors (
 user_id uuid primary key references app_users(id) on delete cascade,
 secret_ciphertext text not null, enabled boolean not null default false,
 last_counter bigint not null default -1, recovery_hashes jsonb not null default '[]',
 created_at timestamptz not null default now()
);
alter table app_sessions add column mfa_verified_at timestamptz;
create table device_transfers (
 token_hash text primary key, user_id uuid not null references app_users(id) on delete cascade,
 expires_at timestamptz not null, created_at timestamptz not null default now()
);

insert into email_templates(template_key,name,subject,html_body,text_body)
values('device_transfer','نقل الجهاز','Nursing AI — تأكيد نقل الجهاز',
'<div dir="rtl"><p>أدخل الرمز التالي في شاشة نقل الجهاز داخل التطبيق أو المنصة على جهازك الجديد. ينتهي خلال 15 دقيقة ولا تشاركه مع أحد.</p><p dir="ltr">{{transfer_code}}</p><p>إذا لم تطلب النقل فتجاهل الرسالة؛ جهازك الحالي لن يتأثر.</p></div>',
'رمز نقل الجهاز (15 دقيقة): {{transfer_code}}. أدخله على الجهاز الجديد فقط. إذا لم تطلب النقل فتجاهل الرسالة.');
