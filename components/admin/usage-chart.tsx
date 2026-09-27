import type { AdminUsageDay } from "@/types/database";

export function UsageChart({ data }: { data: AdminUsageDay[] }) {
  const max = Math.max(1, ...data.map((d) => d.questions_count));

  return (
    <div className="flex h-48 items-end gap-3 sm:gap-4">
      {data.map((d) => {
        const heightPct = (d.questions_count / max) * 100;
        return (
          <div key={d.day} className="flex flex-1 flex-col items-center gap-2">
            <span className="text-xs font-medium text-slate-500">{d.questions_count}</span>
            <div className="flex h-32 w-full items-end">
              <div
                className="w-full rounded-t-md bg-blue-500 transition-all dark:bg-blue-600"
                style={{ height: `${Math.max(4, heightPct)}%` }}
              />
            </div>
            <span className="text-[11px] text-slate-400">
              {new Date(d.day).toLocaleDateString("ar-EG", { weekday: "short" })}
            </span>
          </div>
        );
      })}
    </div>
  );
}
