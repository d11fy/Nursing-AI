import "server-only";

import { workerDb } from "@/lib/tutor/db";
import { enqueueTemplateEmail, processEmailQueue } from "@/lib/email-queue";

export async function runSubscriptionJobs(){
  await workerDb.query("update user_subscriptions set status='active' where status='scheduled' and starts_at<=now() and ends_at>now()");
  await workerDb.query("update user_subscriptions set status='expired' where status in('trial','active','scheduled') and ends_at<=now()");
  const reminders=(await workerDb.query<{email:string;full_name:string;template_key:string;plan_name:string;ends_at:string;days_remaining:number}>(`with candidates as (
    select p.email,p.full_name,'trial_ending'::text template_key,'الفترة التجريبية'::text plan_name,t.ends_at,ceil(extract(epoch from(t.ends_at-now()))/86400)::int days_remaining
      from user_trials t join profiles p on p.user_id=t.user_id where t.ends_at between now() and now()+interval '1 day'
    union all
    select p.email,p.full_name,'subscription_expiring',s.plan_name_snapshot,s.ends_at,ceil(extract(epoch from(s.ends_at-now()))/86400)::int
      from user_subscriptions s join profiles p on p.user_id=s.user_id where s.kind<>'trial' and s.status in('active','scheduled') and
      (s.ends_at between now() and now()+interval '1 day' or s.ends_at between now()+interval '2 days' and now()+interval '3 days')
    union all
    select p.email,p.full_name,'trial_expired','الفترة التجريبية',t.ends_at,0
      from user_trials t join profiles p on p.user_id=t.user_id where t.ends_at between date_trunc('day',now()) and now()
    union all
    select p.email,p.full_name,'subscription_expired',s.plan_name_snapshot,s.ends_at,0
      from user_subscriptions s join profiles p on p.user_id=s.user_id where s.kind<>'trial' and s.status='expired' and s.ends_at between date_trunc('day',now()) and now()
  ) select * from candidates c where not exists(select 1 from email_logs l where l.recipient=c.email and l.template_key=c.template_key and l.created_at>=date_trunc('day',now()))`)).rows;
  for(const r of reminders)await enqueueTemplateEmail(r.email,r.template_key,{student_name:r.full_name,plan_name:r.plan_name,expiry_date:new Date(r.ends_at).toLocaleDateString("ar-EG"),days_remaining:String(r.days_remaining)});
  return {reminders:reminders.length,...await processEmailQueue(20)};
}
