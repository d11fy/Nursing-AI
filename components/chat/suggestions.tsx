import { ArrowLeft, MessageSquareText } from "lucide-react";

const SUGGESTIONS = [
  "اشرحلي Heart Failure",
  "شو الفرق بين Hypoglycemia و Hyperglycemia؟",
  "اعمللي سؤال عن Vital Signs",
  "اشرحلي Nursing Process",
];

export function Suggestions({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="mx-auto w-full max-w-xl py-8 text-center">
      <span className="icon-tile mx-auto mb-5 size-14">
        <MessageSquareText className="size-6" />
      </span>
      <p className="eyebrow mb-1.5">ابدأ جلسة جديدة</p>
      <h2 className="text-2xl font-extrabold text-foreground sm:text-3xl">
        اسألني أي سؤال في التمريض
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-muted-foreground">اكتب سؤالك بطريقتك، أو اختر أحد الاقتراحات للبدء.</p>
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className="interactive-card flex min-h-16 cursor-pointer items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-4 text-start text-sm font-medium text-foreground"
            dir="auto"
          >
            <span>{s}</span><ArrowLeft className="size-4 shrink-0 text-muted-foreground" />
          </button>
        ))}
      </div>
    </div>
  );
}
