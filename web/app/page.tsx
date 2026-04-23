import Link from "next/link";
import { getFeaturedProducts, getLooks, getCategories } from "@/services/api";
import LookCard from "@/components/LookCard";
import ProductsSection from "@/components/sections/ProductsSection";

export const revalidate = 60;

const WA_NUM = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "";
const STORE  = process.env.NEXT_PUBLIC_STORE_NAME || "Fitness Store";
const waUrl  = (msg: string) => `https://wa.me/${WA_NUM}?text=${encodeURIComponent(msg)}`;

export default async function HomePage() {
  const [productsResult, looksResult, categoriesResult] = await Promise.allSettled([
    getFeaturedProducts(24),
    getLooks(4),
    getCategories(),
  ]);

  const productList  = productsResult.status === "fulfilled" ? productsResult.value : [];
  const lookList     = looksResult.status === "fulfilled"
    ? looksResult.value.filter((l) => l.is_public).slice(0, 4)
    : [];
  const categoryList = categoriesResult.status === "fulfilled" ? categoriesResult.value : [];

  // Fallback categories if API returns none
  const fallbackCategories = categoryList.length > 0
    ? categoryList
    : [
        { id: 1, name: "Tops" },
        { id: 2, name: "Leggings" },
        { id: 3, name: "Shorts" },
        { id: 4, name: "Acessorios" },
      ];

  return (
    <>
      {/* ══════════════════════════════════════════════════════
          1. HERO — Impacto imediato
      ══════════════════════════════════════════════════════ */}
      <section
        className="relative min-h-screen flex items-center overflow-hidden"
        style={{ background: "linear-gradient(135deg, var(--surface) 0%, #160d1e 50%, var(--surface) 100%)" }}
      >
        {/* Animated background glows */}
        <div className="absolute inset-0 pointer-events-none">
          <div
            className="absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full blur-[120px] opacity-20 animate-pulse"
            style={{ background: "var(--pink)" }}
          />
          <div
            className="absolute bottom-1/3 right-1/5 w-[350px] h-[350px] rounded-full blur-[100px] opacity-10"
            style={{ background: "var(--pink-light)", animation: "pulse 4s ease-in-out infinite" }}
          />
          <div
            className="absolute top-2/3 left-1/2 w-[200px] h-[200px] rounded-full blur-[80px] opacity-[0.07]"
            style={{ background: "#7c3aed", animation: "pulse 6s ease-in-out infinite reverse" }}
          />
          {/* Grid pattern */}
          <div
            className="absolute inset-0 opacity-[0.02]"
            style={{
              backgroundImage: "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
              backgroundSize: "60px 60px",
            }}
          />
        </div>

        <div className="relative max-w-7xl mx-auto px-5 sm:px-8 w-full pt-32 pb-20">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div className="">
            {/* Label */}
            <div
              className="inline-flex items-center gap-2 mb-8 px-4 py-1.5 rounded-full text-sm font-medium glass"
              style={{ borderColor: "rgba(255,26,108,0.25)", color: "var(--pink-light)" }}
            >
              <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: "var(--pink-light)" }}/>
              Nova colecao disponivel
            </div>

            {/* Headline */}
            <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-black text-white leading-[0.95] mb-8 tracking-tight">
              Performance.<br/>
              <span className="text-gradient">Estilo.</span><br/>
              Resultado.
            </h1>

            <p className="text-white/50 text-lg md:text-xl leading-relaxed mb-12 max-w-lg">
              Roupas fitness que unem tecnologia, conforto e design. Vista o que te faz
              sentir invencivel — dentro e fora da academia.
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap gap-4">
              <a href="#produtos" className="btn-pink text-base px-8 py-4">
                Ver produtos
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-5 h-5">
                  <path d="M7 17L17 7M17 7H7M17 7v10" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </a>
              <a
                href={waUrl("Ola! Gostaria de montar um look personalizado")}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-outline text-base px-8 py-4"
              >
                Monte seu look
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-5 h-5">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
                    strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </a>
            </div>

            {/* Dynamic counters */}
            <div className="flex flex-wrap gap-10 mt-16">
              {[
                {
                  value: productList.length > 0 ? `${productList.length}+` : "---",
                  label: "produtos",
                  icon: (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-5 h-5" style={{ color: "var(--pink)" }}>
                      <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  ),
                },
                {
                  value: "Gratis",
                  label: "envio acima de R$200",
                  icon: (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-5 h-5" style={{ color: "var(--pink)" }}>
                      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  ),
                },
                {
                  value: String.fromCodePoint(0x2605).repeat(5),
                  label: "atendimento",
                  icon: (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-5 h-5" style={{ color: "var(--pink)" }}>
                      <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  ),
                },
              ].map(({ value, label, icon }) => (
                <div key={label} className="flex items-start gap-3">
                  <div className="mt-0.5">{icon}</div>
                  <div>
                    <p className="text-white font-bold text-xl">{value}</p>
                    <p className="text-white/30 text-xs uppercase tracking-wider mt-0.5">{label}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Coluna direita — produto em destaque */}
          {productList[0]?.image_url ? (
            <div className="hidden lg:flex items-center justify-center relative">
              {/* Glow atrás da imagem */}
              <div
                className="absolute inset-0 rounded-3xl blur-[80px] opacity-20"
                style={{ background: "var(--pink)" }}
              />
              <div className="relative w-full max-w-sm aspect-[3/4] rounded-3xl overflow-hidden shadow-2xl"
                style={{ border: "1px solid rgba(255,26,108,0.15)" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={productList[0].image_url}
                  alt={productList[0].name}
                  className="w-full h-full object-cover"
                />
                {/* Overlay com nome + CTA */}
                <div
                  className="absolute bottom-0 left-0 right-0 p-6"
                  style={{ background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)" }}
                >
                  <p className="text-white/50 text-xs uppercase tracking-widest mb-1">
                    {productList[0].category?.name ?? "Destaque"}
                  </p>
                  <p className="text-white font-bold text-lg leading-tight line-clamp-2 mb-3">
                    {productList[0].name}
                  </p>
                  <a
                    href={`/produtos/${productList[0].id}`}
                    className="inline-flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-full"
                    style={{ background: "rgba(255,26,108,0.9)", color: "#fff" }}
                  >
                    Ver produto
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-4 h-4">
                      <path d="M9 18l6-6-6-6" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  </a>
                </div>
              </div>
            </div>
          ) : (
            <div className="hidden lg:block" />
          )}
          </div>
        </div>

        {/* Scroll hint */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 opacity-30 animate-bounce">
          <span className="text-white text-[10px] uppercase tracking-[0.25em]">scroll</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-4 h-4 text-white">
            <path d="M19 14l-7 7m0 0l-7-7m7 7V3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          2. CATEGORIAS + 3. PRODUTOS — Hybrid section
      ══════════════════════════════════════════════════════ */}
      <ProductsSection products={productList} categories={fallbackCategories} />

      {/* ══════════════════════════════════════════════════════
          4. PROCESSO CONDICIONAL — USP
      ══════════════════════════════════════════════════════ */}
      <section className="py-24 relative overflow-hidden">
        {/* Top/bottom dividers */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-0 right-0 h-px divider"/>
          <div className="absolute bottom-0 left-0 right-0 h-px divider"/>
          {/* Background glow */}
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full blur-[150px] opacity-[0.06]"
            style={{ background: "var(--pink)" }}
          />
        </div>

        <div className="max-w-7xl mx-auto px-5 sm:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">

            {/* Text */}
            <div>
              <p className="section-label mb-4">exclusividade</p>
              <h2 className="text-4xl md:text-5xl lg:text-6xl font-black text-white leading-[1.05] mb-6">
                Experimente<br/>
                <span className="text-gradient">antes de comprar</span>
              </h2>
              <p className="text-white/50 text-lg leading-relaxed mb-10">
                Com nosso sistema <strong className="text-white">Condicional</strong>, voce recebe
                as pecas em casa, experimenta com calma e paga apenas o que ficar.
                Sem pressao, sem fila, sem compromisso.
              </p>
              <a
                href={waUrl("Ola! Quero saber mais sobre o sistema condicional")}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-pink text-base px-8 py-3.5"
              >
                Quero experimentar
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-5 h-5">
                  <path d="M9 18l6-6-6-6" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </a>
            </div>

            {/* Steps */}
            <div className="grid grid-cols-1 gap-5">
              {[
                {
                  n: "01",
                  title: "Escolha o look",
                  desc: "Monte uma combinacao com nossos produtos ou peca sugestao personalizada.",
                  icon: (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-6 h-6">
                      <path d="M4 6h16M4 10h16M4 14h16M4 18h16" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  ),
                },
                {
                  n: "02",
                  title: "Receba em casa",
                  desc: "Enviamos as pecas para voce experimentar com toda tranquilidade no conforto do lar.",
                  icon: (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-6 h-6">
                      <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  ),
                },
                {
                  n: "03",
                  title: "Pague o que ficou",
                  desc: "Devolveu o resto? Pagou so o que amou. Simples assim, sem complicacao.",
                  icon: (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-6 h-6">
                      <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  ),
                },
              ].map(({ n, title, desc, icon }) => (
                <div
                  key={n}
                  className="group flex gap-5 p-6 rounded-2xl glass transition-all duration-300 hover:border-pink-500/20"
                >
                  {/* Number with gradient */}
                  <div className="flex-shrink-0 flex flex-col items-center gap-2">
                    <span className="text-gradient text-3xl font-black leading-none">{n}</span>
                    <span className="text-white/20">{icon}</span>
                  </div>
                  <div>
                    <h4 className="text-white font-bold text-lg mb-1.5">{title}</h4>
                    <p className="text-white/40 text-sm leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          5. LOOKS EM ALTA — Lookbook
      ══════════════════════════════════════════════════════ */}
      {lookList.length > 0 && (
        <section className="py-24">
          <div className="max-w-7xl mx-auto px-5 sm:px-8">
            {/* Header */}
            <div className="flex items-end justify-between mb-12">
              <div>
                <p className="section-label mb-2">lookbook</p>
                <h2 className="text-3xl md:text-4xl lg:text-5xl font-black text-white leading-tight">
                  Looks em alta
                </h2>
                <p className="text-white/40 text-base mt-3 max-w-md">
                  Combinacoes prontas para voce se inspirar. Peca o seu look completo com desconto.
                </p>
              </div>
              <Link
                href="/looks"
                className="hidden sm:flex items-center gap-2 text-sm font-semibold text-white/50 hover:text-white transition-colors btn-outline px-5 py-2.5"
              >
                Ver galeria
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-4 h-4">
                  <path d="M9 18l6-6-6-6" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </Link>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
              {lookList.map((look) => (
                <LookCard key={look.id} look={look} />
              ))}
            </div>

            <div className="flex sm:hidden justify-center mt-8">
              <Link href="/looks" className="btn-outline text-sm px-6 py-2.5">Ver todos os looks</Link>
            </div>
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════════════════
          6. CTA FINAL — WhatsApp
      ══════════════════════════════════════════════════════ */}
      <section className="py-10 pb-24">
        <div className="max-w-7xl mx-auto px-5 sm:px-8">
          <div
            className="relative rounded-3xl overflow-hidden px-8 py-20 md:py-24 text-center"
            style={{ background: "linear-gradient(135deg, #1a0010 0%, #2a0025 50%, #1a0010 100%)" }}
          >
            {/* Animated glows */}
            <div className="absolute inset-0 pointer-events-none">
              <div
                className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-48 rounded-full blur-[100px] opacity-30"
                style={{ background: "var(--pink)" }}
              />
              <div
                className="absolute bottom-0 left-1/4 w-64 h-64 rounded-full blur-[80px] opacity-15"
                style={{ background: "var(--pink-light)" }}
              />
              <div
                className="absolute top-1/2 right-1/4 w-48 h-48 rounded-full blur-[80px] opacity-10"
                style={{ background: "#7c3aed" }}
              />
            </div>

            {/* Border */}
            <div className="absolute inset-0 rounded-3xl pointer-events-none" style={{ border: "1px solid rgba(255,26,108,0.2)" }}/>

            <div className="relative max-w-2xl mx-auto">
              <p className="section-label mb-5">atendimento exclusivo</p>

              <h2 className="text-4xl md:text-5xl lg:text-6xl font-black text-white mb-5 leading-[1.05]">
                Nao encontrou<br/>
                <span className="text-gradient">o que procura?</span>
              </h2>

              <p className="text-white/50 text-lg md:text-xl mb-12 max-w-lg mx-auto leading-relaxed">
                Nossa equipe te ajuda a montar o look perfeito, verificar
                disponibilidade ou fazer um pedido especial.
              </p>

              <a
                href={waUrl("Ola! Vim pelo site e nao encontrei o que procuro. Poderia me ajudar?")}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-3 font-bold text-lg px-12 py-5 rounded-2xl transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_0_60px_rgba(37,211,102,0.3)]"
                style={{ background: "#25D366", color: "#fff", boxShadow: "0 0 30px rgba(37,211,102,0.2)" }}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                Falar no WhatsApp
              </a>

              {/* Trust signals */}
              <div className="flex flex-wrap items-center justify-center gap-6 mt-10">
                {[
                  { icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z", label: "Pagamento seguro" },
                  { icon: "M13 2L3 14h9l-1 8 10-12h-9l1-8z", label: "Resposta rapida" },
                  { icon: "M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z", label: "Atendimento humano" },
                ].map(({ icon, label }) => (
                  <div key={label} className="flex items-center gap-2 text-white/30 text-xs">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-4 h-4">
                      <path d={icon} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    {label}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
