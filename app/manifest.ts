import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Nursing AI",
    short_name: "Nursing AI",
    description: "رفيقك الذكي لدراسة التمريض",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f6fafc",
    theme_color: "#0f5d75",
    lang: "ar",
    dir: "rtl",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
