import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import { canStudentAccessSubject } from "@/lib/subjects";
import { createPracticeExam } from "@/lib/exams/practice-service";
import { accessErrorMessage, canUseFeature } from "@/lib/subscriptions/service";

export async function POST(request: Request) {
  try {
    const profile = await requireProfile();
    const entitlement = await canUseFeature(profile.user_id, "quiz_enabled");
    if (!entitlement.allowed && profile.role !== "admin") return NextResponse.json(accessErrorMessage(new Error(entitlement.reason === "subscription_expired" ? "انتهى اشتراكك" : "هذه الميزة غير متاحة ضمن باقتك"), "الاختبارات"), { status: 403 });
    const body = await request.json();
    const { subjectId, topic, questionCount, difficulty, practiceType, mode } = body;

    if (!subjectId) {
      return NextResponse.json({ error: "المادة مطلوبة" }, { status: 400 });
    }

    const hasAccess = await canStudentAccessSubject(profile.user_id, subjectId);
    if (!hasAccess && profile.role !== "admin") {
      return NextResponse.json({ error: "غير مصرح لك بالوصول لهذه المادة" }, { status: 403 });
    }

    const examSession = await createPracticeExam({
      userId: profile.user_id,
      subjectId,
      topic: topic || undefined,
      questionCount: Number(questionCount) || 10,
      difficulty: difficulty || "MEDIUM",
      practiceType: practiceType || "MIXED",
      mode: mode || "STUDY",
    });

    return NextResponse.json(examSession);
  } catch (err) {
    console.error("[PracticeExamAPI] generate error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "تعذر تجهيز الامتحان التدريبي" },
      { status: 500 }
    );
  }
}
