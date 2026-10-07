import type { Metadata } from "next";
import { LegalPage } from "@/components/landing/legal-page";
import { currentProfile } from "@/lib/auth/session";

export const metadata: Metadata = { title: "سياسة الملفات | Nursing AI", description: "خصوصية ملفات الدراسة والأنواع المدعومة وحدود الرفع والاحتفاظ والحذف في Nursing AI.", alternates: { canonical: "/file-policy" } };

export default async function FilePolicyPage() {
  const profile = await currentProfile();
  const dashboardHref = profile ? (profile.role === "admin" ? "/admin" : "/dashboard") : null;
  return <LegalPage dashboardHref={dashboardHref} eyebrow="الملفات" title="سياسة الملفات" intro="تُستخدم الملفات لتقديم وظائف الدراسة فقط، وتطبق عليها فحوص الملكية وحدود النوع والحجم والباقة على الخادم." sections={[
    { title: "الخصوصية والملكية", content: <p>الملفات الخاصة مرتبطة بصاحب الحساب ولا يستطيع طالب آخر قراءتها. يجب ألا ترفع بيانات مرضى أو ملفات لا تملك حق استخدامها.</p> },
    { title: "الأنواع المدعومة", content: <p>تدعم المحاضرات PDF وDOCX وPPTX والنصوص وصور JPEG وPNG وWebP. قد تقبل بعض مسارات المحادثة أنواعًا أقل، ويظهر التنبيه عند محاولة رفع نوع غير مدعوم.</p> },
    { title: "الحجم وحدود الباقة", content: <p>تختلف حدود عدد الملفات وحجمها حسب الميزة وإعدادات الخادم والباقة. يفحص الخادم الحجم الفعلي ولا يعتمد على واجهة المستخدم وحدها. إذا كان الملف كبيرًا، قسّمه إلى أجزاء منطقية مع الحفاظ على ترتيب الصفحات.</p> },
    { title: "الاحتفاظ والحذف", content: <p>قد يُحذف الملف الأصلي للمحاضرة بعد انتهاء مدة الاحتفاظ التشغيلية، بينما تبقى أجزاء المعرفة والمحتويات التعليمية المولدة حتى تستمر الملخصات والاختبارات والمراجعة. حذف المصدر الإداري أو عملية التنظيف المخصصة قد تزيل الملف من التخزين.</p> },
    { title: "مسؤولية المحتوى", content: <p>المستخدم مسؤول عن دقة تسمية الملف، سلامته، قانونية استخدامه، وعدم احتوائه على برمجيات ضارة أو بيانات شخصية لا يجوز مشاركتها.</p> },
  ]} />;
}
