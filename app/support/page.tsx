import Link from "next/link";
import { SupportForm } from "@/components/support-form";
export const metadata={title:"مساعدة Nursing AI",robots:{index:false,follow:true}};
export default function Page(){return <main dir="rtl" className="mx-auto max-w-xl space-y-6 px-5 py-12"><Link href="/" className="text-primary underline">الرئيسية</Link><h1 className="text-2xl font-bold">نساعدك حتى إذا تعذّر تسجيل الدخول</h1><p>تُراجع الإدارة طلبك وترد هنا عبر رمز المتابعة الخاص بك. لا نعرض موعدًا مضمونًا للرد قبل اعتماد ساعات الدعم.</p><SupportForm /></main>;}
