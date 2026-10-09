import { checkHealth } from "@/lib/health";

/** Public liveness/readiness probe: overall status only, no internal details. */
export async function GET() {
  const report = await checkHealth().catch(() => null);
  const status = report?.status ?? "down";
  return Response.json({ status, checkedAt: report?.checkedAt ?? new Date().toISOString() }, {
    status: status === "down" ? 503 : 200,
    headers: { "Cache-Control": "no-store" },
  });
}
