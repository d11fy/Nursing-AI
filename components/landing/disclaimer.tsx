import { ShieldAlert } from "lucide-react";

export function Disclaimer() {
  return (
    <section className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
      <div className="flex items-start gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-900 dark:bg-amber-950/40">
        <ShieldAlert className="mt-0.5 size-6 shrink-0 text-amber-600 dark:text-amber-400" />
        <p className="text-sm leading-relaxed text-amber-900 dark:text-amber-200">
          <span className="font-bold">تنويه: </span>
          Nursing AI منصة تعليمية مخصصة للدراسة ولا تُستخدم للتشخيص الطبي أو اتخاذ القرارات
          العلاجية. في حالات الطوارئ الحقيقية أو المرضى الفعليين، يرجى الرجوع دائمًا للكادر الطبي
          المؤهل واتباع البروتوكولات السريرية المعتمدة.
        </p>
      </div>
    </section>
  );
}
