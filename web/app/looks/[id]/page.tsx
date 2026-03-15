import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { getLook } from "@/services/api";

export const revalidate = 60;

interface Props { params: Promise<{ id: string }> }

const fmt = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
const WA  = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "";
const wa  = (msg: string) => `https://wa.me/${WA}?text=${encodeURIComponent(msg)}`;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const look = await getLook(Number(id));
    return { title: look.name, description: look.description ?? `Look: ${look.name}` };
  } catch { return { title: "Look" }; }
}

export default async function LookDetailPage({ params }: Props) {
  const { id } = await params;

  let look;
  try { look = await getLook(Number(id)); }
  catch { notFound(); }
  if (!look) notFound();

  const hasDiscount = look.discount_percentage > 0;
  const finalPrice  = hasDiscount
    ? look.total_price * (1 - look.discount_percentage / 100)
    : look.total_price;

  const waMsg     = `Olá! Vi o look *${look.name}* no site e tenho interesse! 💕`;
  const waCondit  = `Olá! Quero fazer um condicional do look *${look.name}* (${look.items_count} peças). Poderia me ajudar? 😊`;

  return (
    <div style={{ background: "#0d0d18" }}>
      {/* Breadcrumb */}
      <div className="max-w-7xl mx-auto px-5 sm:px-8 pt-24 pb-4">
        <nav className="flex items-center gap-2 text-xs text-white/30">
          <Link href="/" className="hover:text-white/60 transition-colors">Início</Link>
          <span>/</span>
          <Link href="/looks" className="hover:text-white/60 transition-colors">Looks</Link>
          <span>/</span>
          <span className="text-white/60">{look.name}</span>
        </nav>
      </div>

      <div className="max-w-7xl mx-auto px-5 sm:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-10 lg:gap-16">

          {/* ── Sticky sidebar ── */}
          <div className="lg:col-span-2 order-2 lg:order-1">
            <div className="lg:sticky lg:top-24 space-y-5">

              {/* Look hero card */}
              <div
                className="relative rounded-3xl overflow-hidden p-8 text-center"
                style={{ background: "linear-gradient(135deg, #1a0e20, #13131f)", border: "1px solid rgba(255,26,108,0.15)" }}
              >
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-32 blur-3xl opacity-25 rounded-full" style={{ background: "#ff1a6c" }}/>
                <div className="relative">
                  <div
                    className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-5"
                    style={{ background: "rgba(255,26,108,0.12)", border: "1px solid rgba(255,26,108,0.2)" }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-10 h-10 text-pink-400">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
                        strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <h1 className="text-2xl font-black text-white mb-2 leading-tight">{look.name}</h1>
                  {look.description && (
                    <p className="text-white/40 text-sm leading-relaxed">{look.description}</p>
                  )}
                </div>
              </div>

              {/* Price summary */}
              <div
                className="rounded-2xl p-5"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
              >
                <p className="text-white/40 text-xs uppercase tracking-widest mb-4">Resumo do look</p>
                <div className="space-y-2.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-white/40">{look.items_count} peça{look.items_count !== 1 ? "s" : ""}</span>
                    {look.total_price > 0 && <span className="text-white">{fmt(look.total_price)}</span>}
                  </div>

                  {hasDiscount && (
                    <div className="flex justify-between text-sm">
                      <span className="text-green-400">Desconto look ({look.discount_percentage}%)</span>
                      <span className="text-green-400">-{fmt(look.total_price - finalPrice)}</span>
                    </div>
                  )}

                  {look.total_price > 0 && (
                    <>
                      <div className="divider my-3"/>
                      <div className="flex justify-between">
                        <span className="text-white font-semibold">Total</span>
                        <span className="price text-xl font-black">{fmt(finalPrice)}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* CTAs */}
              <a
                href={wa(waCondit)}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-3 font-bold text-white py-4 rounded-2xl transition-all hover:scale-[1.02]"
                style={{ background: "#25D366", boxShadow: "0 0 24px rgba(37,211,102,0.3)" }}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                Experimentar este look
              </a>

              <a
                href={wa(waMsg)}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 text-sm font-semibold py-3 rounded-2xl transition-all"
                style={{ background: "rgba(255,26,108,0.08)", border: "1px solid rgba(255,26,108,0.2)", color: "#ff6ba8" }}
              >
                Só tenho interesse — perguntar preço
              </a>

              <p className="text-center text-white/20 text-xs">
                Condicional: pague só o que ficar 🛍️
              </p>
            </div>
          </div>

          {/* ── Items grid ── */}
          <div className="lg:col-span-3 order-1 lg:order-2">
            <h2 className="text-xl font-bold text-white mb-6">
              Peças do look
              <span className="text-white/30 font-normal text-base ml-2">({look.items.length})</span>
            </h2>

            {look.items.length === 0 ? (
              <p className="text-white/30 text-center py-12">Nenhuma peça adicionada ainda.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {look.items
                  .sort((a, b) => a.position - b.position)
                  .map((item) => (
                    <Link
                      key={item.id}
                      href={`/produtos/${item.product_id}`}
                      className="group flex gap-4 p-4 rounded-2xl transition-all"
                      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}
                    >
                      {/* Thumbnail */}
                      <div
                        className="relative w-20 h-20 rounded-xl overflow-hidden flex-shrink-0"
                        style={{ background: "#1e1e30" }}
                      >
                        {item.product_image_url ? (
                          <Image
                            src={item.product_image_url}
                            alt={item.product_name ?? "Produto"}
                            fill
                            className="object-cover group-hover:scale-105 transition-transform duration-300"
                            sizes="80px"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-7 h-7 text-white/10">
                              <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth="1"/>
                              <circle cx="8.5" cy="8.5" r="1.5" strokeWidth="1"/>
                              <path d="M21 15l-5-5L5 21" strokeWidth="1"/>
                            </svg>
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <h4 className="text-white font-semibold text-sm line-clamp-2 group-hover:text-pink-400 transition-colors">
                          {item.product_name ?? `Produto #${item.product_id}`}
                        </h4>
                        {item.variant_description && (
                          <p className="text-white/30 text-xs mt-0.5">{item.variant_description}</p>
                        )}
                        {item.unit_price && (
                          <p className="price text-sm font-bold mt-2">{fmt(item.unit_price)}</p>
                        )}
                      </div>

                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        className="w-4 h-4 text-white/20 group-hover:text-pink-400 flex-shrink-0 self-center transition-colors">
                        <path d="M9 18l6-6-6-6" strokeWidth="2" strokeLinecap="round"/>
                      </svg>
                    </Link>
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
