import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { Database, UsageType } from "@/types/database";

export interface AppSettings {
  freeDailyLimit: number;
  rateLimitSeconds: number;
  maxImageSizeMb: number;
}

const DEFAULT_SETTINGS: AppSettings = {
  freeDailyLimit: 20,
  rateLimitSeconds: 3,
  maxImageSizeMb: 8,
};

export async function getSettings(
  supabase: SupabaseClient<Database>
): Promise<AppSettings> {
  const { data } = await supabase.from("settings").select("key, value");
  const map = new Map((data ?? []).map((row) => [row.key, row.value]));

  return {
    freeDailyLimit: Number(map.get("free_daily_limit") ?? DEFAULT_SETTINGS.freeDailyLimit),
    rateLimitSeconds: Number(
      map.get("rate_limit_seconds") ?? DEFAULT_SETTINGS.rateLimitSeconds
    ),
    maxImageSizeMb: Number(map.get("max_image_size_mb") ?? DEFAULT_SETTINGS.maxImageSizeMb),
  };
}

/** Daily usage is derived from `usage_logs` rows created since midnight —
 * no cron reset job to keep in sync, the count is always accurate. */
export async function getTodayUsageCount(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<number> {
  const { data, error } = await supabase.rpc("get_today_usage_count", {
    p_user_id: userId,
  });
  if (error) {
    console.error("getTodayUsageCount error", error);
    return 0;
  }
  return data ?? 0;
}

export async function checkDailyLimit(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<{ allowed: boolean; used: number; limit: number }> {
  const settings = await getSettings(supabase);
  const used = await getTodayUsageCount(supabase, userId);
  return { allowed: used < settings.freeDailyLimit, used, limit: settings.freeDailyLimit };
}

/** Per-user cooldown between AI requests, computed from the most recent
 * `usage_logs` row so it works correctly across serverless instances. */
export async function checkRateLimit(
  userId: string
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const supabase = createServiceRoleClient();
  const settings = await getSettings(supabase);

  const { data, error } = await supabase
    .from("usage_logs")
    .select("created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return { allowed: true, retryAfterSeconds: 0 };

  const elapsedMs = Date.now() - new Date(data.created_at).getTime();
  const requiredMs = settings.rateLimitSeconds * 1000;

  if (elapsedMs >= requiredMs) return { allowed: true, retryAfterSeconds: 0 };

  return {
    allowed: false,
    retryAfterSeconds: Math.ceil((requiredMs - elapsedMs) / 1000),
  };
}

export async function logUsage(params: {
  userId: string;
  type: UsageType;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
}) {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("usage_logs").insert({
    user_id: params.userId,
    type: params.type,
    model: params.model,
    input_tokens: params.inputTokens,
    output_tokens: params.outputTokens,
    estimated_cost: params.estimatedCost,
  });
  if (error) console.error("logUsage error", error);
}
