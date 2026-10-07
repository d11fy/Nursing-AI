import { useEffect, useState } from "react";
import { apiFetch } from "../services/api";
import { APP_VERSION_CODE, APP_VERSION_NAME } from "../config/version";

export interface VersionResponse {
  latest_version: string;
  latest_version_code: number;
  apk_url: string;
  release_notes: string;
  force_update: boolean;
  published_at: string;
}

export function useAppUpdateCheck() {
  const [updateInfo, setUpdateInfo] = useState<VersionResponse | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function checkForUpdates() {
      try {
        const data: VersionResponse = await apiFetch("/api/app/version");
        if (!mounted || !data) return;

        const isNewerCode = typeof data.latest_version_code === "number" && data.latest_version_code > APP_VERSION_CODE;
        const isNewerName = data.latest_version && data.latest_version !== APP_VERSION_NAME;

        if (isNewerCode || (isNewerName && compareVersions(data.latest_version, APP_VERSION_NAME) > 0)) {
          setUpdateInfo(data);
        }
      } catch (err) {
        // Silently catch version check failure (offline or temporary issue)
        console.warn("[UpdateCheck] Failed checking app version:", err);
      }
    }

    checkForUpdates();

    return () => {
      mounted = false;
    };
  }, []);

  const dismissUpdate = () => {
    if (updateInfo && !updateInfo.force_update) {
      setDismissed(true);
    }
  };

  return {
    hasUpdate: Boolean(updateInfo && !dismissed),
    updateInfo,
    dismissUpdate,
  };
}

function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.replace(/^v/, "").split(".").map(Number);
  const parts2 = v2.replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  return 0;
}
