import type { MetadataRoute } from "next";
import { SITE_ORIGIN } from "@/lib/site";

const publicPaths = ["", "/download", "/privacy", "/terms", "/subscription-policy", "/file-policy", "/disclaimer"];

export default function sitemap(): MetadataRoute.Sitemap {
  return publicPaths.map((path, index) => ({
    url: `${SITE_ORIGIN}${path}`,
    changeFrequency: path === "" || path === "/download" ? "weekly" : "monthly",
    priority: index === 0 ? 1 : path === "/download" ? 0.9 : 0.7,
  }));
}
