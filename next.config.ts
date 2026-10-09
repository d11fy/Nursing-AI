import type { NextConfig } from "next";
import { securityHeaderRules } from "./lib/http/security-headers.mjs";

const nextConfig: NextConfig = {
  // Keep page-generation concurrency low on the shared 4 GB VPS.
  experimental: {
    authInterrupts: true,
    // Allow the 50MB lecture upload plus multipart fields through Proxy.
    proxyClientMaxBodySize: "64mb",
    cpus: 1,
    webpackMemoryOptimizations: true,
    webpackBuildWorker: true,
  },
  // Parse documents at runtime instead of bundling their Node.js parsers.
  serverExternalPackages: ["pdf-parse", "mammoth"],
  poweredByHeader: false,
  async headers() {
    return securityHeaderRules({ production: process.env.NODE_ENV === "production" });
  },
};

export default nextConfig;
