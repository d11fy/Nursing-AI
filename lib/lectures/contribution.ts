import "server-only";
import { createSystemClient } from "@/lib/db/server";
import { classifyLectureContent } from "@/lib/ai/classification";
import {workerDb} from "@/lib/tutor/db";
import {containsPii} from "@/lib/ai/classifier";
import { logEvent } from "@/lib/log";

/**
 * Runs once a lecture finishes processing. Only acts when the student
 * checked BOTH consent checkboxes at upload time (no silent opt-in). A
 * knowledge_contributions row is written for every run — including an
 * auto-rejected not_nursing classification — for a full audit trail.
 */
export async function submitContributionIfRequested(lectureId: string): Promise<void> {
  const db = createSystemClient();
  const { data: lecture } = await db
    .from("lectures")
    .select("id, user_id, subject_id, contribution_consent_at, contribution_ownership_confirmed_at")
    .eq("id", lectureId)
    .single();
  if (!lecture || !lecture.contribution_consent_at || !lecture.contribution_ownership_confirmed_at) return;

  const existing=await db.from('knowledge_contributions').select('id').eq('lecture_id',lectureId).limit(1);
  if(existing.data?.length)return;
  const sample=process.env.AI_ARCHITECTURE==='legacy'
    ? ((await db.from('lecture_chunks').select('content').eq('lecture_id',lectureId).order('chunk_index',{ascending:true}).limit(10)).data??[]).map(c=>c.content).join('\n\n')
    : (await workerDb.query<{content:string}>(`select c.content from knowledge_chunks c join knowledge_documents d on d.id=c.document_id where d.lecture_id=$1 and d.owner_id=$2 and d.status='ready' order by c.chunk_index limit 10`,[lectureId,lecture.user_id])).rows.map(c=>c.content).join('\n\n');
  if(!sample.trim())return;
  const result=process.env.AI_ARCHITECTURE==='legacy'?await classifyLectureContent(sample):{classification:'uncertain' as const,confidence:0,privacyFlagged:containsPii(sample)};
  const status = result.classification === "not_nursing" ? "rejected" : "pending";

  const { data: contribution, error } = await db
    .from("knowledge_contributions")
    .insert({
      lecture_id: lectureId,
      user_id: lecture.user_id,
      subject_id: lecture.subject_id,
      classification: result.classification,
      classification_confidence: result.confidence,
      privacy_flagged: result.privacyFlagged,
      status,
      reviewed_at: status === "rejected" ? new Date().toISOString() : null,
    })
    .select("id")
    .single();

  if (error || !contribution) {
    console.error("submitContributionIfRequested insert error", error);
    return;
  }

  await db.from("lectures").update({ contribution_status: status }).eq("id", lectureId);
  logEvent(status === "rejected" ? "CONTRIBUTION_REJECTED" : "CONTRIBUTION_SUBMITTED", {
    lectureId,
    classification: result.classification,
    privacyFlagged: result.privacyFlagged,
  });
}
