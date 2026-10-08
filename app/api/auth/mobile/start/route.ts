import { googleSignInEnabled } from "@/lib/auth/google";
import { encryptHandoff } from "@/lib/auth/mobile";
import { mobileLoginInput } from "@/lib/auth/mobile-input";
export async function POST(request: Request) {
  const parsed = mobileLoginInput.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return Response.json({ error: "بيانات الدخول غير صالحة" }, { status: 400 });
  if (!googleSignInEnabled())
    return Response.json(
      { error: "تسجيل الدخول باستخدام Google غير مهيأ على الخادم" },
      { status: 503 },
    );
  const ticket = encryptHandoff({
    ...parsed.data,
    expires: Date.now() + 10 * 60 * 1000,
  });
  return Response.json(
    { url: `/auth/mobile/start?${new URLSearchParams({ ticket })}` },
    { headers: { "Cache-Control": "no-store" } },
  );
}
