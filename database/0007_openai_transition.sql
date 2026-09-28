-- Transition completely to OpenAI provider with text-embedding-3-small (1536 dimensions)
-- Remove any incompatible embeddings from old provider spaces
delete from public.document_chunks where embedding_provider is distinct from 'openai';
delete from public.lecture_chunks where embedding_provider is distinct from 'openai';

-- Mark any documents that now have 0 chunks as needing reprocessing
update public.documents d
set status = 'processing', chunk_count = 0
where not exists (select 1 from public.document_chunks dc where dc.document_id = d.id);

-- Add advanced usage analytics function for OpenAI telemetry in admin dashboard
create or replace function public.admin_ai_usage_breakdown()
returns table (
  model text,
  req_count bigint,
  total_input_tokens bigint,
  total_output_tokens bigint,
  total_cost numeric
)
language sql stable security definer set search_path = public as $$
  select
    coalesce(model, 'unknown') as model,
    count(*)::bigint as req_count,
    coalesce(sum(input_tokens), 0)::bigint as total_input_tokens,
    coalesce(sum(output_tokens), 0)::bigint as total_output_tokens,
    coalesce(sum(estimated_cost), 0)::numeric as total_cost
  from public.usage_logs
  group by model
  order by total_cost desc;
$$;

create or replace function public.admin_ai_type_breakdown()
returns table (
  usage_type text,
  req_count bigint,
  total_cost numeric
)
language sql stable security definer set search_path = public as $$
  select
    type::text as usage_type,
    count(*)::bigint as req_count,
    coalesce(sum(estimated_cost), 0)::numeric as total_cost
  from public.usage_logs
  group by type
  order by req_count desc;
$$;
