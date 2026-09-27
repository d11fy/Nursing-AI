import nextEnv from "@next/env";
import { runMigrations } from "./migrate.mjs";
import { getAIConfig } from "../lib/ai/config.mjs";
process.env.NODE_ENV ||= "production";
nextEnv.loadEnvConfig(process.cwd());
for (const name of ["DATABASE_URL", "APP_URL", "AUTH_SECRET"]) {
  if (!process.env[name]) throw new Error(`Missing required environment variable: ${name}`);
}
getAIConfig();
if (process.env.AUTH_SECRET.length < 32) throw new Error("AUTH_SECRET must be at least 32 characters");
const appUrl = new URL(process.env.APP_URL);
if (appUrl.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(appUrl.hostname)) throw new Error("APP_URL must use HTTPS in production");
await runMigrations();
// Start in this process so container stop signals reach Next.js directly.
const { startServer } = await import("next/dist/server/lib/start-server.js");
await startServer({ dir: process.cwd(), isDev: false, hostname: "0.0.0.0", port: Number(process.env.PORT || 3000), allowRetry: false });
