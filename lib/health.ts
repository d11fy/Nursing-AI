import "server-only";

import { timingSafeEqual } from "node:crypto";
import { workerDb } from "@/lib/tutor/db";
import { EMAIL_MAX_ATTEMPTS } from "@/lib/email-queue";

export type HealthLevel = "ok" | "degraded" | "down";

export interface HealthReport {
  status: HealthLevel;
  checkedAt: string;
  checks: {
    database: { status: HealthLevel; latencyMs: number | null };
    ai: { status: HealthLevel; configured: boolean; callsLastHour: number; failuresLastHour: number; lastSuccessAt: string | null };
    emailQueue: { status: HealthLevel; pending: number; failedRetrying: number; failedFinal: number; stuckSending: number; oldestPendingMinutes: number | null };
    jobs: { status: HealthLevel; knowledgeQueued: number; knowledgeFailed: number; knowledgeStaleLeases: number; examQueued: number; oldestQueuedMinutes: number | null };
  };
}

const worst = (levels: HealthLevel[]): HealthLevel => levels.includes("down") ? "down" : levels.includes("degraded") ? "degraded" : "ok";

/**
 * Operational health. AI availability is inferred from recent real calls
 * (usage_logs) instead of making paid test requests on every probe.
 */
export async function checkHealth(): Promise<HealthReport> {
  const started = Date.now();
  let latencyMs: number | null = null;
  try {
    await workerDb.query("select 1");
    latencyMs = Date.now() - started;
  } catch {
    const down = { status: "down" as const };
    return {
      status: "down", checkedAt: new Date().toISOString(),
      checks: {
        database: { status: "down", latencyMs: null },
        ai: { ...down, configured: Boolean(process.env.OPENAI_API_KEY), callsLastHour: 0, failuresLastHour: 0, lastSuccessAt: null },
        emailQueue: { ...down, pending: 0, failedRetrying: 0, failedFinal: 0, stuckSending: 0, oldestPendingMinutes: null },
        jobs: { ...down, knowledgeQueued: 0, knowledgeFailed: 0, knowledgeStaleLeases: 0, examQueued: 0, oldestQueuedMinutes: null },
      },
    };
  }

  const [ai, mail, jobs] = await Promise.all([
    workerDb.query<{ calls: number; failures: number; last_success: string | null }>(`select
      count(*) filter (where created_at > now()-interval '1 hour')::int calls,
      count(*) filter (where created_at > now()-interval '1 hour' and success=false)::int failures,
      max(created_at) filter (where success) last_success
      from usage_logs where created_at > now()-interval '7 days'`),
    workerDb.query<{ pending: number; retrying: number; final: number; stuck: number; oldest: number | null }>(`select
      count(*) filter (where status='pending')::int pending,
      count(*) filter (where status='failed' and retry_count<$1)::int retrying,
      count(*) filter (where status='failed' and retry_count>=$1)::int final,
      count(*) filter (where status='sending' and coalesce(lease_expires_at,updated_at+interval '2 minutes')<now())::int stuck,
      extract(epoch from now()-min(created_at) filter (where status='pending'))/60 oldest
      from email_logs where created_at > now()-interval '30 days'`, [EMAIL_MAX_ATTEMPTS]),
    workerDb.query<{ queued: number; failed: number; stale: number; exams: number; oldest: number | null }>(`select
      (select count(*) from knowledge_jobs where status='queued')::int queued,
      (select count(*) from knowledge_jobs where status='failed')::int failed,
      (select count(*) from knowledge_jobs where status='running' and lease_until<now())::int stale,
      (select count(*) from knowledge_exam_jobs where status='queued')::int exams,
      (select extract(epoch from now()-min(available_at))/60 from knowledge_jobs where status='queued') oldest`),
  ]);

  const a = ai.rows[0], m = mail.rows[0], j = jobs.rows[0];
  const configured = Boolean(process.env.OPENAI_API_KEY);
  // Only a database outage makes the service "down" (HTTP 503); AI or queue
  // problems are "degraded" so a readiness probe does not restart a server
  // that can still serve students their existing data.
  const aiStatus: HealthLevel = !configured || (a.calls >= 5 && a.failures / a.calls > 0.5) ? "degraded" : "ok";
  const oldestPending = m.oldest == null ? null : Math.round(Number(m.oldest));
  const mailStatus: HealthLevel = m.stuck > 0 || (oldestPending ?? 0) > 30 ? "degraded" : "ok";
  const oldestJob = j.oldest == null ? null : Math.round(Number(j.oldest));
  const jobStatus: HealthLevel = j.stale > 0 || (oldestJob ?? 0) > 30 ? "degraded" : "ok";
  const databaseStatus: HealthLevel = (latencyMs ?? 0) > 1500 ? "degraded" : "ok";

  return {
    status: worst([databaseStatus, aiStatus, mailStatus, jobStatus]),
    checkedAt: new Date().toISOString(),
    checks: {
      database: { status: databaseStatus, latencyMs },
      ai: { status: aiStatus, configured, callsLastHour: Number(a.calls), failuresLastHour: Number(a.failures),
        lastSuccessAt: a.last_success },
      emailQueue: { status: mailStatus, pending: Number(m.pending), failedRetrying: Number(m.retrying), failedFinal: Number(m.final),
        stuckSending: Number(m.stuck), oldestPendingMinutes: oldestPending },
      jobs: { status: jobStatus, knowledgeQueued: Number(j.queued), knowledgeFailed: Number(j.failed),
        knowledgeStaleLeases: Number(j.stale), examQueued: Number(j.exams), oldestQueuedMinutes: oldestJob },
    },
  };
}

/** Bearer CRON_SECRET lets an external monitor read the detailed report without an admin session. */
export function hasMonitorSecret(request: Request) {
  const secret = process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || secret.length < 16 || supplied.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(secret));
}
