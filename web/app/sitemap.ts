import type { MetadataRoute } from "next";
import { getProducts, getLooks } from "@/services/api";

const BASE = "https://wamodafitness.com.br";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, looks] = await Promise.allSettled([
    getProducts({ limit: 500 }),
    getLooks(100),
  ]);

  const productUrls: MetadataRoute.Sitemap =
    products.status === "fulfilled"
      ? products.value.map((p) => ({
          url: `${BASE}/produtos/${p.id}`,
          lastModified: new Date(),
          changeFrequency: "weekly",
          priority: 0.8,
        }))
      : [];

  const lookUrls: MetadataRoute.Sitemap =
    looks.status === "fulfilled"
      ? looks.value
          .filter((l) => l.is_public)
          .map((l) => ({
            url: `${BASE}/looks/${l.id}`,
            lastModified: new Date(),
            changeFrequency: "weekly",
            priority: 0.6,
          }))
      : [];

  return [
    { url: BASE,                changeFrequency: "daily",   priority: 1.0, lastModified: new Date() },
    { url: `${BASE}/looks`,     changeFrequency: "weekly",  priority: 0.7, lastModified: new Date() },
    { url: `${BASE}/produtos`,  changeFrequency: "daily",   priority: 0.9, lastModified: new Date() },
    ...productUrls,
    ...lookUrls,
  ];
}
