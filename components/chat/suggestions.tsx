const SUGGESTIONS = [
  "اشرحلي Heart Failure",
  "شو الفرق بين Hypoglycemia و Hyperglycemia؟",
  "اعمللي سؤال عن Vital Signs",
  "اشرحلي Nursing Process",
];

export function Suggestions({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <h2 className="text-xl font-bold text-slate-900 dark:text-white">
        اسألني أي سؤال في التمريض
      </h2>
      <div className="mt-6 grid gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className="rounded-xl border border-border bg-card px-4 py-3 text-right text-sm text-slate-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 dark:text-slate-200 dark:hover:bg-blue-950/40"
            dir="rtl"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
