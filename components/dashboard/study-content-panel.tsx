"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { StudyContentType } from "@/types/database";

const LABELS: Record<StudyContentType, string> = {
  summary: "إنشاء ملخص",
  key_points: "استخراج أهم النقاط",
  quiz: "إنشاء اختبار",
  flashcards: "إنشاء البطاقات",
};

export function StudyContentPanel({
  lectureId,
  type,
  initialContent,
}: {
  lectureId: string;
  type: StudyContentType;
  initialContent: unknown;
}) {
  const [content, setContent] = useState<unknown>(initialContent ?? null);
  const [loading, setLoading] = useState(false);

  async function generate() {
    setLoading(true);
    try {
      const res = await fetch(`/api/lectures/${lectureId}/content`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      // A gateway/proxy error (e.g. the request timed out) returns an HTML/text
      // body, not JSON — fall back to a clean message instead of crashing on parse.
      const data = await res.json().catch(() => ({}) as { content?: unknown; error?: string });
      if (!res.ok) throw new Error(data.error || "تعذر إنشاء المحتوى، حاول مرة أخرى");
      setContent(data.content);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر إنشاء المحتوى");
    } finally {
      setLoading(false);
    }
  }

  if (!content) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border p-10 text-center">
        <Sparkles className="size-6 text-muted-foreground" />
        <Button onClick={generate} disabled={loading}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : null}
          {LABELS[type]}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={generate} disabled={loading}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : null}
          إعادة الإنشاء
        </Button>
      </div>
      <ContentRenderer type={type} content={content} />
    </div>
  );
}

function ContentRenderer({ type, content }: { type: StudyContentType; content: unknown }) {
  const data = (content ?? {}) as Record<string, unknown>;
  if (type === "summary") {
    return (
      <div className="space-y-4 text-sm leading-7">
        {typeof data.overview === "string" && <p dir="auto" className="[unicode-bidi:plaintext]">{data.overview}</p>}
        <Section title="أهم المفاهيم" items={data.key_concepts} />
        <Section title="Medical Terminology" items={data.terminology} />
        <Section title="معلومات يجب فهمها" items={data.must_know} />
        <Section title="نقاط تحتاج حفظ" items={data.memorize} />
        <Section title="نقاط مهمة للامتحان" items={data.exam_points} />
      </div>
    );
  }
  if (type === "key_points") return <Section title="" items={data.points} />;
  if (type === "quiz") return <QuizRenderer questions={Array.isArray(data.questions) ? data.questions as Record<string, unknown>[] : []} />;
  return <FlashcardsRenderer cards={Array.isArray(data.cards) ? data.cards as Record<string, unknown>[] : []} />;
}

function Section({ title, items }: { title: string; items: unknown }) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <div className="space-y-1.5">
      {title && <h3 dir="auto" className="font-semibold text-foreground [unicode-bidi:plaintext]">{title}</h3>}
      <ul className="list-inside list-disc space-y-1 text-sm leading-6">
        {items.map((item, i) => <li dir="auto" className="[unicode-bidi:plaintext]" key={i}>{String(item)}</li>)}
      </ul>
    </div>
  );
}

function QuizRenderer({ questions }: { questions: Record<string, unknown>[] }) {
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const [selected, setSelected] = useState<Record<number, string>>({});
  if (!questions.length) return <p className="text-sm text-muted-foreground">تعذر إنشاء أسئلة من هذه المحاضرة.</p>;

  return (
    <div className="space-y-4">
      {questions.map((q, i) => {
        const options = Array.isArray(q.options) ? q.options.map(String) : [];
        const answer = String(q.answer ?? "");
        return (
          <div key={i} className="space-y-2 rounded-xl border border-border p-4">
            <p dir="auto" className="font-medium [unicode-bidi:plaintext]">{i + 1}. {String(q.question ?? "")}</p>
            {options.length > 0 ? (
              <div className="space-y-1.5">
                {options.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => { setSelected((s) => ({ ...s, [i]: opt })); setRevealed((r) => ({ ...r, [i]: true })); }}
                    dir="auto"
                    className={`block w-full rounded-lg border px-3 py-2 text-start text-sm [unicode-bidi:plaintext] transition-colors ${
                      revealed[i] && opt === answer ? "border-green-500 bg-green-50 dark:bg-green-950" :
                      revealed[i] && opt === selected[i] ? "border-red-500 bg-red-50 dark:bg-red-950" : "border-border hover:bg-muted"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            ) : (
              <button onClick={() => setRevealed((r) => ({ ...r, [i]: true }))} className="text-sm text-blue-600 hover:underline">
                إظهار الإجابة
              </button>
            )}
            {revealed[i] && (
              <div className="rounded-lg bg-muted p-2 text-sm">
                <p dir="auto" className="font-medium [unicode-bidi:plaintext]">الإجابة الصحيحة: {answer}</p>
                {typeof q.explanation === "string" && <p dir="auto" className="text-muted-foreground [unicode-bidi:plaintext]">{q.explanation}</p>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function FlashcardsRenderer({ cards }: { cards: Record<string, unknown>[] }) {
  const [flipped, setFlipped] = useState<Record<number, boolean>>({});
  if (!cards.length) return <p className="text-sm text-muted-foreground">تعذر إنشاء بطاقات من هذه المحاضرة.</p>;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {cards.map((card, i) => (
        <button
          key={i}
          onClick={() => setFlipped((f) => ({ ...f, [i]: !f[i] }))}
          dir="auto"
          className="flex min-h-28 flex-col items-center justify-center rounded-xl border border-border p-4 text-center text-sm [unicode-bidi:plaintext] hover:bg-muted"
        >
          {flipped[i] ? String(card.back ?? "") : String(card.front ?? "")}
        </button>
      ))}
    </div>
  );
}
