import { getSupportWhatsapp,whatsappUrl } from "@/lib/support-contact";
import Link from "next/link";
import { SupportForm } from "@/components/support-form";
export const metadata={title:"مساعدة Nursing AI",robots:{index:false,follow:true}};
export default async function Page(){const number=await getSupportWhatsapp();return <main dir="rtl" className="mx-auto max-w-xl space-y-6 px-5 py-12"><Link href="/" className="text-primary underline">الرئيسية</Link><h1 className="text-2xl font-bold">نساعدك حتى إذا تعذّر تسجيل الدخول</h1><p>تُراجع الإدارة طلبك وترد هنا عبر رمز المتابعة الخاص بك. لا نعرض موعدًا مضمونًا للرد قبل اعتماد ساعات الدعم.</p><a className="block min-h-12 rounded-xl bg-primary px-5 py-3 text-center text-primary-foreground" href={whatsappUrl(number)}>تواصل معنا عبر واتساب — {number}</a><SupportForm /></main>;}
