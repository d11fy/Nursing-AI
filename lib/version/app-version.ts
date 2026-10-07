import { getPool } from "@/lib/db/pool";
import { stat } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

export interface AppVersionInfo {
  latest_version: string;
  latest_version_code: number;
  apk_url: string;
  release_notes: string;
  force_update: boolean;
  published_at: string;
  file_size?: string;
}

export const DEFAULT_APP_VERSION: AppVersionInfo = {
  latest_version: "1.0.0",
  latest_version_code: 1,
  apk_url: "/api/download/apk",
  release_notes: "الإصدار الرسمي الأول من تطبيق Nursing AI.",
  force_update: false,
  published_at: "2026-10-07T12:00:00.000Z",
  file_size: "1.17 MB",
};

const SETTINGS_KEY = "mobile_app_version";
const OFFICIAL_ORIGIN = "https://nursing.alisohail.tech";

const appVersionSchema = z.object({
  latest_version: z.string().regex(/^\d+\.\d+\.\d+$/),
  latest_version_code: z.number().int().positive(),
  apk_url: z.string().min(1).refine((value) => {
    if (value.startsWith("/")) return !value.startsWith("//");
    try {
      return new URL(value).origin === OFFICIAL_ORIGIN;
    } catch {
      return false;
    }
  }, "APK URL must be a local path or the official Nursing AI domain"),
  release_notes: z.string().max(4000),
  force_update: z.boolean(),
  published_at: z.string().datetime(),
  file_size: z.string().max(40).optional(),
});

async function localApkSize(): Promise<string | undefined> {
  try {
    const info = await stat(path.join(process.cwd(), "public", "downloads", "nursing-ai-latest.apk"));
    return `${(info.size / 1024 / 1024).toFixed(2)} MB`;
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
        return { ...parsed.data, file_size: await localApkSize() ?? parsed.data.file_size };
      }
    }
  } catch {
    // A database outage must not break the public download page.
  }

  return { ...DEFAULT_APP_VERSION, file_size: await localApkSize() ?? DEFAULT_APP_VERSION.file_size };
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
