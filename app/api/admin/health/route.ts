import { getAdminProfileOrNull } from "@/lib/auth";
import { checkHealth, hasMonitorSecret } from "@/lib/health";

/** Detailed operational health for admins or a monitor holding CRON_SECRET. */
export async function GET(request: Request) {
  if (!hasMonitorSecret(request) && !(await getAdminProfileOrNull()))
    return Response.json({ error: "غير مصرح" }, { status: 403 });
  const report = await checkHealth();
  return Response.json(report, { status: report.status === "down" ? 503 : 200, headers: { "Cache-Control": "no-store" } });
}
