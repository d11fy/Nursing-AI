import { useEffect, useState } from "react";
import { apiFetch } from "../services/api";
import { getInstalledVersion } from "../services/installedVersion";
import { decideUpdate, parseVersionResponse, type VersionResponse } from "../services/release";

export type { VersionResponse };

export function useAppUpdateCheck() {
  const [updateInfo, setUpdateInfo] = useState<VersionResponse | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function checkForUpdates() {
      try {
        const installed=await getInstalledVersion();
        const data = parseVersionResponse(await apiFetch(`/api/app/version?at=${Date.now()}`,{cache:'no-store'}));
        // Malformed data, or a release the server cannot verify, never prompts.
        if (!mounted || !data || data.available === false) return;

        const decision=decideUpdate(installed.code,data);
        if(import.meta.env.DEV)console.debug('version-decision',{installedCode:installed.code,minimumCode:data.minimum_supported_version_code,latestCode:data.latest_version_code,forceUpdate:decision.force,packageId:installed.packageId});
        if(decision.show)setUpdateInfo({...data,force_update:decision.force});
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
