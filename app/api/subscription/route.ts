import { currentProfile } from "@/lib/auth/session";
import { getSubscriptionPageData } from "@/lib/subscriptions/queries";
export async function GET() {
  const profile = await currentProfile();
  if (!profile)
    return Response.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  return Response.json(await getSubscriptionPageData(profile.user_id), {
    headers: { "Cache-Control": "private, no-store" },
  });
}
