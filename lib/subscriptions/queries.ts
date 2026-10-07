import "server-only";

import { identityDb } from "@/lib/tutor/db";
import { getStudentEntitlements, getUsageSummary } from "./service";

export async function getSubscriptionPageData(userId:string){
  const db=identityDb(userId);
  const [access,usage,plans,methods,payments,history]=await Promise.all([
    getStudentEntitlements(userId),getUsageSummary(userId),
    db.query<{id:string;name:string;price:number;currency:string;duration_days:number;description:string;recommended:boolean}>("select id,name,price,currency,duration_days,description,recommended from subscription_plans where active=true order by sort_order,name"),
    db.query<{id:string;name:string;type:string;account_holder:string|null;account_number:string|null;iban:string|null;wallet_number:string|null;instructions:string}>("select id,name,type,account_holder,account_number,iban,wallet_number,instructions from payment_methods where active=true order by sort_order,name"),
    db.query<{id:string;payment_reference:string;plan_name_snapshot:string;amount:number;currency:string;status:string;rejection_reason:string|null;created_at:string}>("select id,payment_reference,plan_name_snapshot,amount,currency,status,rejection_reason,created_at from payment_requests where user_id=$1 order by created_at desc limit 30",[userId]),
    db.query<{id:string;plan_name_snapshot:string;kind:string;status:string;starts_at:string;ends_at:string;amount_paid:number;currency:string}>("select id,plan_name_snapshot,kind,status,starts_at,ends_at,amount_paid,currency from user_subscriptions where user_id=$1 order by created_at desc limit 30",[userId]),
  ]);
  return {access,usage,plans:plans.rows,methods:methods.rows,payments:payments.rows,history:history.rows};
}

export async function getAdminSubscriptionData(adminId:string){
  const db=identityDb(adminId);
  const [plans,methods,payments,templates,logs,settings,stats,subscriptionSettings]=await Promise.all([
    db.query<{id:string;slug:string;name:string;price:number;currency:string;duration_days:number;description:string;sort_order:number;active:boolean;recommended:boolean;entitlements:Record<string,unknown>}>(`select p.*,coalesce(jsonb_object_agg(e.feature_key,e.value) filter(where e.feature_key is not null),'{}') entitlements
      from subscription_plans p left join plan_entitlements e on e.plan_id=p.id group by p.id order by p.sort_order,p.name`),
    db.query<{id:string;name:string;type:string;account_holder:string|null;account_number:string|null;iban:string|null;wallet_number:string|null;instructions:string;active:boolean;sort_order:number}>("select * from payment_methods order by sort_order,name"),
    db.query<{id:string;payment_reference:string;user_id:string;student_name:string;email:string;plan_name_snapshot:string;amount:number;currency:string;method_name:string|null;status:string;rejection_reason:string|null;created_at:string}>(`select r.id,r.payment_reference,r.user_id,p.full_name student_name,p.email,r.plan_name_snapshot,r.amount,r.currency,m.name method_name,r.status,r.rejection_reason,r.created_at
      from payment_requests r join profiles p on p.user_id=r.user_id left join payment_methods m on m.id=r.payment_method_id order by (r.status='pending') desc,r.created_at desc limit 200`),
    db.query<{template_key:string;name:string;subject:string;html_body:string;text_body:string;active:boolean}>("select * from email_templates order by name"),
    db.query<{id:string;recipient:string;template_key:string|null;status:string;retry_count:number;last_error:string|null;created_at:string;sent_at:string|null}>("select id,recipient,template_key,status,retry_count,last_error,created_at,sent_at from email_logs order by created_at desc limit 100"),
    db.query<{host:string|null;port:number;username:string|null;has_password:boolean;encryption:string;from_name:string;from_email:string|null}>("select host,port,username,(password_ciphertext is not null) has_password,encryption,from_name,from_email from email_settings where singleton=true"),
    db.query<{active_subscribers:number;trial_users:number;expiring_soon:number;pending_payments:number;revenue_month:number;revenue_total:number;popular_plan:string|null;conversion_rate:number}>(`select
      (select count(distinct user_id) from user_subscriptions where kind<>'trial' and status not in('cancelled','revoked') and starts_at<=now() and ends_at>now()) active_subscribers,
      (select count(*) from user_trials where ends_at>now()) trial_users,
      (select count(distinct user_id) from user_subscriptions where kind<>'trial' and status not in('cancelled','revoked') and ends_at between now() and now()+interval '3 days') expiring_soon,
      (select count(*) from payment_requests where status='pending') pending_payments,
      (select coalesce(sum(amount),0) from payment_requests where status='approved' and reviewed_at>=date_trunc('month',now())) revenue_month,
      (select coalesce(sum(amount),0) from payment_requests where status='approved') revenue_total,
      (select plan_name_snapshot from payment_requests where status='approved' group by plan_name_snapshot order by count(*) desc limit 1) popular_plan,
      (select case when count(*)=0 then 0 else round(100.0*count(*) filter(where exists(select 1 from user_subscriptions s where s.user_id=t.user_id and s.kind<>'trial'))/count(*),1) end from user_trials t) conversion_rate`),
    db.query<{key:string;value:unknown}>("select key,value from settings where key like 'trial_%' or key like 'payment_grace_%'"),
  ]);
  return {plans:plans.rows,methods:methods.rows,payments:payments.rows,templates:templates.rows,logs:logs.rows,emailSettings:settings.rows[0],stats:stats.rows[0],subscriptionSettings:Object.fromEntries(subscriptionSettings.rows.map(row=>[row.key,row.value]))};
}
