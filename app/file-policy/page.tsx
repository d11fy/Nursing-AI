import type { Metadata } from "next";
import { LegalPage } from "@/components/landing/legal-page";
import { currentProfile } from "@/lib/auth/session";
import { createSystemClient } from "@/lib/db/server";
import { getSettings } from "@/lib/usage";

export const metadata: Metadata = { title: "سياسة الملفات | Nursing AI", description: "خصوصية ملفات الدراسة والأنواع المدعومة وحدود الرفع والاحتفاظ والحذف في Nursing AI.", alternates: { canonical: "/file-policy" } };

export default async function FilePolicyPage() {
  const [profile, settings] = await Promise.all([currentProfile(), getSettings(createSystemClient()).catch(() => null)]);
  const largeMb = settings?.lectureLargeFileMb ?? 20, retentionDays = settings?.lectureRetentionDays ?? 10, maxMb = settings?.lectureMaxFileMb ?? 50;
  const dashboardHref = profile ? (profile.role === "admin" ? "/admin" : "/dashboard") : null;
  return <LegalPage dashboardHref={dashboardHref} eyebrow="الملفات" title="سياسة الملفات" intro="تُستخدم الملفات لتقديم وظائف الدراسة فقط، وتطبق عليها فحوص الملكية وحدود النوع والحجم والباقة على الخادم." sections={[
    { title: "الخصوصية والملكية", content: <p>الملفات الخاصة مرتبطة بصاحب الحساب ولا يستطيع طالب آخر قراءتها. يجب ألا ترفع بيانات مرضى أو ملفات لا تملك حق استخدامها.</p> },
    { title: "الأنواع المدعومة", content: <p>تدعم المحاضرات PDF وDOCX وPPTX والنصوص وصور JPEG وPNG وWebP. يتحقق الخادم من محتوى الملف الفعلي وليس من الامتداد فقط، ويرفض الملف الذي لا يطابق نوعه المعلن قبل حفظه أو احتسابه من حصتك.</p> },
    { title: "الحجم وحدود الباقة", content: <p>تختلف حدود عدد الملفات وحجمها حسب الميزة وإعدادات الخادم والباقة. يفحص الخادم الحجم الفعلي ولا يعتمد على واجهة المستخدم وحدها. إذا كان الملف كبيرًا، قسّمه إلى أجزاء منطقية مع الحفاظ على ترتيب الصفحات.</p> },
    { title: "الاحتفاظ والحذف", content: <><p>القاعدة نفسها تنطبق على ملفات صفحة المادة وملفات المحادثة: الملف الأصلي الأكبر من {largeMb}MB يُحذف تلقائيًا بعد {retentionDays} أيام من رفعه، وتُنبَّه قبل الرفع. الملفات الأصغر يبقى أصلها محفوظًا. الحد الأقصى لملف المحاضرة {maxMb}MB ولملف المحادثة 10MB.</p><p className="mt-3">حذف الأصل لا يحذف ما بُني منه: يبقى النص المستخرج والملخص والنقاط والبطاقات والاختبارات وأخطاؤك وتقدمك، لتستمر المراجعة والسؤال عن المحاضرة.</p></> },
    { title: "مسؤولية المحتوى", content: <p>المستخدم مسؤول عن دقة تسمية الملف، سلامته، قانونية استخدامه، وعدم احتوائه على برمجيات ضارة أو بيانات شخصية لا يجوز مشاركتها.</p> },
  ]} />;
}
