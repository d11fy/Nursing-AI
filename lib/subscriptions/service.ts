import "server-only";

import type { PoolClient } from "pg";
import { withIdentity, identityDb } from "@/lib/tutor/db";
import type { EntitlementValue, SubscriptionAccess, UsageItem, UsageReservation } from "./types";

const TRIAL_DEFAULTS: Record<string, EntitlementValue> = {
  ai_questions_daily: 10,
  images_limit: 3,
  files_limit: 1,
  study_pack_enabled: true,
  study_pack_limit: 1,
  quiz_enabled: true,
  flashcards_enabled: true,
  library_enabled: true,
  mistakes_enabled: true,
  weak_topics_enabled: true,
  progress_enabled: true,
  targeted_review_enabled: false,
};

function primitive(value: unknown): EntitlementValue {
  if (typeof value === "boolean" || typeof value === "number" || typeof value === "string" || value === null) return value;
  return null;
}

async function resolveAccess(db: PoolClient, userId: string): Promise<SubscriptionAccess> {
  const paid = (await db.query<{
    id: string; plan_id: string; plan_name_snapshot: string; starts_at: string; ends_at: string;
  }>(`select s.id,s.plan_id,s.plan_name_snapshot,s.starts_at,s.ends_at
      from user_subscriptions s
      where s.user_id=$1 and s.kind in ('paid','manual','adjustment')
        and s.status not in ('cancelled','revoked') and s.starts_at<=now() and s.ends_at>now()
      order by s.ends_at desc limit 1`, [userId])).rows[0];

  if (paid) {
    const rows = (await db.query<{ feature_key: string; value: unknown }>(
      "select feature_key,value from plan_entitlements where plan_id=$1", [paid.plan_id]
    )).rows;
    return {
      kind: "paid", active: true, planId: paid.plan_id, planName: paid.plan_name_snapshot,
      startsAt: paid.starts_at, endsAt: paid.ends_at,
      daysRemaining: Math.max(0, Math.ceil((new Date(paid.ends_at).getTime() - Date.now()) / 86_400_000)),
      entitlements: Object.fromEntries(rows.map((row) => [row.feature_key, primitive(row.value)])), pendingPayment: false,
    };
  }

  const trial = (await db.query<{ starts_at: string; ends_at: string }>(
    "select starts_at,ends_at from user_trials where user_id=$1", [userId]
  )).rows[0];
  if (trial && new Date(trial.ends_at).getTime() > Date.now()) {
    const settings = (await db.query<{ key: string; value: unknown }>(
      "select key,value from settings where key like 'trial_%'"
    )).rows;
    const map = new Map(settings.map((row) => [row.key, Number(row.value)]));
    const entitlements = { ...TRIAL_DEFAULTS,
      ai_questions_daily: map.get("trial_ai_questions_daily") ?? 10,
      images_limit: map.get("trial_images_total") ?? 3,
      files_limit: map.get("trial_files_total") ?? 1,
      study_pack_limit: map.get("trial_study_pack_total") ?? 1,
    };
    return {
      kind: "trial", active: true, planId: null, planName: "الفترة التجريبية",
      startsAt: trial.starts_at, endsAt: trial.ends_at,
      daysRemaining: Math.max(0, Math.ceil((new Date(trial.ends_at).getTime() - Date.now()) / 86_400_000)),
      entitlements, pendingPayment: false,
    };
  }

  const grace = (await db.query<{ enabled: boolean; hours: number }>(`select
    coalesce((select (value #>> '{}')::boolean from settings where key='payment_grace_enabled'),false) enabled,
    coalesce((select (value #>> '{}')::integer from settings where key='payment_grace_hours'),24) hours`)).rows[0];
  const pending = grace.enabled ? (await db.query<{ plan_id: string; plan_name_snapshot: string; created_at: string }>(
    `select plan_id,plan_name_snapshot,created_at from payment_requests
      where user_id=$1 and status='pending' and created_at > now()-($2*interval '1 hour') order by created_at desc limit 1`,
    [userId, grace.hours]
  )).rows[0] : undefined;
  if (pending?.plan_id) {
    const rows = (await db.query<{ feature_key: string; value: unknown }>(
      "select feature_key,value from plan_entitlements where plan_id=$1", [pending.plan_id]
    )).rows;
    return { kind: "grace", active: true, planId: pending.plan_id, planName: `${pending.plan_name_snapshot} — مهلة دفع`,
      startsAt: pending.created_at, endsAt: null, daysRemaining: 0,
      entitlements: Object.fromEntries(rows.map((row) => [row.feature_key, primitive(row.value)])), pendingPayment: true };
  }

  const hasPending = (await db.query("select 1 from payment_requests where user_id=$1 and status='pending' limit 1", [userId])).rows.length > 0;
  return { kind: "expired", active: false, planId: null, planName: "لا يوجد اشتراك فعال", startsAt: null,
    endsAt: trial?.ends_at ?? null, daysRemaining: 0, entitlements: {}, pendingPayment: hasPending };
}

export async function getStudentEntitlements(userId: string) {
  return withIdentity(userId, (db) => resolveAccess(db, userId));
}

export async function canUseFeature(userId: string, featureKey: string) {
  const access = await getStudentEntitlements(userId);
  const value = access.entitlements[featureKey];
  if (!access.active || value === false || value === undefined || value === null) {
    return { allowed: false, access, reason: access.active ? "feature_not_in_plan" : "subscription_expired" } as const;
  }
  return { allowed: true, access, reason: null } as const;
}

function usageScope(access: SubscriptionAccess, featureKey: string) {
  if (featureKey.endsWith("_daily")) {
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Hebron", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    return { type: "daily" as const, key: day };
  }
  if (access.kind === "trial") return { type: "trial" as const, key: access.startsAt ?? "trial" };
  return { type: "subscription" as const, key: access.startsAt ?? access.planId ?? "subscription" };
}

export async function consumeUsage(userId: string, featureKey: string, amount = 1): Promise<UsageReservation> {
  if (!Number.isInteger(amount) || amount < 1) throw new Error("قيمة الاستخدام غير صالحة");
  return withIdentity(userId, async (db) => {
    const access = await resolveAccess(db, userId);
    const rawLimit = access.entitlements[featureKey];
    const limit = typeof rawLimit === "number" ? rawLimit : Number(rawLimit);
    if (!access.active) throw new Error("انتهى اشتراكك");
    if (!Number.isFinite(limit) || limit < amount) throw new Error("هذه الميزة غير متاحة ضمن باقتك");
    const scope = usageScope(access, featureKey);
    const row = (await db.query<{ used: number }>(`insert into subscription_usage(user_id,feature_key,scope_type,scope_key,used)
      values($1,$2,$3,$4,$5)
      on conflict(user_id,feature_key,scope_type,scope_key) do update
        set used=subscription_usage.used+excluded.used,updated_at=now()
        where subscription_usage.used+excluded.used <= $6
      returning used`, [userId, featureKey, scope.type, scope.key, amount, limit])).rows[0];
    if (!row) throw new Error(`استخدمت الحد المتاح (${limit} من ${limit})`);
    return { userId, featureKey, scopeType: scope.type, scopeKey: scope.key, used: Number(row.used), limit };
  });
}

export async function refundUsage(reservation: UsageReservation) {
  await identityDb(reservation.userId).query(`update subscription_usage set used=greatest(0,used-1),updated_at=now()
    where user_id=$1 and feature_key=$2 and scope_type=$3 and scope_key=$4`,
  [reservation.userId, reservation.featureKey, reservation.scopeType, reservation.scopeKey]);
}

export async function getRemainingUsage(userId: string, featureKey: string) {
  return withIdentity(userId, async (db) => {
    const access = await resolveAccess(db, userId);
    const limit = Number(access.entitlements[featureKey] ?? 0);
    const scope = usageScope(access, featureKey);
    const used = Number((await db.query<{ used: number }>(`select used from subscription_usage
      where user_id=$1 and feature_key=$2 and scope_type=$3 and scope_key=$4`, [userId, featureKey, scope.type, scope.key])).rows[0]?.used ?? 0);
    return { used, limit, remaining: Math.max(0, limit - used), scope: scope.type };
  });
}

export async function getUsageSummary(userId: string): Promise<UsageItem[]> {
  const access = await getStudentEntitlements(userId);
  const keys = ["ai_questions_daily", "images_limit", "files_limit", "study_pack_limit", "quiz_limit"];
  const available = keys.filter((key) => typeof access.entitlements[key] === "number");
  return Promise.all(available.map(async (key) => ({ key, ...(await getRemainingUsage(userId, key)) })));
}

export function accessErrorMessage(error: unknown, label: string) {
  const message = error instanceof Error ? error.message : "انتهى اشتراكك";
  if (message.includes("انتهى")) return { error: "انتهى اشتراكك. يمكنك رؤية بياناتك السابقة وتجديد الوصول في أي وقت.", code: "SUBSCRIPTION_EXPIRED", upgradeUrl: "/dashboard/subscription" };
  if (message.includes("الحد") || message.includes("استخدمت")) return { error: `${message} لـ ${label}.`, code: "USAGE_LIMIT_REACHED", upgradeUrl: "/dashboard/subscription" };
  return { error: message, code: "FEATURE_NOT_AVAILABLE", upgradeUrl: "/dashboard/subscription" };
}
