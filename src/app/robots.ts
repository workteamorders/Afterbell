import type { MetadataRoute } from "next";
import { CONFIG } from "@/lib/config";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/styleguide", "/offline"] },
    sitemap: `${CONFIG.siteUrl}/sitemap.xml`,
  };
}
