-- =========================================
-- MULTI-PROVIDER AI ROUTER & USAGE ENHANCEMENT
-- =========================================

-- 1. Extend usage_logs with provider, fallback, latency and telemetry columns
alter table public.usage_logs add column if not exists provider text;
alter table public.usage_logs add column if not exists feature text;
alter table public.usage_logs add column if not exists fallback_used boolean default false;
alter table public.usage_logs add column if not exists fallback_from text;
alter table public.usage_logs add column if not exists fallback_reason text;
alter table public.usage_logs add column if not exists latency_ms integer;
alter table public.usage_logs add column if not exists success boolean default true;
alter table public.usage_logs add column if not exists error_code text;
alter table public.usage_logs add column if not exists is_free_tier boolean default false;

create index if not exists usage_logs_provider_created_at_idx on public.usage_logs(provider, created_at);
create index if not exists usage_logs_feature_created_at_idx on public.usage_logs(feature, created_at);

-- 2. AI Provider Settings table
create table if not exists public.ai_provider_settings (
  provider text primary key,
  enabled boolean not null default true,
  role text not null default 'primary',
  priority integer not null default 1,
  simple_enabled boolean not null default true,
  normal_enabled boolean not null default true,
  complex_enabled boolean not null default true,
  vision_enabled boolean not null default true,
  utility_enabled boolean not null default true,
  fallback_enabled boolean not null default true,
  status text not null default 'healthy',
  last_error text,
  last_error_at timestamptz,
  consecutive_failures integer not null default 0,
  cooldown_until timestamptz,
  updated_at timestamptz not null default now()
);

-- Seed defaults if not present
insert into public.ai_provider_settings (provider, enabled, role, priority, simple_enabled, normal_enabled, complex_enabled, vision_enabled, utility_enabled, fallback_enabled, status)
values
  ('openai', true, 'primary', 1, true, true, true, true, false, true, 'healthy'),
  ('gemini', true, 'economy', 2, true, true, false, true, false, true, 'healthy'),
  ('groq', true, 'fast', 3, true, true, false, false, false, true, 'healthy'),
  ('cloudflare', true, 'utility', 4, false, false, false, false, true, false, 'healthy')
on conflict (provider) do nothing;

-- Additional settings keys for router & budget guard
insert into public.settings (key, value) values
  ('monthly_ai_budget', '50'),
  ('openai_monthly_budget', '30'),
  ('ai_primary_provider', '"openai"'),
  ('ai_economy_provider', '"gemini"'),
  ('ai_fast_provider', '"groq"'),
  ('ai_utility_provider', '"cloudflare"'),
  ('ai_fallback_enabled', 'true'),
  ('allow_free_tier_private_content', 'false')
on conflict (key) do nothing;
