import { useEffect, useState } from "react";
import { apiFetch } from "../services/api";
import { APP_VERSION_CODE, APP_VERSION_NAME } from "../config/version";
import { parseVersionResponse, type VersionResponse } from "../services/release";

export type { VersionResponse };

export function useAppUpdateCheck() {
  const [updateInfo, setUpdateInfo] = useState<VersionResponse | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function checkForUpdates() {
      try {
        const data = parseVersionResponse(await apiFetch("/api/app/version"));
        // Malformed data, or a release the server cannot verify, never prompts.
        if (!mounted || !data || data.available === false) return;

        const isNewerCode = typeof data.latest_version_code === "number" && data.latest_version_code > APP_VERSION_CODE;
        const isNewerName = data.latest_version && data.latest_version !== APP_VERSION_NAME;

        if (isNewerCode || (isNewerName && compareVersions(data.latest_version, APP_VERSION_NAME) > 0)) {
          setUpdateInfo(data);
        }
      } catch {
        // Offline and temporary failures are handled by the normal network state.
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
