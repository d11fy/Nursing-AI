import type { Metadata } from "next";
import { LegalPage } from "@/components/landing/legal-page";
import { currentProfile } from "@/lib/auth/session";
import { getPublicSiteData } from "@/lib/public-site";

export const metadata: Metadata = { title: "سياسة الاشتراك والدفع | Nursing AI", description: "تفاصيل التجربة والباقات والدفع اليدوي ومراجعة الإيصال والتجديد وانتهاء الاشتراك.", alternates: { canonical: "/subscription-policy" } };

export default async function SubscriptionPolicyPage() {
  const [profile, data] = await Promise.all([currentProfile(), getPublicSiteData()]);
  const dashboardHref = profile ? (profile.role === "admin" ? "/admin" : "/dashboard") : null;
  return <LegalPage dashboardHref={dashboardHref} eyebrow="الاشتراك" title="سياسة الاشتراك والدفع" intro="توضح هذه الصفحة دورة الاشتراك المطبقة فعليًا. الأسعار والحدود النهائية هي المعروضة لحظة اختيار الباقة داخل المنصة." sections={[
    { title: "الباقات والتجربة", content: <p>تعرض المنصة الباقات العامة الفعالة فقط. التجربة الحالية مدتها {data.trial.durationDays} أيام وحدودها اليومية والإجمالية تأتي من إعدادات الإدارة. يمكن استخدام التجربة مرة واحدة وفق ضوابط الحساب والجهاز.</p> },
    { title: "الدفع ومراجعة الإيصال", content: <p>يختار المستخدم الباقة وطريقة الدفع، ثم يرفع إثباتًا لا يتجاوز الحد المطبق. يبقى الطلب Pending حتى تراجعه الإدارة. عند القبول يصبح Approved ويُنشأ الاشتراك، وعند الرفض يصبح Rejected ويظهر السبب عندما تسجله الإدارة.</p> },
    { title: "التجديد والانتهاء", content: <p>إذا جُدد اشتراك مدفوع فعال، تبدأ المدة الجديدة بعد نهايته حتى لا تضيع الأيام المتبقية. عند الانتهاء تتوقف الميزات المقيدة، لكن بيانات الدراسة السابقة لا تُحذف بسبب الانتهاء وحده.</p> },
    { title: "مهلة الدفع", content: <p>قد تمنح المنصة مهلة مؤقتة لطلب دفع Pending إذا كانت الإدارة قد فعّلتها. مدة المهلة وإتاحتها من إعدادات الخادم وليستا حقًا ثابتًا في كل وقت.</p> },
    { title: "الاسترجاع", content: data.contact.refundPolicy ? <p className="whitespace-pre-line">{data.contact.refundPolicy}</p> : <p>لا توجد سياسة استرجاع منشورة في إعدادات المنصة حاليًا. تواصل مع الدعم قبل الدفع إذا كنت تحتاج توضيحًا لحالة خاصة؛ لا تنشئ هذه الصفحة وعدًا باسترجاع غير معتمد.</p> },
  ]} />;
}
