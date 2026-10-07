-- Production subscriptions, trials, manual payments, usage counters and queued email.
-- Additive only: no student content is deleted when access expires.

create table public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null,
  price numeric(12,2) not null check (price >= 0),
  currency text not null default 'ILS' check (currency ~ '^[A-Z]{3,8}$'),
  duration_days integer not null check (duration_days > 0),
  description text not null default '',
  sort_order integer not null default 0,
  active boolean not null default true,
  recommended boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.plan_entitlements (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.subscription_plans(id) on delete cascade,
  feature_key text not null check (feature_key ~ '^[a-z][a-z0-9_]{1,80}$'),
  value jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(plan_id, feature_key)
);

create table public.user_trials (
  user_id uuid primary key references public.app_users(id) on delete cascade,
  email_hash text not null unique,
  device_hash text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reset_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create unique index user_trials_device_once_idx on public.user_trials(device_hash) where device_hash is not null;

create table public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null,
  account_holder text,
  account_number text,
  iban text,
  wallet_number text,
  instructions text not null default '',
  icon_url text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create sequence public.payment_reference_seq start 1;
create table public.payment_requests (
  id uuid primary key default gen_random_uuid(),
  payment_reference text not null unique,
  user_id uuid not null references public.app_users(id) on delete cascade,
  plan_id uuid references public.subscription_plans(id) on delete set null,
  payment_method_id uuid references public.payment_methods(id) on delete set null,
  amount numeric(12,2) not null check (amount >= 0),
  currency text not null,
  plan_name_snapshot text not null,
  price_snapshot numeric(12,2) not null,
  duration_days_snapshot integer not null check (duration_days_snapshot > 0),
  payment_method_snapshot jsonb not null,
  receipt_path text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  rejection_reason text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.app_users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create index payment_requests_user_idx on public.payment_requests(user_id, created_at desc);
create index payment_requests_status_idx on public.payment_requests(status, created_at);

create table public.user_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  plan_id uuid references public.subscription_plans(id) on delete set null,
  payment_request_id uuid unique references public.payment_requests(id) on delete set null,
  kind text not null default 'paid' check (kind in ('trial','paid','manual','adjustment')),
  status text not null check (status in ('trial','scheduled','active','expired','cancelled','revoked')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  plan_name_snapshot text not null,
  amount_paid numeric(12,2) not null default 0,
  currency text not null default 'ILS',
  duration_days_snapshot integer not null,
  created_by uuid references public.app_users(id) on delete set null,
  approved_by uuid references public.app_users(id) on delete set null,
  notes text,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index user_subscriptions_access_idx on public.user_subscriptions(user_id, starts_at, ends_at);

create table public.subscription_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  feature_key text not null,
  scope_type text not null check (scope_type in ('daily','trial','subscription')),
  scope_key text not null,
  used integer not null default 0 check (used >= 0),
  updated_at timestamptz not null default now(),
  unique(user_id, feature_key, scope_type, scope_key)
);
create index subscription_usage_user_idx on public.subscription_usage(user_id, scope_type, scope_key);

alter table public.stored_files drop constraint if exists stored_files_bucket_check;
alter table public.stored_files add constraint stored_files_bucket_check
  check (bucket in ('chat-images','knowledge-documents','lecture-files','payment-receipts'));
alter table public.stored_files drop constraint if exists stored_files_content_check;
alter table public.stored_files add constraint stored_files_content_check check (
  (bucket = 'chat-images' and octet_length(content) <= 10485760)
  or (bucket = 'lecture-files' and octet_length(content) <= 62914560)
  or (bucket = 'knowledge-documents')
  or (bucket = 'payment-receipts' and octet_length(content) <= 5242880)
);

create table public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  admin_id uuid references public.app_users(id) on delete set null,
  target_user_id uuid references public.app_users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index admin_audit_logs_created_idx on public.admin_audit_logs(created_at desc);

create table public.email_settings (
  singleton boolean primary key default true check (singleton),
  host text,
  port integer not null default 587 check (port between 1 and 65535),
  username text,
  password_ciphertext text,
  encryption text not null default 'starttls' check (encryption in ('none','starttls','tls')),
  from_name text not null default 'Nursing AI',
  from_email text,
  updated_by uuid references public.app_users(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.email_settings(singleton) values(true) on conflict do nothing;

create table public.email_templates (
  template_key text primary key,
  name text not null,
  subject text not null,
  html_body text not null,
  text_body text not null,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.email_logs (
  id uuid primary key default gen_random_uuid(),
  recipient text not null,
  template_key text references public.email_templates(template_key) on delete set null,
  subject_snapshot text not null,
  html_snapshot text not null,
  text_snapshot text not null,
  status text not null default 'pending' check (status in ('pending','sending','sent','failed')),
  retry_count integer not null default 0,
  last_error text,
  scheduled_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  updated_at timestamptz not null default now()
);
create index email_logs_queue_idx on public.email_logs(status, scheduled_at);

create trigger subscription_plans_updated_at before update on public.subscription_plans for each row execute function public.set_updated_at();
create trigger plan_entitlements_updated_at before update on public.plan_entitlements for each row execute function public.set_updated_at();
create trigger user_trials_updated_at before update on public.user_trials for each row execute function public.set_updated_at();
create trigger payment_methods_updated_at before update on public.payment_methods for each row execute function public.set_updated_at();
create trigger payment_requests_updated_at before update on public.payment_requests for each row execute function public.set_updated_at();
create trigger user_subscriptions_updated_at before update on public.user_subscriptions for each row execute function public.set_updated_at();
create trigger email_logs_updated_at before update on public.email_logs for each row execute function public.set_updated_at();

insert into public.subscription_plans(slug,name,price,currency,duration_days,description,sort_order,recommended) values
 ('one-month','شهر واحد',15,'ILS',30,'وصول كامل بحدود استخدام أساسية',10,false),
 ('three-months','3 أشهر',35,'ILS',90,'وصول كامل بحدود استخدام أعلى',20,true),
 ('one-year','سنة كاملة',75,'ILS',365,'أعلى حدود استخدام وكل المزايا المميزة',30,false);

insert into public.plan_entitlements(plan_id,feature_key,value)
select p.id, e.key, e.value from public.subscription_plans p cross join lateral (
 values
 ('ai_questions_daily', to_jsonb(case p.slug when 'one-month' then 100 when 'three-months' then 200 else 400 end)),
 ('images_limit', to_jsonb(case p.slug when 'one-month' then 50 when 'three-months' then 120 else 300 end)),
 ('files_limit', to_jsonb(case p.slug when 'one-month' then 10 when 'three-months' then 30 else 100 end)),
 ('study_pack_enabled','true'::jsonb),
 ('study_pack_limit',to_jsonb(case p.slug when 'one-month' then 10 when 'three-months' then 35 else 120 end)),
 ('quiz_enabled','true'::jsonb), ('quiz_limit',to_jsonb(case p.slug when 'one-month' then 20 when 'three-months' then 60 else 200 end)),
 ('flashcards_enabled','true'::jsonb), ('library_enabled','true'::jsonb),
 ('mistakes_enabled','true'::jsonb), ('weak_topics_enabled','true'::jsonb),
 ('progress_enabled','true'::jsonb), ('targeted_review_enabled',to_jsonb(p.slug <> 'one-month'))
) as e(key,value);

insert into public.settings(key,value) values
 ('trial_duration_days','3'), ('trial_ai_questions_daily','10'), ('trial_images_total','3'),
 ('trial_files_total','1'), ('trial_study_pack_total','1'),
 ('payment_grace_enabled','false'), ('payment_grace_hours','24'),
 ('subscription_reminder_days','[3,1,0]'), ('trial_reminder_days','[1,0]')
on conflict(key) do nothing;

insert into public.email_templates(template_key,name,subject,html_body,text_body) values
 ('welcome','الترحيب','مرحبًا بك في Nursing AI','<div dir="rtl"><h2>مرحبًا {{student_name}}</h2><p>أهلًا بك في Nursing AI.</p></div>','مرحبًا {{student_name}}، أهلًا بك في Nursing AI.'),
 ('payment_received','استلام الدفع','استلمنا طلب الدفع {{payment_reference}}','<div dir="rtl"><p>استلمنا طلب الدفع {{payment_reference}} للباقة {{plan_name}} بقيمة {{amount}} {{currency}}.</p></div>','استلمنا طلب الدفع {{payment_reference}}.'),
 ('payment_approved','قبول الدفع','تم قبول دفعتك {{payment_reference}}','<div dir="rtl"><p>تم تفعيل {{plan_name}} حتى {{expiry_date}}.</p></div>','تم تفعيل {{plan_name}} حتى {{expiry_date}}.'),
 ('payment_rejected','رفض الدفع','تعذر قبول دفعتك {{payment_reference}}','<div dir="rtl"><p>تم رفض الطلب. السبب: {{rejection_reason}}</p></div>','تم رفض الطلب. السبب: {{rejection_reason}}'),
 ('trial_ending','قرب انتهاء التجربة','تنتهي تجربتك قريبًا','<div dir="rtl"><p>بقي {{days_remaining}} يوم على انتهاء التجربة.</p></div>','بقي {{days_remaining}} يوم على انتهاء التجربة.'),
 ('trial_expired','انتهاء التجربة','انتهت فترتك التجريبية','<div dir="rtl"><p>انتهت تجربتك، وبياناتك ما زالت محفوظة.</p></div>','انتهت تجربتك، وبياناتك ما زالت محفوظة.'),
 ('subscription_expiring','قرب انتهاء الاشتراك','اشتراكك ينتهي قريبًا','<div dir="rtl"><p>بقي {{days_remaining}} يوم على انتهاء {{plan_name}}.</p></div>','بقي {{days_remaining}} يوم على انتهاء {{plan_name}}.'),
 ('subscription_expired','انتهاء الاشتراك','انتهى اشتراكك','<div dir="rtl"><p>انتهى اشتراكك، وبياناتك ما زالت محفوظة.</p></div>','انتهى اشتراكك، وبياناتك ما زالت محفوظة.'),
 ('subscription_renewed','تجديد الاشتراك','تم تجديد اشتراكك','<div dir="rtl"><p>تم تجديد {{plan_name}} حتى {{expiry_date}}.</p></div>','تم تجديد {{plan_name}} حتى {{expiry_date}}.'),
 ('password_reset','إعادة كلمة المرور','إعادة تعيين كلمة المرور','<div dir="rtl"><p><a href="{{reset_url}}">إعادة تعيين كلمة المرور</a></p><p>الرابط صالح لمدة 30 دقيقة.</p></div>','رابط إعادة تعيين كلمة المرور (صالح 30 دقيقة): {{reset_url}}'),
 ('device_reset','إعادة الجهاز','تمت إعادة تعيين الجهاز','<div dir="rtl"><p>يمكنك تسجيل الدخول من جهازك الجديد الآن.</p></div>','يمكنك تسجيل الدخول من جهازك الجديد الآن.')
on conflict(template_key) do nothing;

-- Existing accounts receive only the remainder of a trial measured from original registration.
insert into public.user_trials(user_id,email_hash,starts_at,ends_at)
select p.user_id, md5(lower(p.email)), p.created_at, p.created_at + interval '3 days' from public.profiles p
on conflict(user_id) do nothing;
insert into public.user_subscriptions(user_id,kind,status,starts_at,ends_at,plan_name_snapshot,duration_days_snapshot,notes)
select t.user_id,'trial',case when t.ends_at>now() then 'trial' else 'expired' end,t.starts_at,t.ends_at,'الفترة التجريبية',3,'تم إنشاؤها تلقائيًا'
from public.user_trials t where not exists(select 1 from public.user_subscriptions s where s.user_id=t.user_id and s.kind='trial');

create or replace function public.create_trial_for_profile() returns trigger language plpgsql security definer set search_path=public as $$
declare days_count integer;
begin
  select coalesce((value #>> '{}')::integer,3) into days_count from settings where key='trial_duration_days';
  insert into user_trials(user_id,email_hash,starts_at,ends_at)
    values(new.user_id,md5(lower(new.email)),now(),now()+make_interval(days=>days_count));
  insert into user_subscriptions(user_id,kind,status,starts_at,ends_at,plan_name_snapshot,duration_days_snapshot,notes)
    values(new.user_id,'trial','trial',now(),now()+make_interval(days=>days_count),'الفترة التجريبية',days_count,'تم إنشاؤها تلقائيًا');
  return new;
end $$;
create trigger create_profile_trial after insert on public.profiles for each row execute function public.create_trial_for_profile();

create or replace function public.claim_trial_device(p_user_id uuid,p_device_hash text) returns boolean
language plpgsql security definer set search_path=public as $$
begin
  if exists(select 1 from user_trials where device_hash=p_device_hash and user_id<>p_user_id) then
    update user_trials set ends_at=least(ends_at,now()),updated_at=now() where user_id=p_user_id;
    update user_subscriptions set status='expired',ends_at=least(ends_at,now()) where user_id=p_user_id and kind='trial' and status='trial';
    return false;
  end if;
  update user_trials set device_hash=coalesce(device_hash,p_device_hash),updated_at=now() where user_id=p_user_id;
  return true;
end $$;

-- RLS follows the existing ai_user_id / ai_is_admin / ai_is_worker helpers.
alter table subscription_plans enable row level security; alter table subscription_plans force row level security;
alter table plan_entitlements enable row level security; alter table plan_entitlements force row level security;
alter table user_trials enable row level security; alter table user_trials force row level security;
alter table payment_methods enable row level security; alter table payment_methods force row level security;
alter table payment_requests enable row level security; alter table payment_requests force row level security;
alter table user_subscriptions enable row level security; alter table user_subscriptions force row level security;
alter table subscription_usage enable row level security; alter table subscription_usage force row level security;
alter table admin_audit_logs enable row level security; alter table admin_audit_logs force row level security;
alter table email_settings enable row level security; alter table email_settings force row level security;
alter table email_templates enable row level security; alter table email_templates force row level security;
alter table email_logs enable row level security; alter table email_logs force row level security;

create policy plans_read on subscription_plans for select using(active or ai_is_admin() or ai_is_worker());
create policy plans_admin on subscription_plans for all using(ai_is_admin() or ai_is_worker()) with check(ai_is_admin() or ai_is_worker());
create policy entitlements_read on plan_entitlements for select using(ai_user_id() is not null or ai_is_worker());
create policy entitlements_admin on plan_entitlements for all using(ai_is_admin() or ai_is_worker()) with check(ai_is_admin() or ai_is_worker());
create policy trials_owner on user_trials for select using(user_id=ai_user_id() or ai_is_admin() or ai_is_worker());
create policy trials_admin on user_trials for all using(ai_is_admin() or ai_is_worker()) with check(ai_is_admin() or ai_is_worker());
create policy methods_read on payment_methods for select using(active or ai_is_admin() or ai_is_worker());
create policy methods_admin on payment_methods for all using(ai_is_admin() or ai_is_worker()) with check(ai_is_admin() or ai_is_worker());
create policy requests_owner on payment_requests for select using(user_id=ai_user_id() or ai_is_admin() or ai_is_worker());
create policy requests_create on payment_requests for insert with check(user_id=ai_user_id() or ai_is_admin() or ai_is_worker());
create policy requests_admin on payment_requests for update using(ai_is_admin() or ai_is_worker()) with check(ai_is_admin() or ai_is_worker());
create policy subscriptions_owner on user_subscriptions for select using(user_id=ai_user_id() or ai_is_admin() or ai_is_worker());
create policy subscriptions_admin on user_subscriptions for all using(ai_is_admin() or ai_is_worker()) with check(ai_is_admin() or ai_is_worker());
create policy usage_owner on subscription_usage for select using(user_id=ai_user_id() or ai_is_admin() or ai_is_worker());
create policy usage_worker on subscription_usage for all using(user_id=ai_user_id() or ai_is_admin() or ai_is_worker()) with check(user_id=ai_user_id() or ai_is_admin() or ai_is_worker());
create policy audit_admin on admin_audit_logs for all using(ai_is_admin() or ai_is_worker()) with check(ai_is_admin() or ai_is_worker());
create policy smtp_admin on email_settings for all using(ai_is_admin() or ai_is_worker()) with check(ai_is_admin() or ai_is_worker());
create policy templates_admin on email_templates for all using(ai_is_admin() or ai_is_worker()) with check(ai_is_admin() or ai_is_worker());
create policy logs_admin on email_logs for all using(ai_is_admin() or ai_is_worker()) with check(ai_is_admin() or ai_is_worker());
