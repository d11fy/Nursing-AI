import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";
import { SplashScreen } from "@capacitor/splash-screen";
import { Network } from "@capacitor/network";
import { App as CapApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";

export const isNative = Capacitor.isNativePlatform();

export async function initNativePlugins(): Promise<void> {
  if (!isNative) return;

  try {
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: "#0f5d75" });
  } catch (e) {
    console.warn("StatusBar setup error:", e);
  }

  try {
    await SplashScreen.hide();
  } catch (e) {
    console.warn("SplashScreen hide error:", e);
  }
}

export async function checkNetworkStatus(): Promise<boolean> {
  try {
    const status = await Network.getStatus();
    return status.connected;
  } catch {
    return navigator.onLine;
  }
}

export function subscribeNetworkStatus(callback: (connected: boolean) => void): () => void {
  let removeListener: (() => void) | null = null;

  if (isNative) {
    Network.addListener("networkStatusChange", (status) => {
      callback(status.connected);
    }).then((handle) => {
      removeListener = () => handle.remove();
    });
  } else {
    const onOnline = () => callback(true);
    const onOffline = () => callback(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    removeListener = () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }

  return () => {
    if (removeListener) removeListener();
  };
}

export async function openExternalUrl(url: string): Promise<void> {
  try {
    if (isNative) {
      await Browser.open({ url });
    } else {
      window.open(url, "_blank");
    }
  } catch (err) {
    window.open(url, "_blank");
  }
}

// Back button handler registry
type BackHandler = () => boolean | Promise<boolean>;
const backHandlers: BackHandler[] = [];

export function registerBackHandler(handler: BackHandler): () => void {
  backHandlers.push(handler);
  return () => {
    const idx = backHandlers.indexOf(handler);
    if (idx !== -1) backHandlers.splice(idx, 1);
  };
}

let lastBackPressTime = 0;
let toastCallback: ((msg: string) => void) | null = null;

export function setToastCallback(fn: (msg: string) => void) {
  toastCallback = fn;
}

export function setupHardwareBackButton(): () => void {
  if (!isNative) return () => {};

  const handleBack = async () => {
    // 1. Iterate through custom handlers in reverse (LIFO)
    for (let i = backHandlers.length - 1; i >= 0; i--) {
      const handled = await backHandlers[i]();
      if (handled) return;
    }

    // 2. If at root, double click to exit
    const now = Date.now();
    if (now - lastBackPressTime < 2000) {
      await CapApp.minimizeApp();
    } else {
      lastBackPressTime = now;
      if (toastCallback) {
        toastCallback("اضغط مرة أخرى للخروج");
      }
    }
  };

  const listenerPromise = CapApp.addListener("backButton", handleBack);

  return () => {
    listenerPromise.then((handle) => handle.remove());
  };
}
