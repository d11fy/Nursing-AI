import React, { useState } from "react";
import { WifiOff, RefreshCw } from "lucide-react";
import { useNetwork } from "../../context/NetworkContext";

export function OfflineScreen({ onRetry }: { onRetry?: () => void }) {
  const { checkConnection } = useNetwork();
  const [retrying, setRetrying] = useState(false);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      const ok = await checkConnection();
      if (ok && onRetry) {
        onRetry();
      }
    } finally {
      setTimeout(() => setRetrying(false), 600);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 p-6 text-center select-none animate-in fade-in duration-300">
      <div className="flex size-20 items-center justify-center rounded-3xl bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-400 mb-6 shadow-sm">
        <WifiOff className="size-10" />
      </div>

      <h2 className="text-xl font-extrabold text-slate-900 dark:text-white mb-2">
        لا يوجد اتصال بالإنترنت
      </h2>

      <p className="text-sm text-slate-500 max-w-xs mb-8 leading-relaxed">
        تحقق من تشغيل بيانات الهاتف أو الاتصال بشبكة Wi-Fi ثم حاول مجددًا.
      </p>

      <button
        onClick={handleRetry}
        disabled={retrying}
        className="flex items-center justify-center gap-2 w-full max-w-xs h-12 rounded-2xl bg-primary text-white font-bold text-sm shadow-md active:scale-97 transition-all disabled:opacity-60"
      >
        <RefreshCw className={`size-4 ${retrying ? "animate-spin" : ""}`} />
        <span>{retrying ? "جارٍ التحقق..." : "إعادة المحاولة"}</span>
      </button>
    </div>
  );
}
