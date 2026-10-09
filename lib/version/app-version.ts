import { getPool } from "@/lib/db/pool";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

/**
 * Android release metadata. The `mobile_app_version` setting is the single
 * source of truth for the website (/download, landing page), the update check
 * inside the app (/api/app/version) and the APK download route. The stable
 * channel is the signed production build; an optional preview channel is
 * shown only as a secondary, clearly labelled download.
 */
export interface AppVersionInfo {
  latest_version: string;
  latest_version_code: number;
  minimum_supported_version_code: number;
  apk_url: string;
  release_notes: string;
  force_update: boolean;
  published_at: string;
  file_size?: string;
  /** Expected SHA-256 of the published stable APK (lowercase hex). */
  sha256?: string | null;
  preview?: PreviewChannel | null;
}

export interface PreviewChannel {
  enabled: boolean;
  version: string;
  apk_url: string;
  notes: string;
}

export type ApkIntegrity = "verified" | "mismatch" | "unpublished" | "missing";

export interface PublicReleaseInfo extends AppVersionInfo {
  /** SHA-256 computed from the file the server actually serves. */
  served_sha256: string | null;
  integrity: ApkIntegrity;
}

/** Stable APK served by /api/download/apk. */
export const STABLE_APK_PATH = path.join(process.cwd(), "public", "downloads", "nursing-ai-latest.apk");

/** Fallback when the database is unreachable; mirrors migration 0029. */
export const DEFAULT_APP_VERSION: AppVersionInfo = {
  latest_version: "1.2.0",
  latest_version_code: 5,
  minimum_supported_version_code: 5,
  apk_url: "/api/download/apk",
  release_notes: "تطبيق Nursing AI الجديد بواجهة مصممة للهاتف: المكتبة وحزم الدراسة والبطاقات والاختبارات والأخطاء والتقدم.",
  force_update: false,
  published_at: "2026-10-09T08:00:00.000Z",
  file_size: "1.39 MB",
  sha256: "ec87750458c991b9a64b950418dd61daeb12a7cdc58224ff3b5669fe07724974",
  preview: null,
};

const SETTINGS_KEY = "mobile_app_version";
const OFFICIAL_ORIGIN = "https://nursing.alisohail.tech";

const officialUrl = z.string().min(1).refine((value) => {
  if (value.startsWith("/")) return !value.startsWith("//");
  try {
    return new URL(value).origin === OFFICIAL_ORIGIN;
  } catch {
    return false;
  }
}, "APK URL must be a local path or the official Nursing AI domain");

export const appVersionSchema = z.object({
  latest_version: z.string().regex(/^\d+\.\d+\.\d+$/),
  latest_version_code: z.number().int().positive(),
  minimum_supported_version_code: z.number().int().positive(),
  apk_url: officialUrl,
  release_notes: z.string().max(4000),
  force_update: z.boolean(),
  published_at: z.string().datetime(),
  file_size: z.string().max(40).optional(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/).nullable().optional(),
  preview: z.object({
    enabled: z.boolean(),
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    apk_url: officialUrl,
    notes: z.string().max(2000),
  }).nullable().optional(),
});

const hashCache = new Map<string, { key: string; sha256: string }>();

/** SHA-256 of a file, cached until its size or modification time changes. */
export async function fileSha256(file: string): Promise<string | null> {
  try {
    const info = await stat(file);
    const key = `${info.size}:${info.mtimeMs}`;
    const cached = hashCache.get(file);
    if (cached?.key === key) return cached.sha256;
    const sha256 = await new Promise<string>((resolve, reject) => {
      const hash = createHash("sha256");
      createReadStream(file).on("data", (chunk) => hash.update(chunk)).on("end", () => resolve(hash.digest("hex"))).on("error", reject);
    });
    hashCache.set(file, { key, sha256 });
    return sha256;
  } catch {
    return null;
  }
}

async function fileSizeLabel(file: string): Promise<string | undefined> {
  try {
    return `${((await stat(file)).size / 1024 / 1024).toFixed(2)} MB`;
  } catch {
    return undefined;
  }
}

export async function getAppVersionInfo(): Promise<AppVersionInfo> {
  try {
    const { rows } = await getPool().query<{ value: unknown }>(
      "SELECT value FROM public.settings WHERE key = $1",
      [SETTINGS_KEY]
    );

    if (rows[0]?.value) {
      const val = typeof rows[0].value === "string" ? JSON.parse(rows[0].value) : rows[0].value;
      const parsed = appVersionSchema.safeParse({
        ...DEFAULT_APP_VERSION,
        ...(val && typeof val === "object" ? val : {}),
      });
      if (parsed.success) {
        return { ...parsed.data, file_size: await fileSizeLabel(STABLE_APK_PATH) ?? parsed.data.file_size };
      }
    }
  } catch {
    // A database outage must not break the public download page.
  }

  return { ...DEFAULT_APP_VERSION, file_size: await fileSizeLabel(STABLE_APK_PATH) ?? DEFAULT_APP_VERSION.file_size };
}

/** Release metadata plus a check that the served file is the one that was published. */
export async function getPublicReleaseInfo(): Promise<PublicReleaseInfo> {
  const info = await getAppVersionInfo();
  const served = await fileSha256(STABLE_APK_PATH);
  const integrity: ApkIntegrity = !served ? "missing" : !info.sha256 ? "unpublished" : served === info.sha256 ? "verified" : "mismatch";
  return { ...info, served_sha256: served, integrity };
}

export async function setAppVersionInfo(info: Partial<AppVersionInfo>): Promise<AppVersionInfo> {
  const current = await getAppVersionInfo();
  const updated = appVersionSchema.parse({
    ...current,
    ...info,
    published_at: new Date().toISOString(),
  });

  await getPool().query(
    `INSERT INTO public.settings (key, value, updated_at)
     VALUES ($1, $2::jsonb, now())
     ON CONFLICT (key) DO UPDATE
     SET value = EXCLUDED.value, updated_at = now()`,
    [SETTINGS_KEY, JSON.stringify(updated)]
  );

  return updated;
}
