// Security response headers, applied from next.config.ts.
//
// Rollout: the headers in BASE_HEADERS and the small ENFORCED_CSP cannot break
// scripts, styles, images, Google sign-in or the Android client (which runs
// its own bundled UI and only calls /api). The complete policy is sent as
// Content-Security-Policy-Report-Only first; violations are reported to
// /api/security/csp-report. Promote it to enforcing only after production
// reports are clean.

/** @type {Array<{ key: string; value: string }>} */
export const BASE_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
];

/** Enforced now: no framing, no <base> hijacking, no plugins. */
export const ENFORCED_CSP = "frame-ancestors 'none'; base-uri 'self'; object-src 'none'";

/**
 * Target policy, reported only. Next.js inline bootstrap scripts need
 * 'unsafe-inline' unless pages move to per-request nonces.
 */
export const REPORT_ONLY_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src 'self'",
  "form-action 'self' https://accounts.google.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
  "report-uri /api/security/csp-report",
].join("; ");

/**
 * HSTS is sent only by production builds. Browsers ignore it on plain HTTP,
 * so a local `next start` over http is unaffected. No includeSubDomains or
 * preload: those affect other hosts and are hard to undo.
 */
export const HSTS = { key: "Strict-Transport-Security", value: "max-age=15552000" };

/** @param {{ production: boolean }} options */
export function securityHeaderRules({ production }) {
  return [
    { source: "/:path*", headers: [...BASE_HEADERS, ...(production ? [HSTS] : [])] },
    {
      // API routes set their own policies (e.g. sandboxed file downloads).
      source: "/((?!api/).*)",
      headers: [
        { key: "Content-Security-Policy", value: ENFORCED_CSP },
        { key: "Content-Security-Policy-Report-Only", value: REPORT_ONLY_CSP },
      ],
    },
  ];
}
