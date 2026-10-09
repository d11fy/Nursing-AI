import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import { canStudentAccessSubject } from "@/lib/subjects";
import { createPracticeExam } from "@/lib/exams/practice-service";
import { getProgressDashboard } from "@/lib/learning-progress/service";
import { requireFeature, usageErrorResponse, usageMeter } from "@/lib/subscriptions/service";

export async function POST(request: Request) {
  let profile;
  try {
    profile = await requireProfile();
  } catch {
    return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  }
  const isAdmin = profile.role === "admin";
  // A targeted review is a generated quiz, so it uses the same quiz_limit.
  const usage = usageMeter(profile.user_id, "quiz_limit");
  try {
    if (!isAdmin) await requireFeature(profile.user_id, "targeted_review_enabled");
    const body = await request.json().catch(() => ({}));
    const dashboard = await getProgressDashboard(profile.user_id);
    const requested = dashboard.weakTopics.find((topic) =>
      (!body.subjectId || topic.subjectId === body.subjectId) && (!body.topicKey || topic.topicKey === body.topicKey));
    if (!requested?.subjectId) {
      return NextResponse.json({ error: "لا توجد بيانات كافية لموضوع ضعيف يمكن اختباره حاليًا" }, { status: 400 });
    }
    if (!await canStudentAccessSubject(profile.user_id, requested.subjectId) && !isAdmin) {
      return NextResponse.json({ error: "غير مصرح لك بهذه المادة" }, { status: 403 });
    }
    if (!isAdmin) {
      await requireFeature(profile.user_id, "quiz_enabled");
      await usage.meter();
    }
    const session = await createPracticeExam({ userId: profile.user_id, subjectId: requested.subjectId,
      topic: requested.topicName, questionCount: Math.min(10, Math.max(3, Number(body.questionCount) || 5)),
      difficulty: "MEDIUM", practiceType: "MIXED", mode: "STUDY" });
    await usage.commit({ attemptId: session.attemptId });
    return NextResponse.json({ ...session, targetedTopic: requested.topicName });
  } catch (error) {
    await usage.release();
    const denied = usageErrorResponse(error, "المراجعة الموجهة");
    if (denied) return denied;
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر تجهيز المراجعة الموجهة" }, { status: 500 });
  }
}
