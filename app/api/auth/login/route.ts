import { MfaRequiredError } from "@/lib/auth/mfa";
import { NextResponse } from "next/server";
import { loginAccount } from "@/lib/auth/accounts";
import { currentProfile } from "@/lib/auth/session";
import { DeviceConflictError } from "@/lib/auth/session-store";
import { loginSchema } from "@/lib/validations/auth";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = loginSchema.safeParse({
      email: body.email,
      password: body.password,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "بيانات الدخول غير صالحة" },
        { status: 400 }
      );
    }

    const deviceToken = typeof body.deviceToken === "string" ? body.deviceToken : undefined;

    let session;
    try {
      session = await loginAccount(parsed.data.email, parsed.data.password, deviceToken, typeof body.secondFactor === "string" ? body.secondFactor : undefined);
    } catch (err) {
      if(err instanceof MfaRequiredError) return NextResponse.json({error:err.message,code:"MFA_REQUIRED"},{status:428});
      if (err instanceof DeviceConflictError) {
        return NextResponse.json(
          { error: "هذا الحساب مستخدم حاليًا على جهاز آخر.", code:"DEVICE_CONFLICT" },
          { status: 409 }
        );
      }
      throw err;
    }

    if (!session || typeof session !== "object") {
      return NextResponse.json(
        { error: "البريد الإلكتروني أو كلمة المرور غير صحيحة" },
        { status: 401 }
      );
    }

    const profile = await currentProfile();

    return NextResponse.json({
      success: true,
      sessionToken: session.sessionToken,
      deviceToken: session.deviceToken,
      profile,
    });
  } catch (error) {
    console.error("Auth login API error:", error);
    return NextResponse.json(
      { error: "تعذر تسجيل الدخول؛ يرجى المحاولة لاحقًا" },
      { status: 500 }
    );
  }
}
