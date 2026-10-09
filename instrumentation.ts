// Next.js boot hook (stable since Next 15, runs once per server instance).
// Starts the lecture retention sweep in-process — no external cron/queue —
// using the same pg_try_advisory_lock pattern as document/lecture ingestion,
// so it stays safe even if this app ever runs multiple replicas.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { runLectureCleanupSweep } = await import("@/lib/lectures/retention");
  const sweep = () => runLectureCleanupSweep().catch((err) => console.error("runLectureCleanupSweep error", err));
  const HOUR_MS = 60 * 60 * 1000;

  sweep();
  setInterval(sweep, HOUR_MS).unref();
  const { runKnowledgeJobs }=await import('@/lib/tutor/ingestion');
  const {runExamJobs}=await import('@/lib/tutor/exam-jobs');
  let running=false;
  const processJobs=async()=>{if(running)return;running=true;try{await runKnowledgeJobs();await runExamJobs();}catch{console.error('Knowledge worker unavailable');}finally{running=false;}};
  const timer=setInterval(()=>void processJobs(),15_000);timer.unref();
  // Email delivery also recovers messages whose lease expired after a crash.
  // Claims use FOR UPDATE SKIP LOCKED, so several replicas can run this safely.
  const { processEmailQueue }=await import('@/lib/email-queue');
  let mailing=false;
  const processEmail=async()=>{if(mailing)return;mailing=true;try{await processEmailQueue(20);}catch{console.error('Email worker unavailable');}finally{mailing=false;}};
  const { reconcileExpiredUsage } = await import('@/lib/subscriptions/service');
  const usageTimer=setInterval(()=>void reconcileExpiredUsage().catch(()=>console.error('Usage recovery unavailable')),60_000);usageTimer.unref();
  const mailTimer=setInterval(()=>void processEmail(),60_000);mailTimer.unref();
}
