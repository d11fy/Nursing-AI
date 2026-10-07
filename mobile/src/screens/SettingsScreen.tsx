import React, { useEffect, useState } from "react";
import { Server, Globe, ExternalLink, RefreshCw, Check, Sparkles } from "lucide-react";
import { getServerUrl, setServerUrl, DEFAULT_SERVER_URL } from "../services/api";
import { openExternalUrl } from "../services/capacitor";

export function SettingsScreen() {
  const [serverUrl, setUrlState] = useState("");
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    getServerUrl().then(setUrlState);
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (serverUrl.trim()) {
      await setServerUrl(serverUrl.trim());
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2000);
    }
  };

  const handleReset = async () => {
    setUrlState(DEFAULT_SERVER_URL);
    await setServerUrl(DEFAULT_SERVER_URL);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  return (
    <div className="space-y-4 pb-nav">
      {/* Backend API Configuration */}
      <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
        <div className="flex items-center gap-2 text-xs font-black text-slate-900 dark:text-white">
          <Server className="size-4 text-primary" />
          <span>خادم الـ Backend API</span>
        </div>

        <p className="text-[11px] text-slate-500 leading-relaxed">
          واجهة هذا التطبيق مدمجة بالكامل ومحفوظة داخل هاتفك (Offline Bundle). الاتصال بالخادم يتم فقط لجلب البيانات واستدعاء الذكاء الاصطناعي.
        </p>

        <form onSubmit={handleSave} className="space-y-3 pt-1">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-600 dark:text-slate-400">
              عنوان الخادم (Server URL)
            </label>
            <input
              type="text"
              value={serverUrl}
              onChange={(e) => setUrlState(e.target.value)}
              placeholder={DEFAULT_SERVER_URL}
              className="w-full h-11 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 text-xs font-mono"
              dir="ltr"
            />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleReset}
              className="px-3 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-[11px] font-bold text-slate-600 dark:text-slate-300 active:scale-95"
            >
              الافتراضي
            </button>
            <div className="flex-1" />
            <button
              type="submit"
              className="flex items-center gap-1.5 px-5 h-10 rounded-xl bg-primary text-white text-xs font-bold active:scale-95 shadow-xs"
            >
              {savedSuccess ? <Check className="size-3.5" /> : null}
              <span>{savedSuccess ? "تم الحفظ" : "حفظ العنوان"}</span>
            </button>
          </div>
        </form>
      </div>

      {/* External Links */}
      <div className="p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-2">
        <h4 className="text-xs font-black text-slate-900 dark:text-white px-1">
          روابط المنصة
        </h4>

        <button
          onClick={() => openExternalUrl("https://nursing.alisohail.tech")}
          className="w-full flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 text-xs font-bold text-slate-700 dark:text-slate-300 active:scale-98 transition-all"
        >
          <div className="flex items-center gap-2">
            <Globe className="size-4 text-primary" />
            <span>موقع Nursing AI على الويب</span>
          </div>
          <ExternalLink className="size-3.5 text-slate-400" />
        </button>
      </div>

      {/* Version Information */}
      <div className="text-center py-6 space-y-1">
        <div className="flex items-center justify-center gap-1.5 text-xs font-black text-primary">
          <Sparkles className="size-3.5" />
          <span>Nursing AI Android App</span>
        </div>
        <p className="text-[11px] text-slate-400 font-mono">
          الإصدار 1.0.0 (Local Mobile Package)
        </p>
      </div>
    </div>
  );
}
