// Receives Content-Security-Policy-Report-Only violations so the full policy
// can be enforced once production reports are clean. Only the directive and
// the blocked origin are logged, never page URLs with query strings.
const MAX_BODY = 16 * 1024;

function originOf(value: unknown) {
  if (typeof value !== "string") return null;
  if (["inline", "eval", "data", "blob"].includes(value)) return value;
  try { return new URL(value).origin; } catch { return value.slice(0, 40); }
}

function pathOf(value: unknown) {
  if (typeof value !== "string") return null;
  try { return new URL(value).pathname.slice(0, 120); } catch { return null; }
}

export async function POST(request: Request) {
  const text = await request.text().catch(() => "");
  if (!text || text.length > MAX_BODY) return new Response(null, { status: 204 });
  try {
    const parsed = JSON.parse(text);
    const reports = Array.isArray(parsed) ? parsed.map((item) => item?.body ?? {}) : [parsed?.["csp-report"] ?? {}];
    for (const report of reports.slice(0, 5)) {
      console.warn(JSON.stringify({
        event: "CSP_REPORT",
        directive: String(report["effective-directive"] ?? report.effectiveDirective ?? report["violated-directive"] ?? "").slice(0, 60),
        blocked: originOf(report["blocked-uri"] ?? report.blockedURL),
        page: pathOf(report["document-uri"] ?? report.documentURL),
        at: new Date().toISOString(),
      }));
    }
  } catch {
    // Malformed reports are ignored.
  }
  return new Response(null, { status: 204 });
}
