import React from "react";
import { Server, Globe, ExternalLink, Sparkles } from "lucide-react";
import { DEFAULT_SERVER_URL } from "../services/api";
import { openExternalUrl } from "../services/capacitor";

export function SettingsScreen() {
  return (
    <div className="space-y-4 pb-nav">
      {/* Backend API Configuration */}
      <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
        <div className="flex items-center gap-2 text-xs font-black text-slate-900 dark:text-white">
          <Server className="size-4 text-primary" />
          <span>خادم الـ Backend API</span>
        </div>

        <p className="text-[11px] text-slate-500 leading-relaxed">
          واجهة التطبيق محفوظة داخل الهاتف، والاتصال الآمن بالمنصة مثبت على الخادم الرسمي فقط.
        </p>
        <p className="rounded-xl bg-slate-50 dark:bg-slate-950 px-3 py-2 text-[10px] font-mono text-slate-500" dir="ltr">
          {DEFAULT_SERVER_URL}
        </p>
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
