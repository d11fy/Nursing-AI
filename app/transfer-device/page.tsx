import Link from 'next/link';
import { DeviceTransferForm } from '@/components/auth/device-transfer-form';
export const metadata={title:'نقل الحساب إلى جهاز جديد',robots:{index:false,follow:false}};
export default function Page(){return <main dir="rtl" className="mx-auto max-w-lg space-y-6 px-5 py-12"><h1 className="text-2xl font-bold">نقل الحساب إلى جهاز جديد</h1><DeviceTransferForm/><Link className="block text-primary underline" href="/support">طلب مساعدة</Link><Link className="block text-primary underline" href="/login">تسجيل الدخول</Link></main>;}
