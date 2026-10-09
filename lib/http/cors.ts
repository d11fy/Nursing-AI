const CAPACITOR_ORIGINS = new Set([
  "https://localhost",
  "capacitor://localhost",
]);

function toOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function isAllowedApiOrigin(
  origin: string | null,
  requestOrigin: string,
  configuredAppUrl?: string,
): boolean {
  if (!origin) return true;

  const allowed = new Set<string>([requestOrigin, ...CAPACITOR_ORIGINS]);
  const configuredOrigin = toOrigin(configuredAppUrl);
  if (configuredOrigin) allowed.add(configuredOrigin);

  return allowed.has(origin);
}

export const API_CORS_HEADERS = {
  "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type,Authorization,X-Device-Token,X-App-Version-Code,X-Subject-Id,X-Conversation-Id,Idempotency-Key",
  "Access-Control-Expose-Headers":
    "X-Conversation-Id,X-Subject-Id,X-Request-Id,Content-Disposition",
  Vary: "Origin",
} as const;
