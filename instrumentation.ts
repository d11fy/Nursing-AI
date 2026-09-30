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
}
