import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import { canStudentAccessSubject } from "@/lib/subjects";
import { createPracticeExam } from "@/lib/exams/practice-service";
import { getProgressDashboard } from "@/lib/learning-progress/service";
import { accessErrorMessage, canUseFeature } from "@/lib/subscriptions/service";

export async function POST(request: Request) {
  try {
    const profile = await requireProfile();
    const entitlement = await canUseFeature(profile.user_id, "targeted_review_enabled");
    if (!entitlement.allowed && profile.role !== "admin") return NextResponse.json(accessErrorMessage(new Error(entitlement.reason === "subscription_expired" ? "انتهى اشتراكك" : "هذه الميزة غير متاحة ضمن باقتك"), "المراجعة الموجهة"), { status: 403 });
    const body = await request.json().catch(() => ({}));
    const dashboard = await getProgressDashboard(profile.user_id);
    const requested = dashboard.weakTopics.find((topic) =>
      (!body.subjectId || topic.subjectId === body.subjectId) && (!body.topicKey || topic.topicKey === body.topicKey));
    if (!requested?.subjectId) {
      return NextResponse.json({ error: "لا توجد بيانات كافية لموضوع ضعيف يمكن اختباره حاليًا" }, { status: 400 });
    }
    if (!await canStudentAccessSubject(profile.user_id, requested.subjectId) && profile.role !== "admin") {
      return NextResponse.json({ error: "غير مصرح لك بهذه المادة" }, { status: 403 });
    }
    const session = await createPracticeExam({ userId: profile.user_id, subjectId: requested.subjectId,
      topic: requested.topicName, questionCount: Math.min(10, Math.max(3, Number(body.questionCount) || 5)),
      difficulty: "MEDIUM", practiceType: "MIXED", mode: "STUDY" });
    return NextResponse.json({ ...session, targetedTopic: requested.topicName });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر تجهيز المراجعة الموجهة" }, { status: 500 });
  }
}
