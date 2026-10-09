// Contract for /api/app/version. Anything malformed is ignored, never shown.
export interface VersionResponse {
  latest_version: string;
  latest_version_code: number;
  apk_url: string;
  release_notes: string;
  force_update: boolean;
  published_at: string;
  available?: boolean;
}

/** Accepts only a well-formed release from the server; anything else is ignored. */
export function parseVersionResponse(value: unknown): VersionResponse | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  if (typeof data.latest_version !== "string" || !/^\d+\.\d+\.\d+$/.test(data.latest_version)) return null;
  if (typeof data.latest_version_code !== "number" || !Number.isInteger(data.latest_version_code) || data.latest_version_code < 1) return null;
  if (typeof data.apk_url !== "string" || !data.apk_url) return null;
  return {
    latest_version: data.latest_version,
    latest_version_code: data.latest_version_code,
    apk_url: data.apk_url,
    release_notes: typeof data.release_notes === "string" ? data.release_notes : "",
    force_update: data.force_update === true,
    published_at: typeof data.published_at === "string" ? data.published_at : "",
    available: data.available !== false,
  };
}
