import type { DatabaseClient } from "@/lib/db/server";
import { createSystemClient } from "@/lib/db/server";
import type { UsageType } from "@/types/database";

export interface AppSettings {
  freeDailyLimit: number;
  rateLimitSeconds: number;
  maxImageSizeMb: number;
  lectureMaxFileMb: number;
  lectureLargeFileMb: number;
  lectureRetentionDays: number;
  monthlyAiBudget: number;
  openaiMonthlyBudget: number;
}

const DEFAULT_SETTINGS: AppSettings = {
  freeDailyLimit: 20,
  rateLimitSeconds: 3,
  maxImageSizeMb: 8,
  lectureMaxFileMb: 50,
  lectureLargeFileMb: 20,
  lectureRetentionDays: 10,
  monthlyAiBudget: 50,
  openaiMonthlyBudget: 30,
};

export async function getSettings(
  db: DatabaseClient
): Promise<AppSettings> {
  const { data } = await db.from("settings").select("key, value");
  const map = new Map((data ?? []).map((row) => [row.key, row.value]));

  return {
    freeDailyLimit: Number(map.get("free_daily_limit") ?? DEFAULT_SETTINGS.freeDailyLimit),
    rateLimitSeconds: Number(
      map.get("rate_limit_seconds") ?? DEFAULT_SETTINGS.rateLimitSeconds
    ),
    maxImageSizeMb: Number(map.get("max_image_size_mb") ?? DEFAULT_SETTINGS.maxImageSizeMb),
    lectureMaxFileMb: Number(map.get("lecture_max_file_mb") ?? DEFAULT_SETTINGS.lectureMaxFileMb),
    lectureLargeFileMb: Number(map.get("lecture_large_file_mb") ?? DEFAULT_SETTINGS.lectureLargeFileMb),
    lectureRetentionDays: Number(map.get("lecture_retention_days") ?? DEFAULT_SETTINGS.lectureRetentionDays),
    monthlyAiBudget: Number(map.get("monthly_ai_budget") ?? DEFAULT_SETTINGS.monthlyAiBudget),
    openaiMonthlyBudget: Number(map.get("openai_monthly_budget") ?? DEFAULT_SETTINGS.openaiMonthlyBudget),
  };
}

/** Daily usage is derived from `usage_logs` rows created since midnight —
 * no cron reset job to keep in sync, the count is always accurate. */
export async function getTodayUsageCount(
  db: DatabaseClient,
  userId: string
): Promise<number> {
  const { data, error } = await db.rpc("get_today_usage_count", {
    p_user_id: userId,
  });
  if (error) {
    console.error("getTodayUsageCount error", error);
    throw new Error("تعذر التحقق من حد الاستخدام");
  }
  return data ?? 0;
}

export async function checkDailyLimit(
  db: DatabaseClient,
  userId: string
): Promise<{ allowed: boolean; used: number; limit: number }> {
  const settings = await getSettings(db);
  const used = await getTodayUsageCount(db, userId);
  return { allowed: used < settings.freeDailyLimit, used, limit: settings.freeDailyLimit };
}

/** Per-user cooldown between AI requests, computed from the most recent
 * `usage_logs` row so it works correctly across serverless instances. */
export async function checkRateLimit(
  userId: string
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const db = createSystemClient();
  const settings = await getSettings(db);

  const { data, error } = await db
    .from("usage_logs")
    .select("created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error("تعذر التحقق من حد الاستخدام");
  if (!data) return { allowed: true, retryAfterSeconds: 0 };

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
  provider?: string | null;
  feature?: string | null;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  isFreeTier?: boolean;
  latencyMs?: number | null;
  success?: boolean;
  errorCode?: string | null;
  fallbackUsed?: boolean;
  fallbackFrom?: string | null;
  fallbackReason?: string | null;
  lectureId?: string | null;
}) {
  const db = createSystemClient();
  const { error } = await db.from("usage_logs").insert({
    user_id: params.userId,
    type: params.type,
    model: params.model,
    provider: params.provider ?? null,
    feature: params.feature ?? params.type,
    input_tokens: params.inputTokens,
    output_tokens: params.outputTokens,
    estimated_cost: params.estimatedCost,
    is_free_tier: params.isFreeTier ?? false,
    latency_ms: params.latencyMs ?? null,
    success: params.success ?? true,
    error_code: params.errorCode ?? null,
    fallback_used: params.fallbackUsed ?? false,
    fallback_from: params.fallbackFrom ?? null,
    fallback_reason: params.fallbackReason ?? null,
    lecture_id: params.lectureId ?? null,
  });
  if (error) console.error("logUsage error", error);
}

export async function getMonthlyAiSpend(db: DatabaseClient): Promise<{ totalCost: number; openaiCost: number }> {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { data, error } = await db
    .from("usage_logs")
    .select("provider, estimated_cost")
    .gte("created_at", startOfMonth.toISOString());

  if (error || !data) return { totalCost: 0, openaiCost: 0 };

  let totalCost = 0;
  let openaiCost = 0;
  for (const row of data) {
    const cost = Number(row.estimated_cost) || 0;
    totalCost += cost;
    if (row.provider === "openai" || (!row.provider && !row.provider)) {
      openaiCost += cost;
    }
  }

  return { totalCost, openaiCost };
}
