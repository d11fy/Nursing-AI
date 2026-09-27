import { ResetPasswordForm } from "@/components/auth/reset-password-form";
export const metadata = { title: "إعادة تعيين كلمة المرور", referrer: "no-referrer" as const };
export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  return <div className="space-y-5"><h1 className="text-xl font-bold">إعادة تعيين كلمة المرور</h1><ResetPasswordForm token={token} /></div>;
}
