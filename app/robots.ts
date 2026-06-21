import type { MetadataRoute } from "next";
import { getAbsoluteSiteUrl, getSiteUrl } from "@/lib/site-metadata";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/create", "/debug", "/login", "/settings"],
    },
    sitemap: getAbsoluteSiteUrl("/sitemap.xml"),
    host: getSiteUrl(),
  };
}
