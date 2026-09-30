import 'server-only';
import { identityDb } from './db';
export async function tutorUsage(adminId:string) {
  const db=identityDb(adminId);
  const [summary,features,students,knowledge]=await Promise.all([
    db.query<{today_cost:number;month_cost:number;today_requests:number;month_requests:number;input_tokens:number;cached_tokens:number;output_tokens:number;errors:number;avg_cost:number;last_request:string|null;last_success:string|null}>(`
      select coalesce(sum(estimated_cost) filter(where created_at>=date_trunc('day',now() at time zone 'Asia/Hebron') at time zone 'Asia/Hebron'),0)::float8 today_cost,
      coalesce(sum(estimated_cost),0)::float8 month_cost,count(*) filter(where feature='chat' and created_at>=date_trunc('day',now() at time zone 'Asia/Hebron') at time zone 'Asia/Hebron')::int today_requests,
      count(*) filter(where feature='chat')::int month_requests,coalesce(sum(input_tokens),0)::bigint input_tokens,
      coalesce(sum(cached_input_tokens),0)::bigint cached_tokens,coalesce(sum(output_tokens),0)::bigint output_tokens,
      count(*) filter(where success=false)::int errors,coalesce(avg(estimated_cost) filter(where success),0)::float8 avg_cost,
      max(created_at)::text last_request,max(created_at) filter(where success)::text last_success from usage_logs
      where provider='openai' and pricing_version is not null and created_at>=date_trunc('month',now() at time zone 'Asia/Hebron') at time zone 'Asia/Hebron'`),
    db.query<{feature:string;requests:number;cost:number}>(`select feature,count(*)::int requests,sum(estimated_cost)::float8 cost from usage_logs
      where provider='openai' and pricing_version is not null and created_at>=date_trunc('month',now() at time zone 'Asia/Hebron') at time zone 'Asia/Hebron'
      group by feature order by cost desc`),
    db.query<{user_id:string;full_name:string;requests:number;cost:number}>(`select p.user_id,p.full_name,count(*)::int requests,sum(u.estimated_cost)::float8 cost
      from usage_logs u join profiles p on p.user_id=u.user_id where u.provider='openai' and u.pricing_version is not null
      and u.created_at>=date_trunc('month',now() at time zone 'Asia/Hebron') at time zone 'Asia/Hebron' group by p.user_id,p.full_name order by cost desc`),
    db.query<{ready:number;needs_review:number;queued:number}>(`select count(*) filter(where status='ready' and is_active)::int ready,
      count(*) filter(where status in ('failed','needs_review'))::int needs_review,
      (select count(*) from knowledge_jobs where status in ('queued','running'))::int queued from knowledge_documents`),
  ]);
  return {summary:summary.rows[0],features:features.rows,students:students.rows,knowledge:knowledge.rows[0]};
}
