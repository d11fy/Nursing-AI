import { NextResponse } from "next/server";
import { getAdminProfileOrNull } from "@/lib/auth";
import { createSystemClient } from "@/lib/db/server";

export async function POST(request: Request) {
  const admin = await getAdminProfileOrNull();
  if (!admin) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  const json = await request.json().catch(() => null);
  if (!json || typeof json !== "object") {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  }

  const db = createSystemClient();

  // 1. General settings updates
  const {
    primaryProvider,
    economyProvider,
    fastProvider,
    utilityProvider,
    fallbackEnabled,
    allowFreeTierPrivateContent,
    monthlyAiBudget,
    openaiMonthlyBudget,
    providerRows,
  } = json as Record<string, any>;

  const updates: Array<{ key: string; value: any }> = [];

  if (typeof primaryProvider === "string") updates.push({ key: "ai_primary_provider", value: primaryProvider });
  if (typeof economyProvider === "string") updates.push({ key: "ai_economy_provider", value: economyProvider });
  if (typeof fastProvider === "string") updates.push({ key: "ai_fast_provider", value: fastProvider });
  if (typeof utilityProvider === "string") updates.push({ key: "ai_utility_provider", value: utilityProvider });
  if (typeof fallbackEnabled === "boolean") updates.push({ key: "ai_fallback_enabled", value: String(fallbackEnabled) });
  if (typeof allowFreeTierPrivateContent === "boolean") updates.push({ key: "allow_free_tier_private_content", value: String(allowFreeTierPrivateContent) });
  if (monthlyAiBudget !== undefined) updates.push({ key: "monthly_ai_budget", value: String(monthlyAiBudget) });
  if (openaiMonthlyBudget !== undefined) updates.push({ key: "openai_monthly_budget", value: String(openaiMonthlyBudget) });

  for (const item of updates) {
    const { data: existing } = await db.from("settings").select("key").eq("key", item.key).maybeSingle();
    if (existing) {
      await db.from("settings").update({
        value: item.value,
        updated_at: new Date().toISOString(),
      }).eq("key", item.key);
    } else {
      await db.from("settings").insert({
        key: item.key,
        value: item.value,
        updated_at: new Date().toISOString(),
      });
    }
  }

  // 2. Individual provider rows updates
  if (Array.isArray(providerRows)) {
    for (const row of providerRows) {
      if (row.provider) {
        const { data: existing } = await db.from("ai_provider_settings").select("provider").eq("provider", row.provider).maybeSingle();
        const payload = {
          provider: row.provider,
          enabled: row.enabled ?? true,
          role: row.role ?? "primary",
          priority: row.priority ?? 1,
          simple_enabled: row.simple_enabled ?? true,
          normal_enabled: row.normal_enabled ?? true,
          complex_enabled: row.complex_enabled ?? true,
          vision_enabled: row.vision_enabled ?? true,
          utility_enabled: row.utility_enabled ?? false,
          fallback_enabled: row.fallback_enabled ?? true,
          updated_at: new Date().toISOString(),
        };
        if (existing) {
          await db.from("ai_provider_settings").update(payload).eq("provider", row.provider);
        } else {
          await db.from("ai_provider_settings").insert(payload);
        }
      }
    }
  }

  return NextResponse.json({ success: true });
}
