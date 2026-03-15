import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { getProduct } from "@/services/api";

export const revalidate = 60;

interface Props { params: Promise<{ id: string }> }

const fmt  = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
const WA   = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "";
const wa   = (msg: string) => `https://wa.me/${WA}?text=${encodeURIComponent(msg)}`;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const p = await getProduct(Number(id));
    return {
      title: p.name,
      description: p.description ?? `${p.name} · ${process.env.NEXT_PUBLIC_STORE_NAME}`,
      openGraph: { images: p.image_url ? [p.image_url] : [] },
    };
  } catch { return { title: "Produto" }; }
}

export default async function ProductPage({ params }: Props) {
  const { id } = await params;

  let product;
  try { product = await getProduct(Number(id)); }
  catch { notFound(); }
  if (!product) notFound();

  const price     = product.sale_price ?? product.price ?? 0;
  const inStock   = (product.current_stock ?? 0) > 0;
  const sizes     = Array.from(new Set(product.variants?.map((v) => v.size).filter((s): s is string => Boolean(s)) ?? []));
  const colors    = Array.from(new Set(product.variants?.map((v) => v.color).filter((c): c is string => Boolean(c)) ?? []));
  const minPrice  = product.variants?.length ? Math.min(...product.variants.map((v) => v.price)) : price;

  const waMsg     = `Olá! Vi o produto *${product.name}* no catálogo e tenho interesse 🛍️`;
  const waCondit  = `Olá! Quero fazer um condicional do produto *${product.name}*. Poderia me ajudar? 😊`;

  return (
    <div style={{ background: "#0d0d18" }}>
      {/* Breadcrumb */}
      <div className="max-w-7xl mx-auto px-5 sm:px-8 pt-24 pb-4">
        <nav className="flex items-center gap-2 text-xs text-white/30">
          <Link href="/" className="hover:text-white/60 transition-colors">Início</Link>
          <span>/</span>
          {product.category && <><span>{product.category.name}</span><span>/</span></>}
          <span className="text-white/60">{product.name}</span>
        </nav>
      </div>

      {/* Main */}
      <div className="max-w-7xl mx-auto px-5 sm:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20">

          {/* ── Imagem ── */}
          <div className="relative">
            <div
              className="relative aspect-square rounded-3xl overflow-hidden"
              style={{ background: "linear-gradient(135deg, #13131f, #1e1e30)" }}
            >
              {/* Glow bg */}
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-80 h-40 blur-3xl opacity-20 rounded-full" style={{ background: "#ff1a6c" }}/>
              </div>

              {product.image_url ? (
                <Image
                  src={product.image_url}
                  alt={product.name}
                  fill
                  className="object-cover"
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  priority
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-3">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-16 h-16 text-white/10">
                    <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth="1"/>
                    <circle cx="8.5" cy="8.5" r="1.5" strokeWidth="1"/>
                    <path d="M21 15l-5-5L5 21" strokeWidth="1"/>
                  </svg>
                  <p className="text-white/20 text-sm">Foto em breve</p>
                </div>
              )}

              {/* Stock badge */}
              <div className="absolute top-4 left-4">
                <span
                  className="text-xs font-semibold px-3 py-1.5 rounded-full"
                  style={inStock
                    ? { background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)", color: "#4ade80" }
                    : { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.4)" }
                  }
                >
                  {inStock ? "Em estoque" : "Esgotado"}
                </span>
              </div>
            </div>
          </div>

          {/* ── Info ── */}
          <div className="flex flex-col">
            {/* Category */}
            {product.category && (
              <p className="section-label mb-3">{product.category.name}</p>
            )}

            {/* Name */}
            <h1 className="text-4xl md:text-5xl font-black text-white leading-tight mb-2 tracking-tight">
              {product.name}
            </h1>

            {product.brand && (
              <p className="text-white/30 text-sm mb-6">{product.brand}</p>
            )}

            {/* Price */}
            <div className="mb-8">
              <span className="price text-5xl font-black">{fmt(price)}</span>
              {product.variants && product.variants.length > 0 && minPrice < price && (
                <p className="text-white/30 text-sm mt-1">A partir de {fmt(minPrice)}</p>
              )}
            </div>

            {/* Variants */}
            {sizes.length > 0 && (
              <div className="mb-6">
                <p className="text-white/40 text-xs uppercase tracking-widest mb-3">Tamanhos</p>
                <div className="flex flex-wrap gap-2">
                  {sizes.map((s) => (
                    <span
                      key={s}
                      className="px-5 py-2 rounded-xl text-sm font-medium text-white transition-all cursor-default"
                      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {colors.length > 0 && (
              <div className="mb-6">
                <p className="text-white/40 text-xs uppercase tracking-widest mb-3">Cores</p>
                <div className="flex flex-wrap gap-2">
                  {colors.map((c) => (
                    <span
                      key={c}
                      className="px-5 py-2 rounded-xl text-sm font-medium text-white"
                      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
                    >
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Details chips */}
            <div className="flex flex-wrap gap-2 mb-8">
              {product.gender   && <span className="tag">{product.gender}</span>}
              {product.material && <span className="tag">{product.material}</span>}
              {product.is_activewear && <span className="tag-pink">Activewear</span>}
            </div>

            {/* Description */}
            {product.description && (
              <div className="mb-8 p-5 rounded-2xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
                <p className="text-white/50 text-sm leading-relaxed">{product.description}</p>
              </div>
            )}

            {/* CTAs */}
            <div className="mt-auto space-y-3">
              <a
                href={wa(waMsg)}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-3 font-bold text-white text-base py-4 rounded-2xl transition-all hover:scale-[1.02]"
                style={{ background: "#25D366", boxShadow: "0 0 24px rgba(37,211,102,0.3)" }}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                Pedir via WhatsApp
              </a>

              <a
                href={wa(waCondit)}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 font-semibold text-sm py-3.5 rounded-2xl transition-all hover:scale-[1.01]"
                style={{ background: "rgba(255,26,108,0.1)", border: "1px solid rgba(255,26,108,0.2)", color: "#ff6ba8" }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-4 h-4">
                  <path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Pedir condicional (experimente em casa)
              </a>
            </div>

            <p className="text-center text-white/20 text-xs mt-3">
              Atendimento rápido · Enviamos para todo o Brasil
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
