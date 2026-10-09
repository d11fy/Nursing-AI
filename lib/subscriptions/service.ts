import "server-only";

import type { PoolClient } from "pg";
import { withIdentity, identityDb, workerDb } from "@/lib/tutor/db";
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
      quiz_limit: map.get("trial_quiz_total") ?? 3,
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

export class UsageError extends Error {
  constructor(public readonly code: "SUBSCRIPTION_EXPIRED" | "FEATURE_NOT_AVAILABLE" | "USAGE_LIMIT_REACHED" | "REQUEST_IN_PROGRESS", message: string) {
    super(message);
    this.name = "UsageError";
  }
}

export function isUsageError(error: unknown): error is UsageError {
  return error instanceof UsageError;
}

type ReservationRow = { id: string; feature_key: string; scope_type: UsageReservation["scopeType"]; scope_key: string; amount: number;
  status: UsageReservation["status"]; result_ref: Record<string, unknown> | null };

function toReservation(userId: string, row: ReservationRow, used: number, limit: number, replayed: boolean): UsageReservation {
  return { id: row.id, userId, featureKey: row.feature_key, scopeType: row.scope_type, scopeKey: row.scope_key,
    amount: Number(row.amount), status: row.status, replayed, resultRef: row.result_ref, used, limit };
}

/**
 * Checks the entitlement and atomically adds `amount` to the counter the
 * entitlement service enforces. Concurrent callers cannot both take the last
 * unit: the conditional upsert only increments while used + amount <= limit.
 * With an idempotency key, a repeat of an in-flight or completed operation
 * returns the original reservation (replayed=true) without consuming again.
 */
export async function reserveUsage(userId: string, featureKey: string,
  options: { amount?: number; idempotencyKey?: string | null } = {}): Promise<UsageReservation> {
  const amount = options.amount ?? 1;
  if (!Number.isInteger(amount) || amount < 1) throw new Error("قيمة الاستخدام غير صالحة");
  const key = options.idempotencyKey ?? null;
  const attempt = () => withIdentity(userId, async (db) => {
    await reconcileUserReservations(db, userId);
    const access = await resolveAccess(db, userId);
    if (!access.active) throw new UsageError("SUBSCRIPTION_EXPIRED", "انتهى اشتراكك");
    const rawLimit = access.entitlements[featureKey];
    const limit = typeof rawLimit === "number" ? rawLimit : Number(rawLimit);
    if (rawLimit === null || rawLimit === undefined || typeof rawLimit === "boolean" || !Number.isFinite(limit))
      throw new UsageError("FEATURE_NOT_AVAILABLE", "هذه الميزة غير متاحة ضمن باقتك");
    let previous: ReservationRow | undefined;
    if (key) {
      previous = (await db.query<ReservationRow>(`select id,feature_key,scope_type,scope_key,amount,status,result_ref
        from usage_reservations where user_id=$1 and feature_key=$2 and idempotency_key=$3 for update`, [userId, featureKey, key])).rows[0];
      if (previous && previous.status !== "released") return toReservation(userId, previous, 0, limit, true);
    }
    if (limit < amount) throw new UsageError("USAGE_LIMIT_REACHED", `استخدمت الحد المتاح (${Math.max(0, limit)} من ${Math.max(0, limit)})`);
    const scope = usageScope(access, featureKey);
    const counter = (await db.query<{ used: number }>(`insert into subscription_usage(user_id,feature_key,scope_type,scope_key,used)
      values($1,$2,$3,$4,$5)
      on conflict(user_id,feature_key,scope_type,scope_key) do update
        set used=subscription_usage.used+excluded.used,updated_at=now()
        where subscription_usage.used+excluded.used <= $6
      returning used`, [userId, featureKey, scope.type, scope.key, amount, limit])).rows[0];
    if (!counter) throw new UsageError("USAGE_LIMIT_REACHED", `استخدمت الحد المتاح (${limit} من ${limit})`);
    const row = previous
      ? (await db.query<ReservationRow>(`update usage_reservations set id=gen_random_uuid(),status='reserved',lease_expires_at=now()+interval '30 minutes',work_started_at=null,scope_type=$2,scope_key=$3,amount=$4,result_ref=null,updated_at=now()
          where id=$1 returning id,feature_key,scope_type,scope_key,amount,status,result_ref`, [previous.id, scope.type, scope.key, amount])).rows[0]
      : (await db.query<ReservationRow>(`insert into usage_reservations(user_id,feature_key,scope_type,scope_key,amount,idempotency_key,lease_expires_at)
          values($1,$2,$3,$4,$5,$6,now()+interval '30 minutes') returning id,feature_key,scope_type,scope_key,amount,status,result_ref`,
          [userId, featureKey, scope.type, scope.key, amount, key])).rows[0];
    return toReservation(userId, row, Number(counter.used), limit, false);
  });
  try {
    return await attempt();
  } catch (error) {
    // Two first-time requests with one key: the loser's insert hits the unique
    // index, its counter increment rolls back, and the retry sees the winner.
    if (key && (error as { code?: string })?.code === "23505") return attempt();
    throw error;
  }
}

/** Marks a reservation as delivered. Optional resultRef lets a retried request return the same result. */
export async function commitUsage(reservation: UsageReservation, resultRef?: Record<string, unknown>) {
  if (reservation.replayed) return;
  await identityDb(reservation.userId).query(`update usage_reservations set status='committed',result_ref=coalesce($2::jsonb,result_ref),updated_at=now()
    where id=$1 and status='reserved'`, [reservation.id, resultRef ? JSON.stringify(resultRef) : null]);
}

/**
 * Returns reserved units after a failure that happened before the costly work
 * was delivered. Only a reserved (not committed) reservation is released, and
 * only once, so retries and duplicate error handlers cannot over-refund.
 */
export async function releaseUsage(reservation: UsageReservation) {
  if (reservation.replayed) return;
  await withIdentity(reservation.userId, async (db) => {
    const released = (await db.query<{ amount: number; scope_type: string; scope_key: string; feature_key: string }>(
      `update usage_reservations set status='released',updated_at=now() where id=$1 and status='reserved'
       returning amount,scope_type,scope_key,feature_key`, [reservation.id])).rows[0];
    if (!released) return;
    await db.query(`update subscription_usage set used=greatest(0,used-$5),updated_at=now()
      where user_id=$1 and feature_key=$2 and scope_type=$3 and scope_key=$4`,
    [reservation.userId, released.feature_key, released.scope_type, released.scope_key, Number(released.amount)]);
  });
}

/**
 * Lazily reserves usage for flows that only cost money on a cache miss: pass
 * `meter` to the generator, then `commit` on success or `release` on failure.
 */
export class ReplayedUsage extends Error {
  constructor(public readonly reservation: UsageReservation) { super("replayed request"); this.name = "ReplayedUsage"; }
}

/**
 * `replay: "stop"` (default) throws ReplayedUsage for a repeated idempotency
 * key so the caller returns the original result instead of generating again;
 * `"proceed"` lets the work continue without a new charge.
 */
export function usageMeter(userId: string, featureKey: string, idempotencyKey?: string | null, replay: "stop" | "proceed" = "stop") {
  let reservation: UsageReservation | undefined;
  return {
    meter: async () => {
      reservation ??= await reserveUsage(userId, featureKey, { idempotencyKey });
      if (reservation.replayed && replay === "stop") {
        if (reservation.resultRef?.interrupted) throw new UsageError("REQUEST_IN_PROGRESS", "انقطع الطلب السابق؛ تواصل مع الدعم لتسوية الحصة قبل إعادة التوليد");
        throw new ReplayedUsage(reservation);
      }
      if (!reservation.replayed) await markUsageStarted(reservation);
    },
    commit: async (resultRef?: Record<string, unknown>) => { if (reservation) await commitUsage(reservation, resultRef); },
    release: async () => { if (reservation) await releaseUsage(reservation).catch(() => undefined); },
  };
}

export const METERED_FEATURES = ["ai_questions_daily", "files_limit", "images_limit", "quiz_limit", "study_pack_limit"] as const;
export type MeteredFeature = typeof METERED_FEATURES[number];

/**
 * Admin correction of the counter the entitlement service enforces, in the
 * student's current scope (today for daily limits, otherwise the active trial
 * or subscription period). History rows (usage_logs, usage_reservations) are
 * kept; the before/after values and reason are written to admin_audit_logs in
 * the same transaction.
 */
export async function adjustStudentUsage(input: { adminId: string; userId: string; features: readonly MeteredFeature[];
  newValue?: number; reason: string }) {
  const newValue = input.newValue ?? 0;
  if (!Number.isInteger(newValue) || newValue < 0) throw new Error("قيمة الاستخدام غير صالحة");
  const reason = input.reason.trim();
  if (reason.length < 3) throw new Error("اكتب سبب التعديل");
  return withIdentity(input.adminId, async (db) => {
    const admin = (await db.query<{ role: string }>("select role from profiles where user_id=$1 and status='active'", [input.adminId])).rows[0];
    if (admin?.role !== "admin") throw new Error("غير مصرح");
    const access = await resolveAccess(db, input.userId);
    const changes = [];
    for (const featureKey of input.features) {
      const scope = usageScope(access, featureKey);
      const previous = Number((await db.query<{ used: number }>(`select used from subscription_usage
        where user_id=$1 and feature_key=$2 and scope_type=$3 and scope_key=$4 for update`,
      [input.userId, featureKey, scope.type, scope.key])).rows[0]?.used ?? 0);
      await db.query(`insert into subscription_usage(user_id,feature_key,scope_type,scope_key,used) values($1,$2,$3,$4,$5)
        on conflict(user_id,feature_key,scope_type,scope_key) do update set used=excluded.used,updated_at=now()`,
      [input.userId, featureKey, scope.type, scope.key, newValue]);
      changes.push({ feature: featureKey, scopeType: scope.type, scopeKey: scope.key, previousValue: previous, newValue });
    }
    await db.query("insert into admin_audit_logs(event_type,admin_id,target_user_id,metadata) values('USAGE_ADJUSTED',$1,$2,$3::jsonb)",
      [input.adminId, input.userId, JSON.stringify({ reason, changes })]);
    return changes;
  });
}

/** Back-compatible names used by existing callers. */
export const consumeUsage = (userId: string, featureKey: string, amount = 1) => reserveUsage(userId, featureKey, { amount });
export const refundUsage = releaseUsage;

/** Reads an optional Idempotency-Key header; malformed values are ignored rather than trusted. */
export function readIdempotencyKey(request: Request, prefix: string) {
  const raw = request.headers.get("idempotency-key")?.trim();
  if (!raw || !/^[A-Za-z0-9:_-]{8,128}$/.test(raw)) return null;
  return `${prefix}:${raw}`;
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
  const upgradeUrl = "/dashboard/subscription";
  if (error instanceof UsageError && error.code === "REQUEST_IN_PROGRESS")
    return { error: error.message, code: error.code };
  const message = error instanceof Error ? error.message : "انتهى اشتراكك";
  if (message.includes("انتهى")) return { error: "انتهى اشتراكك. يمكنك رؤية بياناتك السابقة وتجديد الوصول في أي وقت.", code: "SUBSCRIPTION_EXPIRED", upgradeUrl };
  if (message.includes("الحد") || message.includes("استخدمت")) return { error: `${message} لـ ${label}.`, code: "USAGE_LIMIT_REACHED", upgradeUrl };
  return { error: message, code: "FEATURE_NOT_AVAILABLE", upgradeUrl };
}

/** Converts a usage failure to the shared JSON error contract; returns null for unrelated errors. */
export function usageErrorResponse(error: unknown, label: string) {
  if (!(error instanceof UsageError)) return null;
  return Response.json(accessErrorMessage(error, label), { status: error.code === "REQUEST_IN_PROGRESS" ? 409 : 403 });
}

/** Rejects a request before any storage or AI work when an entitlement is off. */
export async function requireFeature(userId: string, featureKey: string) {
  const access = await canUseFeature(userId, featureKey);
  if (!access.allowed) throw new UsageError(access.reason === "subscription_expired" ? "SUBSCRIPTION_EXPIRED" : "FEATURE_NOT_AVAILABLE",
    access.reason === "subscription_expired" ? "انتهى اشتراكك" : "هذه الميزة غير متاحة ضمن باقتك");
  return access.access;
}

/** Fence the start of costly work; expired reservations cannot start new work. */
export async function markUsageStarted(reservation: UsageReservation, resultRef?: Record<string,unknown>) {
  if (reservation.replayed) return;
  const row=await identityDb(reservation.userId).query(`update usage_reservations set work_started_at=now(),
    lease_expires_at=now()+interval '2 hours',result_ref=coalesce($2::jsonb,result_ref)
    where id=$1 and status='reserved' and lease_expires_at>now() returning id`,[reservation.id,resultRef?JSON.stringify(resultRef):null]);
  if (!row.rows.length) throw new Error("انتهت مهلة الطلب قبل بدء المعالجة؛ أعد المحاولة");
}
async function reconcileUserReservations(db: PoolClient, userId: string) {
  const rows=(await db.query<{id:string;feature_key:string;scope_type:string;scope_key:string;amount:number;work_started_at:string|null;result_ref:Record<string,unknown>|null}>(
    "select * from usage_reservations where user_id=$1 and status='reserved' and lease_expires_at<now() for update",[userId])).rows;
  for (const row of rows) {
    if (row.work_started_at) {
      // Unknown provider outcome is never refunded blindly. A retained result
      // can be replayed; an uncertain result is flagged for a staff adjustment.
      await db.query("update usage_reservations set status='committed',result_ref=coalesce(result_ref,'{\"interrupted\":true}'::jsonb),updated_at=now() where id=$1",[row.id]);
    } else {
      await db.query("update usage_reservations set status='released',updated_at=now() where id=$1",[row.id]);
      await db.query(`update subscription_usage set used=greatest(0,used-$5) where user_id=$1 and feature_key=$2 and scope_type=$3 and scope_key=$4`,
        [userId,row.feature_key,row.scope_type,row.scope_key,row.amount]);
    }
  }
}
export async function reconcileExpiredUsage() {
  const users=(await workerDb.query<{user_id:string}>("select distinct user_id from usage_reservations where status='reserved' and lease_expires_at<now() limit 100")).rows;
  for (const user of users) await withIdentity(user.user_id,db=>reconcileUserReservations(db,user.user_id));
  return users.length;
}
