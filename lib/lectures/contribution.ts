import "server-only";
import { createSystemClient } from "@/lib/db/server";
import { classifyLectureContent } from "@/lib/ai/classification";
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

  const { data: chunks } = await db
    .from("lecture_chunks")
    .select("content")
    .eq("lecture_id", lectureId)
    .order("chunk_index", { ascending: true })
    .limit(10);
  const sample = (chunks ?? []).map((c) => c.content).join("\n\n").trim();
  if (!sample) return;

  const result = await classifyLectureContent(sample);
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
