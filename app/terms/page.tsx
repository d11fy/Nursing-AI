import type { Metadata } from "next";
import { LegalPage } from "@/components/landing/legal-page";
import { currentProfile } from "@/lib/auth/session";
import { getPublicSiteData } from "@/lib/public-site";

export const metadata: Metadata = { title: "شروط الاستخدام | Nursing AI", description: "شروط استخدام حساب Nursing AI والذكاء الاصطناعي والاشتراكات والمحتوى التعليمي.", alternates: { canonical: "/terms" } };

export default async function TermsPage() {
  const [profile, data] = await Promise.all([currentProfile(), getPublicSiteData()]);
  const dashboardHref = profile ? (profile.role === "admin" ? "/admin" : "/dashboard") : null;
  return <LegalPage dashboardHref={dashboardHref} eyebrow="القانوني" title="شروط الاستخدام" intro="باستخدام Nursing AI فإنك توافق على استخدام المنصة للدراسة بصورة مسؤولة، وعلى الالتزام بقيود الحساب والمحتوى والاشتراك المبينة هنا." sections={[
    { title: "الحساب والاستخدام", content: <p>يجب تقديم معلومات صحيحة والحفاظ على سرية بيانات الدخول. حساب الطالب شخصي وغير مخصص للمشاركة، وتطبق المنصة سياسة جهاز فعال واحد. يستطيع المسؤول إعادة ربط الجهاز عند وجود سبب مشروع.</p> },
    { title: "الاستخدام المقبول", content: <p>يُمنع محاولة تجاوز الصلاحيات أو حدود الاستخدام، الوصول إلى بيانات الآخرين، إساءة استخدام الرفع أو الذكاء الاصطناعي، تعطيل الخدمة، أو استخدام المنصة في نشاط غير قانوني.</p> },
    { title: "الذكاء الاصطناعي والتعليم", content: <p>المخرجات أداة تعليمية وقد تخطئ أو تنقص. يجب الرجوع إلى المحاضر والمراجع الرسمية، خصوصًا في الجرعات والبروتوكولات والقرارات السريرية. المنصة ليست نظام تشخيص أو علاج.</p> },
    { title: "الاشتراكات والتجربة والدفع", content: <p>تتحدد مدة التجربة والحدود والباقات والأسعار من إعدادات المنصة الحالية. الدفع اليدوي لا يفعّل الاشتراك قبل مراجعة الإدارة وقبول الطلب. التفاصيل التشغيلية موضحة في سياسة الاشتراك.</p> },
    { title: "محتوى المستخدم", content: <p>يبقى المستخدم مسؤولًا عن حقه في رفع الملفات وعن خلوها من بيانات مرضى أو محتوى غير مسموح. يمنح المنصة صلاحية تقنية لمعالجة المحتوى بالقدر اللازم لتقديم الميزات المطلوبة.</p> },
    { title: "التعليق وتغييرات الخدمة", content: <p>يمكن تعليق الحساب عند إساءة الاستخدام أو خرق الشروط أو المخاطر الأمنية. قد تتغير الميزات والحدود لأسباب تشغيلية، وتنعكس البيانات القابلة للتغيير من إعدادات الخادم دون إصدار تطبيق جديد.</p> },
    { title: "حدود المسؤولية والتواصل", content: <p>تُقدّم الخدمة التعليمية ضمن الحدود المتاحة ولا تتحمل Nursing AI مسؤولية قرار طبي أو سريري اتُخذ اعتمادًا على المخرجات وحدها.{data.contact.email ? <> للاستفسار: <a className="font-bold text-primary underline" href={`mailto:${data.contact.email}`}>{data.contact.email}</a>.</> : null}</p> },
  ]} />;
}
