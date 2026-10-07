import React from "react";

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;

  return (
    <div className="fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 pointer-events-none animate-in fade-in slide-in-from-bottom-4 duration-200">
      <div className="rounded-full bg-slate-900/90 dark:bg-white/90 text-white dark:text-slate-900 px-5 py-2.5 text-xs font-bold shadow-lg backdrop-blur-md">
        {message}
      </div>
    </div>
  );
}
