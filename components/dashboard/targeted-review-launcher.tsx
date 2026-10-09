"use client";

import { useState } from "react";
import { Loader2, Target } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PracticeExamRunner } from "@/components/dashboard/practice-exam-runner";
import type { StudentPracticeQuestion } from "@/lib/exams/practice-service";

type Session = { attemptId: string; mode: "STUDY" | "EXAM"; practiceType: string; questions: StudentPracticeQuestion[]; targetedTopic: string };

export function TargetedReviewLauncher({ subjectId, topicKey, compact = false }: { subjectId?: string; topicKey?: string; compact?: boolean }) {
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  async function start() {
    setLoading(true);
    try {
      const response = await fetch("/api/learning-progress/targeted-review", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subjectId, topicKey, questionCount: 5 }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تعذر تجهيز المراجعة");
      setSession(data);
    } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر تجهيز المراجعة"); }
    finally { setLoading(false); }
  }
  if (session) return <div className="col-span-full"><p className="mb-3 text-sm font-semibold">مراجعة موجهة: <bdi dir="auto">{session.targetedTopic}</bdi></p>
    <PracticeExamRunner {...session} onClose={() => setSession(null)} /></div>;
  return <Button onClick={start} disabled={loading} variant={compact ? "outline" : "default"} className="min-h-11 w-full gap-2 sm:w-auto">
    {loading ? <Loader2 className="size-4 animate-spin" /> : <Target className="size-4" />}اختبرني على أضعف مواضيعي
  </Button>;
}

