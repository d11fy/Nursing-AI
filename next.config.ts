import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep page-generation concurrency low on the shared 4 GB VPS.
  experimental: {
    cpus: 1,
    webpackMemoryOptimizations: true,
    webpackBuildWorker: true,
  },
  // Parse documents at runtime instead of bundling their Node.js parsers.
  serverExternalPackages: ["pdf-parse", "mammoth"],
};

export default nextConfig;
