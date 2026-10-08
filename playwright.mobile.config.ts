import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/mobile-e2e",
  timeout: 30000,
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: "http://127.0.0.1:3001",
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    launchOptions: process.env.BROWSER_EXECUTABLE
      ? { executablePath: process.env.BROWSER_EXECUTABLE }
      : {},
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm --prefix mobile run dev -- --host 127.0.0.1",
    url: "http://127.0.0.1:3001",
    reuseExistingServer: !process.env.CI,
  },
  reporter: "list",
});
