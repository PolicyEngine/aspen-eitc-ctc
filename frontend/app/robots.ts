import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: "https://policyengine.org/us/aspen-eitc-ctc/sitemap.xml",
  };
}
