import { NextResponse } from "next/server";
import { getAdminProfileOrNull } from "@/lib/auth";
import { createSystemClient } from "@/lib/db/server";
import { getProviderCircuitState } from "@/lib/ai/fallback";
import { getGeminiTextModel } from "@/lib/ai/providers/gemini";
import { getGroqTextModel } from "@/lib/ai/providers/groq";
import { getCloudflareClassifierModel } from "@/lib/ai/providers/cloudflare";

export async function GET() {
  const admin = await getAdminProfileOrNull();
  if (!admin) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  const db = createSystemClient();

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  // 1. Fetch Today's Usage Logs
  const { data: todayLogs } = await db
    .from("usage_logs")
    .select("provider, model, feature, input_tokens, output_tokens, estimated_cost, latency_ms, success, is_free_tier, fallback_used")
    .gte("created_at", startOfToday.toISOString());

  // 2. Fetch Month's Cost
  const { data: monthLogs } = await db
    .from("usage_logs")
    .select("provider, estimated_cost")
    .gte("created_at", startOfMonth.toISOString());

  // 3. Provider Settings
  const { data: providerRows } = await db
    .from("ai_provider_settings")
    .select("*");

  // 4. General Settings
  const { data: settingsRows } = await db
    .from("settings")
    .select("key, value");

  const settingsMap = new Map((settingsRows ?? []).map((r) => [r.key, r.value]));

  // Calculate Provider Stats
  const providers = ["openai", "gemini", "groq", "cloudflare"];
  const providerStats: Record<string, {
    requestsToday: number;
    tokensToday: number;
    costToday: number;
    errorsToday: number;
    avgLatencyMs: number;
    fallbackRequests: number;
    status: string;
    model: string;
    role: string;
  }> = {};

  providers.forEach((p) => {
    const defaultModel =
      p === "openai"
        ? process.env.OPENAI_TEXT_MODEL || "gpt-5.4-mini"
        : p === "gemini"
        ? getGeminiTextModel()
        : p === "groq"
        ? getGroqTextModel()
        : getCloudflareClassifierModel();

    const role =
      p === "openai"
        ? "primary"
        : p === "gemini"
        ? "economy"
        : p === "groq"
        ? "fast"
        : "utility";

    const circuit = getProviderCircuitState(p);

    providerStats[p] = {
      requestsToday: 0,
      tokensToday: 0,
      costToday: 0,
      errorsToday: 0,
      avgLatencyMs: 0,
      fallbackRequests: 0,
      status: circuit.status,
      model: defaultModel,
      role,
    };
  });

  let totalRequestsToday = 0;
  let premiumRequests = 0;
  let economyRequests = 0;
  let freeTierRequests = 0;
  const featureCostMap: Record<string, number> = {};

  let latencies: Record<string, number[]> = { openai: [], gemini: [], groq: [], cloudflare: [] };

  for (const log of todayLogs ?? []) {
    const p = (log.provider || "openai").toLowerCase();
    const stats = providerStats[p] || providerStats["openai"];
    stats.requestsToday += 1;
    stats.tokensToday += (log.input_tokens || 0) + (log.output_tokens || 0);
    stats.costToday += Number(log.estimated_cost) || 0;
    if (log.success === false) stats.errorsToday += 1;
    if (log.fallback_used) stats.fallbackRequests += 1;
    if (log.latency_ms) {
      if (!latencies[p]) latencies[p] = [];
      latencies[p].push(log.latency_ms);
    }

    totalRequestsToday += 1;
    if (p === "openai") premiumRequests += 1;
    else economyRequests += 1;
    if (log.is_free_tier) freeTierRequests += 1;

    const feature = log.feature || "chat";
    featureCostMap[feature] = (featureCostMap[feature] || 0) + (Number(log.estimated_cost) || 0);
  }

  // Calculate average latencies
  providers.forEach((p) => {
    const list = latencies[p] || [];
    if (list.length > 0) {
      providerStats[p].avgLatencyMs = Math.round(list.reduce((a, b) => a + b, 0) / list.length);
    }
  });

  // Calculate Month Costs
  let costMonth = 0;
  let openaiCostMonth = 0;
  for (const log of monthLogs ?? []) {
    const c = Number(log.estimated_cost) || 0;
    costMonth += c;
    if (log.provider === "openai" || !log.provider) openaiCostMonth += c;
  }

  const monthlyAiBudget = Number(settingsMap.get("monthly_ai_budget") ?? 50);
  const openaiMonthlyBudget = Number(settingsMap.get("openai_monthly_budget") ?? 30);

  return NextResponse.json({
    providerStats,
    providerRows: providerRows ?? [],
    totals: {
      requestsToday: totalRequestsToday,
      premiumRequests,
      economyRequests,
      freeTierRequests,
      costToday: Object.values(providerStats).reduce((a, b) => a + b.costToday, 0),
      costMonth,
      openaiCostMonth,
      monthlyAiBudget,
      openaiMonthlyBudget,
      featureCosts: featureCostMap,
    },
    settings: {
      primaryProvider: settingsMap.get("ai_primary_provider") ?? "openai",
      economyProvider: settingsMap.get("ai_economy_provider") ?? "gemini",
      fastProvider: settingsMap.get("ai_fast_provider") ?? "groq",
      utilityProvider: settingsMap.get("ai_utility_provider") ?? "cloudflare",
      fallbackEnabled: settingsMap.get("ai_fallback_enabled") !== "false",
      allowFreeTierPrivateContent: settingsMap.get("allow_free_tier_private_content") === "true",
      monthlyAiBudget,
      openaiMonthlyBudget,
    },
  });
}
