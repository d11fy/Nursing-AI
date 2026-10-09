import type { MetadataRoute } from "next";
import { SITE_ORIGIN } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/download", "/privacy", "/terms", "/subscription-policy", "/file-policy", "/disclaimer"],
      disallow: ["/admin", "/dashboard", "/api/", "/auth/", "/downloads/"],
    },
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
    host: SITE_ORIGIN,
  };
}
