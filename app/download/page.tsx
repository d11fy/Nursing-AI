import {
  Download,
  Smartphone,
  ShieldCheck,
  HardDrive,
  Calendar,
  Lock,
  Zap,
  FileCheck2,
  AlertTriangle,
} from "lucide-react";
import { LandingHeader } from "@/components/landing/header";
import { LandingFooter } from "@/components/landing/footer";
import { currentProfile } from "@/lib/auth/session";
import { stat } from "node:fs/promises";
import path from "node:path";
import { getPublicReleaseInfo } from "@/lib/version/app-version";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "تحميل تطبيق Nursing AI للأندرويد",
  description:
    "حمّل تطبيق Nursing AI لهواتف الأندرويد من الموقع الرسمي: المساعد التعليمي وحزم الدراسة والاختبارات وتتبع التقدم.",
  alternates: { canonical: "/download" },
};

async function previewAvailable(url: string) {
  if (!url.startsWith("/downloads/")) return false;
  try {
    return (await stat(path.join(process.cwd(), "public", url))).isFile();
  } catch {
    return false;
  }
}

export default async function DownloadPage() {
  const profile = await currentProfile();
  const dashboardHref = profile
    ? profile.role === "admin"
      ? "/admin"
      : "/dashboard"
    : null;
  // One source of truth: the published stable release from settings, checked
  // against the file the server actually serves.
  const versionInfo = await getPublicReleaseInfo();
  const filename = `nursing-ai-v${versionInfo.latest_version}.apk`;
  const downloadable = versionInfo.integrity === "verified" || versionInfo.integrity === "unpublished";
  const preview = versionInfo.preview?.enabled && (await previewAvailable(versionInfo.preview.apk_url)) ? versionInfo.preview : null;

  const formattedDate = new Date(versionInfo.published_at).toLocaleDateString(
    "ar-EG",
    {
      year: "numeric",
      month: "long",
      day: "numeric",
    },
  );

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <LandingHeader dashboardHref={dashboardHref} />

      <main className="flex-1">
        <aside className="mx-auto max-w-5xl p-5 text-sm leading-7">لمستخدمي Preview 1.1.1: التطبيق الرسمي يُثبّت كتطبيق مستقل. حسابك وموادك وتقدمك تبقى على الخادم. سجّل الخروج من Preview ثم ادخل إلى الرسمي، أو استخدم خيار «نقل الجهاز» داخل شاشة الدخول إذا تعذر الوصول للجهاز السابق. <a className="text-primary underline" href="/support">المساعدة</a></aside>
        {/* Hero Section */}
        <section className="relative overflow-hidden border-b border-border bg-gradient-to-b from-primary/[0.04] via-background to-background py-16 sm:py-24">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <div className="text-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-1.5 text-xs font-bold text-primary">
                <Smartphone className="size-4" />
                التطبيق الرسمي لأندرويد — الإصدار المستقر
              </div>

              <h1 className="mt-6 text-balance text-3xl font-black tracking-tight text-foreground sm:text-5xl lg:text-6xl">
                تطبيق <span className="text-primary">Nursing AI</span> بين يديك
              </h1>

              <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg">
                ادرس من محاضراتك على الهاتف: اسأل المساعد التعليمي، راجع حزمة
                الدراسة والبطاقات، واختبر نفسك وتابع أخطاءك وتقدمك.
              </p>
            </div>

            {/* Main Download Card */}
            <div className="mx-auto mt-12 max-w-xl">
              <div className="relative overflow-hidden rounded-3xl border border-border bg-card p-6 shadow-2xl sm:p-8">
                <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start sm:gap-6">
                  <div className="flex size-20 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/80 text-white shadow-lg shadow-primary/25">
                    <Smartphone className="size-10" />
                  </div>

                  <div className="flex-1 text-center sm:text-start">
                    <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                      <h2 className="text-xl font-bold text-foreground">
                        Nursing AI
                      </h2>
                      <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                        الإصدار المستقر
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground sm:justify-start">
                      <span className="flex items-center gap-1">
                        <HardDrive className="size-3.5 text-primary" />
                        {versionInfo.file_size || "الحجم غير متوفر"}
                      </span>
                      <span className="flex items-center gap-1">
                        <ShieldCheck className="size-3.5 text-emerald-500" />
                        الإصدار: <bdi dir="ltr">v{versionInfo.latest_version}</bdi>
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="size-3.5" />
                        {formattedDate}
                      </span>
                    </div>

                    <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                      {versionInfo.release_notes}
                    </p>
                  </div>
                </div>

                {/* Primary Action Button */}
                <div className="mt-8 flex flex-col gap-3">
                  {downloadable ? (
                    <a
                      href={versionInfo.apk_url}
                      className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-4 text-base font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary/95 hover:shadow-xl active:scale-[0.99]"
                      download={filename}
                    >
                      <Download className="size-5" aria-hidden />
                      تحميل Nursing AI <bdi dir="ltr">{versionInfo.latest_version}</bdi> (APK)
                    </a>
                  ) : (
                    <p role="status" className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-center text-sm font-semibold text-amber-800 dark:text-amber-300">
                      التحميل غير متاح مؤقتًا أثناء نشر الإصدار. حاول بعد قليل.
                    </p>
                  )}

                  <p className="flex items-center gap-1 px-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                    <FileCheck2 className="size-3.5" aria-hidden /> موقّع بمفتاح Nursing AI الرسمي، ويُثبَّت كتحديث فوق الإصدارات الرسمية السابقة.
                  </p>
                  {versionInfo.integrity === "verified" && versionInfo.served_sha256 && (
                    <details className="rounded-xl border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                      <summary className="cursor-pointer py-1 font-semibold text-foreground">التحقق من سلامة الملف (SHA-256)</summary>
                      <p className="mt-1">بصمة الملف الذي يقدّمه الخادم، ومطابقة لبصمة الإصدار المنشور:</p>
                      <code dir="ltr" className="mt-1 block break-all font-mono text-[11px] text-foreground">{versionInfo.served_sha256}</code>
                    </details>
                  )}
                </div>
              </div>
            </div>

            {/* Quick Security Highlights */}
            <div className="mx-auto mt-10 grid max-w-4xl grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="flex items-center gap-3 rounded-2xl border border-border bg-card/60 p-4 backdrop-blur-sm">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <Lock className="size-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-foreground">
                    تشفير عتادي للجلسات
                  </h4>
                  <p className="text-[11px] text-muted-foreground">
                    محمي بنظام Android KeyStore
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-2xl border border-border bg-card/60 p-4 backdrop-blur-sm">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                  <Zap className="size-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-foreground">
                    واجهة مصممة للهاتف
                  </h4>
                  <p className="text-[11px] text-muted-foreground">
                    الواجهة مدمجة في التطبيق، والمحتوى يُجلب من حسابك عند الاتصال
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-2xl border border-border bg-card/60 p-4 backdrop-blur-sm">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
                  <ShieldCheck className="size-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-foreground">
                    تنبيهات تحديث داخل التطبيق
                  </h4>
                  <p className="text-[11px] text-muted-foreground">
                    يفحص الإصدار المنشور عند فتح التطبيق
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Installation Steps Section */}
        <section className="py-16 sm:py-20">
          <div className="mx-auto max-w-4xl px-4 sm:px-6">
            <div className="text-center">
              <h2 className="text-2xl font-black text-foreground sm:text-3xl">
                خطوات تثبيت بسيطة (خلال دقيقة واحدة)
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                التطبيق غير متاح على Google Play؛ حمّله من هذا الموقع الرسمي فقط
                وثبّته مباشرة
              </p>
            </div>

            <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div className="relative rounded-2xl border border-border bg-card p-6 shadow-sm">
                <div className="flex items-center gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary text-xs font-black text-primary-foreground">
                    1
                  </span>
                  <h3 className="text-sm font-bold text-foreground">
                    تنزيل ملف الـ APK
                  </h3>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                  اضغط على زر &quot;تحميل Nursing AI&quot; أعلاه لحفظ ملف
                  التطبيق على هاتفك.
                </p>
              </div>

              <div className="relative rounded-2xl border border-border bg-card p-6 shadow-sm">
                <div className="flex items-center gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary text-xs font-black text-primary-foreground">
                    2
                  </span>
                  <h3 className="text-sm font-bold text-foreground">
                    فتح الملف بعد التنزيل
                  </h3>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                  عند اكتمال التنزيل، انقر على الإشعار، أو افتح تطبيق
                  &quot;الملفات&quot; (Files) ثم مجلد &quot;التنزيلات&quot;
                  (Downloads).
                </p>
              </div>

              <div className="relative rounded-2xl border border-border bg-card p-6 shadow-sm">
                <div className="flex items-center gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary text-xs font-black text-primary-foreground">
                    3
                  </span>
                  <h3 className="text-sm font-bold text-foreground">
                    السماح بالتثبيت
                  </h3>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                  إذا ظهر تنبيه أمان، اضغط على &quot;الإعدادات&quot; ثم فعّل
                  &quot;السماح بالتثبيت من هذا المصدر&quot; (Install Unknown
                  Apps) لمتصفحك.
                </p>
              </div>

              <div className="relative rounded-2xl border border-border bg-card p-6 shadow-sm">
                <div className="flex items-center gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary text-xs font-black text-primary-foreground">
                    4
                  </span>
                  <h3 className="text-sm font-bold text-foreground">
                    التثبيت والبدء فوراً
                  </h3>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                  اضغط على &quot;تثبيت&quot; (Install)، ثم افتح &quot;Nursing
                  AI&quot; وسجل الدخول بحسابك.
                </p>
              </div>
            </div>

            {/* Note box */}
            <div className="mt-8 flex items-start gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs text-amber-800 dark:text-amber-300">
              <AlertTriangle className="size-5 shrink-0 text-amber-600 dark:text-amber-400" />
              <p className="leading-relaxed">
                <strong>للمستخدمين الحاليين:</strong> إذا كان لديك Nursing AI
                من هذا الموقع، ثبّت الملف الجديد فوقه مباشرة وستبقى بياناتك
                وتسجيل دخولك. ملفات Nursing AI من أي مصدر آخر غير رسمية.
              </p>
            </div>

            {preview && (
              <section aria-labelledby="preview-heading" className="mt-8 rounded-2xl border border-border bg-card p-5 text-sm">
                <h3 id="preview-heading" className="font-bold text-foreground">
                  نسخة تجريبية للمختبرين (Preview) <bdi dir="ltr">{preview.version}</bdi>
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  للمختبرين فقط وقد تحتوي أخطاء. تُثبَّت كتطبيق منفصل باسم Nursing AI Preview ولا تحدّث التطبيق الرسمي.
                  إن لم تكن متأكدًا، استخدم الإصدار المستقر أعلاه.
                </p>
                {preview.notes && <p className="mt-2 text-xs text-muted-foreground">{preview.notes}</p>}
                <a href={preview.apk_url} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-xs font-semibold text-foreground hover:bg-muted">
                  <Download className="size-4" aria-hidden /> تحميل النسخة التجريبية
                </a>
              </section>
            )}
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}
