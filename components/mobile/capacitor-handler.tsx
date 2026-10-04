"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { WifiOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CapacitorHandler() {
  const pathname = usePathname();
  const router = useRouter();
  const [isOffline, setIsOffline] = useState(false);
  const [isNative, setIsNative] = useState(false);

  useEffect(() => {
    let cleanupFuncs: Array<() => void> = [];

    async function initCapacitor() {
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (!Capacitor.isNativePlatform()) {
          return;
        }

        setIsNative(true);

        // 1. Status Bar Setup
        try {
          const { StatusBar, Style } = await import("@capacitor/status-bar");
          await StatusBar.setStyle({ style: Style.Dark });
          await StatusBar.setBackgroundColor({ color: "#0f5d75" });
        } catch (e) {
          console.warn("StatusBar setup skipped", e);
        }

        // 2. Hide Splash Screen after load
        try {
          const { SplashScreen } = await import("@capacitor/splash-screen");
          await SplashScreen.hide();
        } catch (e) {
          console.warn("SplashScreen hide skipped", e);
        }

        // 3. Network Listener
        try {
          const { Network } = await import("@capacitor/network");
          const status = await Network.getStatus();
          setIsOffline(!status.connected);

          const netListener = await Network.addListener("networkStatusChange", (netStatus) => {
            setIsOffline(!netStatus.connected);
          });
          cleanupFuncs.push(() => netListener.remove());
        } catch (e) {
          console.warn("Network listener setup skipped", e);
        }

        // 4. Android Hardware Back Button Listener
        try {
          const { App } = await import("@capacitor/app");
          const backListener = await App.addListener("backButton", async () => {
            // Check if a modal / dialog / drawer is open
            const activeModal = document.querySelector(
              '[role="dialog"], [role="alertdialog"], [data-state="open"]'
            );
            if (activeModal) {
              // Simulate Escape key press to close modal cleanly
              const escEvent = new KeyboardEvent("keydown", {
                key: "Escape",
                keyCode: 27,
                bubbles: true,
                cancelable: true,
              });
              document.dispatchEvent(escEvent);
              return;
            }

            // Path-based navigation handling
            const currentPath = window.location.pathname;
            const rootPages = ["/dashboard", "/login", "/register", "/"];

            if (rootPages.includes(currentPath)) {
              await App.minimizeApp();
            } else if (window.history.length > 1) {
              window.history.back();
            } else {
              router.push("/dashboard");
            }
          });

          cleanupFuncs.push(() => backListener.remove());
        } catch (e) {
          console.warn("BackButton listener setup skipped", e);
        }

        // 5. External Link Interceptor (Opens external links in system browser)
        try {
          const { Browser } = await import("@capacitor/browser");
          const handleLinkClick = (e: MouseEvent) => {
            const target = (e.target as HTMLElement)?.closest("a");
            if (!target) return;
            const href = target.getAttribute("href");
            if (!href) return;

            if (href.startsWith("http://") || href.startsWith("https://")) {
              const targetUrl = new URL(href, window.location.origin);
              if (targetUrl.origin !== window.location.origin) {
                e.preventDefault();
                Browser.open({ url: href });
              }
            }
          };

          document.addEventListener("click", handleLinkClick);
          cleanupFuncs.push(() => document.removeEventListener("click", handleLinkClick));
        } catch (e) {
          console.warn("Browser link listener setup skipped", e);
        }
      } catch (err) {
        console.error("Capacitor initialization error", err);
      }
    }

    initCapacitor();

    return () => {
      cleanupFuncs.forEach((fn) => fn());
    };
  }, [pathname, router]);

  // Offline Warning Banner
  if (isOffline) {
    return (
      <div className="fixed inset-x-0 top-0 z-[9999] flex items-center justify-between gap-3 bg-destructive px-4 py-3 text-destructive-foreground shadow-lg animate-in slide-in-from-top duration-300">
        <div className="flex items-center gap-2 text-sm font-medium">
          <WifiOff className="size-5 shrink-0" />
          <span>لا يوجد اتصال بالإنترنت. تحقق من الشبكة وحاول مرة أخرى.</span>
        </div>
        <Button
          size="sm"
          variant="secondary"
          className="h-8 shrink-0 text-xs"
          onClick={() => window.location.reload()}
        >
          <RefreshCw className="mr-1 size-3" />
          إعادة المحاولة
        </Button>
      </div>
    );
  }

  return null;
}
