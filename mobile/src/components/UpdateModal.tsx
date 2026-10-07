import React from "react";
import { Download, AlertCircle, ArrowUpCircle, X } from "lucide-react";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { APP_VERSION_NAME } from "../config/version";
import { resolveOfficialUrl } from "../services/api";

interface UpdateModalProps {
  latestVersion: string;
  latestVersionCode: number;
  releaseNotes: string;
  forceUpdate: boolean;
  apkUrl: string;
  onDismiss?: () => void;
}

export function UpdateModal({
  latestVersion,
  releaseNotes,
  forceUpdate,
  apkUrl,
  onDismiss,
}: UpdateModalProps) {
  const handleUpdate = async () => {
    try {
      const fullUrl = resolveOfficialUrl(apkUrl);

      if (Capacitor.isNativePlatform()) {
        await Browser.open({ url: fullUrl });
      } else {
        window.open(fullUrl, "_blank");
      }
    } catch {
      // Keep the user on the update screen if the published URL is invalid.
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 backdrop-blur-sm animate-fade-in">
      <div 
        className="relative w-full max-w-sm rounded-3xl border border-primary/20 bg-card p-6 shadow-2xl text-foreground text-center animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        {!forceUpdate && onDismiss && (
          <button
            onClick={onDismiss}
            className="absolute left-3 top-3 flex size-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted"
            aria-label="إغلاق"
          >
            <X className="size-4" />
          </button>
        )}

        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm mb-4">
          <ArrowUpCircle className="size-8" />
        </div>

        <h3 className="text-lg font-black text-foreground">
          يتوفر تحديث جديد لـ Nursing AI
        </h3>

        <div className="mt-3 flex items-center justify-center gap-2 text-xs font-semibold">
          <span className="rounded-lg bg-muted px-2.5 py-1 text-muted-foreground">
            الإصدار الحالي: v{APP_VERSION_NAME}
          </span>
          <span className="text-muted-foreground">←</span>
          <span className="rounded-lg bg-primary/15 px-2.5 py-1 text-primary font-bold">
            الجديد: v{latestVersion}
          </span>
        </div>

        {releaseNotes && (
          <div className="mt-4 rounded-xl border border-border/80 bg-background/80 p-3 text-start text-xs leading-relaxed text-muted-foreground max-h-36 overflow-y-auto">
            <p className="font-bold text-foreground mb-1">ملاحظات الإصدار:</p>
            <p className="whitespace-pre-line">{releaseNotes}</p>
          </div>
        )}

        {forceUpdate && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/10 p-2.5 text-xs font-semibold text-destructive text-start">
            <AlertCircle className="size-4 shrink-0" />
            <p>هذا التحديث إلزامي للمتابعة واستخدام ميزات المنصة.</p>
          </div>
        )}

        <div className="mt-6 flex flex-col gap-2.5">
          <button
            onClick={handleUpdate}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-sm font-bold text-primary-foreground shadow-md shadow-primary/25 transition-all hover:bg-primary/95 active:scale-[0.98]"
          >
            <Download className="size-4" />
            تحديث الآن
          </button>

          {!forceUpdate && onDismiss && (
            <button
              onClick={onDismiss}
              className="min-h-12 w-full rounded-2xl border border-border bg-card py-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted"
            >
              لاحقًا
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
