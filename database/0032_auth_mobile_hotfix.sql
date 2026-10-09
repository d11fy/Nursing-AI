alter table device_transfers add column attempts integer not null default 0;
create unique index device_transfers_user_idx on device_transfers(user_id);
create table device_transfer_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_users(id) on delete set null,
  event_type text not null check(event_type in('DEVICE_TRANSFER_OTP_SENT','DEVICE_TRANSFER_OTP_FAILED','DEVICE_TRANSFER_SUCCESS','DEVICE_TRANSFER_DENIED')),
  created_at timestamptz not null default now()
);
alter table device_transfer_events enable row level security;
alter table device_transfer_events force row level security;
create policy transfer_event_worker on device_transfer_events for all using(ai_is_worker()) with check(ai_is_worker());
insert into settings(key,value) values('support_whatsapp_number','"+972567508786"'::jsonb) on conflict(key) do nothing;
update settings set value=jsonb_set(value,'{minimum_supported_version_code}','5'::jsonb,true),updated_at=now()
where key='mobile_app_version' and not (value ? 'minimum_supported_version_code');
alter table email_settings add column reply_to text;
update email_templates set subject='رمز نقل حساب Nursing AI',
 html_body='<p>مرحبًا {{student_name}}</p><p>طلبت نقل حساب Nursing AI إلى جهاز جديد. أدخل رمز التحقق التالي في التطبيق:</p><p dir="ltr" style="font-size:26px;font-weight:bold;letter-spacing:6px">{{transfer_code}}</p><p>ينتهي خلال 10 دقائق. إذا لم تطلب ذلك فتجاهل الرسالة ولا تشارك الرمز مع أحد.</p>',
 text_body='مرحبًا {{student_name}}، طلبت نقل حساب Nursing AI إلى جهاز جديد. رمز التحقق: {{transfer_code}}. ينتهي خلال 10 دقائق. إذا لم تطلب ذلك فتجاهل الرسالة ولا تشارك الرمز.'
where template_key='device_transfer';
insert into email_templates(template_key,name,subject,html_body,text_body) values
('support_received','استلام طلب المساعدة','تم استلام طلب مساعدتك في Nursing AI',
 '<p>استلمنا طلب المساعدة الخاص بك وسنراجعه. يمكنك متابعة حالة الطلب من صفحة الدعم.</p>',
 'استلمنا طلب المساعدة الخاص بك وسنراجعه. يمكنك متابعة حالة الطلب من صفحة الدعم.'),
('security_alert','تنبيه أمان الحساب','تم نقل حسابك في Nursing AI إلى جهاز جديد',
 '<p>تم نقل تسجيل الدخول إلى جهاز جديد بعد التحقق من الرمز. أُغلقت جلسة الجهاز السابق. إذا لم تطلب ذلك، تواصل معنا عبر الدعم فورًا.</p>',
 'تم نقل تسجيل الدخول إلى جهاز جديد بعد التحقق من الرمز. أُغلقت جلسة الجهاز السابق. إذا لم تطلب ذلك، تواصل معنا عبر الدعم فورًا.')
on conflict(template_key) do nothing;
update email_templates set
 subject='إعادة تعيين كلمة المرور في Nursing AI',
 html_body='<p>إذا طلبت إعادة تعيين كلمة المرور، استخدم الزر التالي خلال 30 دقيقة:</p><p><a href="{{reset_url}}" style="display:inline-block;background:#0f5d75;color:#ffffff;text-decoration:none;font-weight:bold;border-radius:6px;padding:10px 18px">إعادة تعيين كلمة المرور</a></p><p>إذا لم تطلب ذلك، تجاهل هذه الرسالة.</p>',
 text_body='إذا طلبت إعادة تعيين كلمة المرور، استخدم الرابط خلال 30 دقيقة: {{reset_url}}. إذا لم تطلب ذلك، تجاهل هذه الرسالة.'
where template_key='password_reset';
