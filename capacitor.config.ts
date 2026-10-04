import type { CapacitorConfig } from "@capacitor/cli";

// Live Production VPS Server URL
const SERVER_URL = process.env.CAPACITOR_SERVER_URL || "https://nursing.alisohail.tech";

const config: CapacitorConfig = {
  appId: "com.nursingai.app",
  appName: "Nursing AI",
  webDir: "public",
  server: {
    url: SERVER_URL,
    cleartext: true,
    androidScheme: "https",
    allowNavigation: ["*"],
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: "#0f5d75",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0f5d75",
      overlaysWebView: false,
    },
    Keyboard: {
      resize: "body",
      style: "DARK",
      resizeOnVirtualKeyboardShown: true,
    },
  },
};

export default config;
