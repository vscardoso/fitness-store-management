import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { getProduct } from "@/services/api";
import AddToCartButton from "@/components/AddToCartButton";

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

  const price      = product.sale_price ?? product.price ?? 0;
  const inStock    = (product.current_stock ?? 0) > 0;
  const sizes      = Array.from(new Set(product.variants?.map((v) => v.size).filter((s): s is string => Boolean(s)) ?? []));
  const colors     = Array.from(new Set(product.variants?.map((v) => v.color).filter((c): c is string => Boolean(c)) ?? []));
  const installment = price >= 30 ? fmt(price / 3) : null;

  const waCondit = `Olá! Quero fazer um condicional do produto *${product.name}*. Posso receber em casa para experimentar?`;

  return (
    <div style={{ background: "#0d0d18" }}>
      {/* Breadcrumb */}
      <div className="max-w-7xl mx-auto px-5 sm:px-8 pt-24 pb-4">
        <nav className="flex items-center gap-2 text-xs text-white/30">
          <Link href="/" className="hover:text-white/60 transition-colors">Início</Link>
          <span>/</span>
          {product.category && (
            <><span className="hover:text-white/60 transition-colors cursor-pointer">{product.category.name}</span><span>/</span></>
          )}
          <span className="text-white/50 line-clamp-1">{product.name}</span>
        </nav>
      </div>

      {/* Main */}
      <div className="max-w-7xl mx-auto px-5 sm:px-8 py-6 pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-10 lg:gap-16">

          {/* ── Imagem portrait 3:4 ── */}
          <div className="relative">
            <div
              className="relative overflow-hidden rounded-2xl"
              style={{ aspectRatio: "3/4", background: "linear-gradient(135deg, #13131f, #1e1e30)" }}
            >
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

              {/* Badge estoque */}
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
            {product.category && (
              <p className="section-label mb-3">{product.category.name}</p>
            )}

            <h1 className="text-3xl md:text-4xl lg:text-5xl font-black text-white leading-tight mb-2 tracking-tight">
              {product.name}
            </h1>

            {product.brand && (
              <p className="text-white/30 text-sm mb-5">{product.brand}</p>
            )}

            {/* Price block */}
            <div className="mb-6">
              <span className="price text-4xl md:text-5xl font-black">{fmt(price)}</span>
              {installment && (
                <p className="text-white/40 text-sm mt-1">3x de {installment} sem juros</p>
              )}
            </div>

            {/* Trust signals */}
            <div className="grid grid-cols-3 gap-2 mb-8 p-4 rounded-2xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              {[
                { icon: "M13 2L3 14h9l-1 8 10-12h-9l1-8z", title: "Frete Grátis", sub: "acima de R$200" },
                { icon: "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15", title: "1ª Troca", sub: "fácil e grátis" },
                { icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z", title: "Pagamento", sub: "seguro e flexível" },
              ].map(({ icon, title, sub }) => (
                <div key={title} className="flex flex-col items-center text-center gap-1.5 py-1">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-5 h-5" style={{ color: "var(--pink-light)" }}>
                    <path d={icon} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <p className="text-white text-xs font-semibold leading-tight">{title}</p>
                  <p className="text-white/30 text-[10px] leading-tight">{sub}</p>
                </div>
              ))}
            </div>

            {/* Tamanhos */}
            {sizes.length > 0 && (
              <div className="mb-5">
                <p className="text-white/40 text-xs uppercase tracking-widest mb-3">Tamanhos disponíveis</p>
                <div className="flex flex-wrap gap-2">
                  {sizes.map((s) => (
                    <span key={s} className="px-4 py-2 rounded-lg text-sm font-medium text-white/70 transition-all"
                      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)" }}>
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Cores */}
            {colors.length > 0 && (
              <div className="mb-5">
                <p className="text-white/40 text-xs uppercase tracking-widest mb-3">Cores</p>
                <div className="flex flex-wrap gap-2">
                  {colors.map((c) => (
                    <span key={c} className="px-4 py-2 rounded-lg text-sm font-medium text-white/70"
                      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)" }}>
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Chips de detalhes */}
            {(product.gender || product.material || product.is_activewear) && (
              <div className="flex flex-wrap gap-2 mb-6">
                {product.gender   && <span className="tag">{product.gender}</span>}
                {product.material && <span className="tag">{product.material}</span>}
                {product.is_activewear && <span className="tag-pink">Activewear</span>}
              </div>
            )}

            {/* Descrição */}
            {product.description && (
              <div className="mb-8 p-4 rounded-xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                <p className="text-white/50 text-sm leading-relaxed">{product.description}</p>
              </div>
            )}

            {/* CTAs */}
            <div className="mt-auto space-y-3">
              {/* Primário: adicionar ao carrinho */}
              <AddToCartButton product={{ id: product.id, name: product.name, price, image_url: product.image_url ?? undefined }} />

              {/* Secundário: WhatsApp direto */}
              <a
                href={wa(`Olá! Vi o produto *${product.name}* no catálogo e tenho interesse. Poderia me ajudar?`)}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 font-semibold text-sm py-3.5 rounded-2xl transition-all hover:-translate-y-0.5"
                style={{ background: "rgba(37,211,102,0.1)", border: "1px solid rgba(37,211,102,0.25)", color: "#4ade80" }}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                Pedir direto no WhatsApp
              </a>

              {/* Condicional */}
              <a
                href={wa(waCondit)}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 font-semibold text-sm py-3.5 rounded-2xl transition-all hover:-translate-y-0.5"
                style={{ background: "rgba(255,26,108,0.08)", border: "1px solid rgba(255,26,108,0.2)", color: "#ff6ba8" }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-4 h-4">
                  <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Receber em casa para experimentar
              </a>
            </div>

            <p className="text-center text-white/20 text-xs mt-4">
              Atendimento rápido · Enviamos para todo o Brasil
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
