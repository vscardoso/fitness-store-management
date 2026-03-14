import type { Product, ProductListItem, Look, LookListItem, Category } from "@/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    next: { revalidate: 60 }, // ISR: revalidate every 60s
  });

  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${res.statusText}`);
  }

  return res.json();
}

// ── Products ─────────────────────────────────────────────────────────────────

export async function getProducts(params?: {
  search?: string;
  category_id?: number;
  skip?: number;
  limit?: number;
}): Promise<ProductListItem[]> {
  const query = new URLSearchParams();
  if (params?.search) query.set("search", params.search);
  if (params?.category_id) query.set("category_id", String(params.category_id));
  if (params?.skip) query.set("skip", String(params.skip));
  query.set("limit", String(params?.limit ?? 50));

  const qs = query.toString();
  return fetchApi<ProductListItem[]>(`/products${qs ? `?${qs}` : ""}`);
}

export async function getProduct(id: number): Promise<Product> {
  return fetchApi<Product>(`/products/${id}`);
}

export async function getFeaturedProducts(limit = 8): Promise<ProductListItem[]> {
  return fetchApi<ProductListItem[]>(`/products?limit=${limit}&skip=0`);
}

// ── Categories ───────────────────────────────────────────────────────────────

export async function getCategories(): Promise<Category[]> {
  return fetchApi<Category[]>("/categories");
}

// ── Looks ────────────────────────────────────────────────────────────────────

export async function getLooks(limit = 20): Promise<LookListItem[]> {
  return fetchApi<LookListItem[]>(`/looks?limit=${limit}`);
}

export async function getLook(id: number): Promise<Look> {
  return fetchApi<Look>(`/looks/${id}`);
}

// ── WhatsApp ─────────────────────────────────────────────────────────────────

export function buildWhatsAppUrl(message: string): string {
  const number = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "";
  const encoded = encodeURIComponent(message);
  return `https://wa.me/${number}?text=${encoded}`;
}

export function buildProductWhatsAppMessage(product: ProductListItem | Product): string {
  const storeName = process.env.NEXT_PUBLIC_STORE_NAME || "nossa loja";
  return `Olá! Vi o produto *${product.name}* em ${storeName} e tenho interesse. Poderia me dar mais informações?`;
}

export function buildLookWhatsAppMessage(look: LookListItem | Look): string {
  const storeName = process.env.NEXT_PUBLIC_STORE_NAME || "nossa loja";
  return `Olá! Vi o look *${look.name}* em ${storeName} e tenho interesse em experimentar as peças. Poderia me ajudar?`;
}
