import { getPool } from "@/lib/db/pool";

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
  apk_url: "/downloads/nursing-ai-latest.apk",
  release_notes: "الإصدار الرسمي لتطبيق Nursing AI مع دعم كامل للـ Study Pack والذكاء الاصطناعي والتخزين المشفر بالعتاد.",
  force_update: false,
  published_at: "2026-10-07T12:00:00.000Z",
  file_size: "3.2 MB",
};

const SETTINGS_KEY = "mobile_app_version";

export async function getAppVersionInfo(): Promise<AppVersionInfo> {
  try {
    const { rows } = await getPool().query<{ value: any }>(
      "SELECT value FROM public.settings WHERE key = $1",
      [SETTINGS_KEY]
    );

    if (rows[0]?.value) {
      const val = typeof rows[0].value === "string" ? JSON.parse(rows[0].value) : rows[0].value;
      return {
        ...DEFAULT_APP_VERSION,
        ...val,
      };
    }
  } catch (error) {
    console.warn("Could not query mobile_app_version from settings table, using default:", error);
  }

  return DEFAULT_APP_VERSION;
}

export async function setAppVersionInfo(info: Partial<AppVersionInfo>): Promise<AppVersionInfo> {
  const current = await getAppVersionInfo();
  const updated: AppVersionInfo = {
    ...current,
    ...info,
    published_at: new Date().toISOString(),
  };

  await getPool().query(
    `INSERT INTO public.settings (key, value, updated_at)
     VALUES ($1, $2::jsonb, now())
     ON CONFLICT (key) DO UPDATE
     SET value = EXCLUDED.value, updated_at = now()`,
    [SETTINGS_KEY, JSON.stringify(updated)]
  );

  return updated;
}
