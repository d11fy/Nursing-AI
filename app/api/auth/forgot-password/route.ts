import { forgotPasswordSchema } from "@/lib/validations/auth";
import { requestPasswordReset } from "@/lib/auth/accounts";
export async function POST(request: Request) {
  const parsed = forgotPasswordSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return Response.json(
      { error: "البريد الإلكتروني غير صالح" },
      { status: 400 },
    );
  try {
    await requestPasswordReset(parsed.data.email);
    return Response.json({
      message: "إذا كان البريد مسجلاً، ستصلك رسالة لإعادة تعيين كلمة المرور.",
    });
  } catch {
    return Response.json(
      { error: "تعذر إرسال الرابط؛ حاول لاحقًا" },
      { status: 500 },
    );
  }
}
