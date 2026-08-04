import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: "https://audit.birdbrain.it", lastModified: new Date(), changeFrequency: "monthly", priority: 0.8 }];
}
