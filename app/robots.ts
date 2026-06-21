import type { MetadataRoute } from "next";
import { getAbsoluteSiteUrl, getSiteUrl } from "@/lib/site-metadata";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/create",
        "/debug",
        "/login",
        "/settings",
        "/tools/math3-self-test",
        "/tools/note-qa",
        "/tools/problem-booklet",
        "/tools/review",
      ],
    },
    sitemap: getAbsoluteSiteUrl("/sitemap.xml"),
    host: getSiteUrl(),
  };
}
