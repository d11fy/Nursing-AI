import type { Metadata } from "next";
import { LegalPage } from "@/components/landing/legal-page";
import { currentProfile } from "@/lib/auth/session";

export const metadata: Metadata = { title: "التنويه التعليمي | Nursing AI", description: "حدود الاستخدام التعليمي لمخرجات Nursing AI، خصوصًا الجرعات والبروتوكولات والقرارات السريرية.", alternates: { canonical: "/disclaimer" } };

export default async function DisclaimerPage() {
  const profile = await currentProfile();
  const dashboardHref = profile ? (profile.role === "admin" ? "/admin" : "/dashboard") : null;
  return <LegalPage dashboardHref={dashboardHref} eyebrow="تنويه مهم" title="منصة تعليمية وليست أداة قرار طبي" intro="صُممت Nursing AI لمساعدة طالب التمريض على الدراسة والفهم والمراجعة، وليس لتقديم الرعاية الصحية أو استبدال المختصين." sections={[
    { title: "ليست أداة تشخيص أو علاج", content: <p>لا تستخدم Nursing AI لتشخيص مريض، وصف علاج، اتخاذ قرار سريري، أو إدارة حالة طارئة. اتبع تعليمات الكادر المؤهل وسياسات المؤسسة الصحية.</p> },
    { title: "لا تستبدل المحاضر أو المرجع الرسمي", content: <p>قد تكون مخرجات الذكاء الاصطناعي ناقصة أو غير دقيقة. راجع المحاضر والكتاب المعتمد والبروتوكول الرسمي قبل اعتماد أي معلومة في الدراسة أو التدريب السريري.</p> },
    { title: "الجرعات والبروتوكولات", content: <p>يجب التحقق من Drug doses وClinical protocols والقيم العددية والقرارات السريرية من المصدر الرسمي الأحدث والمتخصص المسؤول. لا تعتمد على إجابة AI وحدها.</p> },
    { title: "حالات المرضى الفعلية", content: <p>لا ترفع معلومات تعريفية عن مريض ولا تستخدم المنصة للتعامل مع حالة فعلية. في الطوارئ اتبع مسار الطوارئ المعتمد وتواصل مع المختصين فورًا.</p> },
  ]} />;
}
