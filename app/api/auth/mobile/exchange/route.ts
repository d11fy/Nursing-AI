import { z } from "zod";
import { exchangeMobileHandoff } from "@/lib/auth/mobile";
import { readSession } from "@/lib/auth/session";
export async function POST(request: Request) {
  const parsed = z
    .object({
      code: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
      verifier: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json({ error: "بيانات الدخول غير صالحة" }, { status: 400 });
  const session = await exchangeMobileHandoff(
    parsed.data.code,
    parsed.data.verifier,
  );
  if (
    !session ||
    !(await readSession(session.sessionToken, session.deviceToken))
  )
    return Response.json(
      { error: "انتهى رابط الدخول أو تم استخدامه؛ حاول مجددًا" },
      { status: 401 },
    );
  return Response.json(session, { headers: { "Cache-Control": "no-store" } });
}
