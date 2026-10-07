import { NextResponse } from "next/server";
import { AccountAlreadyExistsError, registerAccount } from "@/lib/auth/accounts";
import { currentProfile } from "@/lib/auth/session";
import { registerSchema } from "@/lib/validations/auth";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = registerSchema.safeParse({
      fullName: body.fullName,
      email: body.email,
      password: body.password,
      university: body.university,
      nursingYear: body.nursingYear,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "بيانات التسجيل غير صالحة" },
        { status: 400 }
      );
    }

    const deviceToken = typeof body.deviceToken === "string" ? body.deviceToken : undefined;

    let session;
    try {
      session = await registerAccount(parsed.data, deviceToken);
    } catch (err) {
      if (err instanceof AccountAlreadyExistsError) {
        return NextResponse.json(
          { error: "هذا البريد الإلكتروني مسجّل بالفعل؛ سجّل الدخول أو استخدم استعادة كلمة المرور" },
          { status: 409 }
        );
      }
      throw err;
    }

    const profile = await currentProfile();

    return NextResponse.json({
      success: true,
      sessionToken: session?.sessionToken,
      deviceToken: session?.deviceToken,
      profile,
    });
  } catch (error) {
    console.error("Auth register API error:", error);
    return NextResponse.json(
      { error: "تعذر إنشاء الحساب؛ تحقق من البيانات أو حاول لاحقًا" },
      { status: 500 }
    );
  }
}
