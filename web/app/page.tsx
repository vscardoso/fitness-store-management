import Image from "next/image";
import Link from "next/link";
import { getFeaturedProducts, getLooks } from "@/services/api";
import ProductCard from "@/components/ProductCard";
import LookCard from "@/components/LookCard";

export const revalidate = 60;

const WA_NUM   = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "";
const STORE    = process.env.NEXT_PUBLIC_STORE_NAME || "Fitness Store";
const fmt      = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
const waUrl    = (msg: string) => `https://wa.me/${WA_NUM}?text=${encodeURIComponent(msg)}`;

export default async function HomePage() {
  const [products, looks] = await Promise.allSettled([
    getFeaturedProducts(16),
    getLooks(4),
  ]);

  const productList = products.status === "fulfilled" ? products.value : [];
  const lookList    = looks.status === "fulfilled"
    ? looks.value.filter((l) => l.is_public).slice(0, 4)
    : [];

  return (
    <>
      {/* ══════════════════════════════════════════════════════
          HERO
      ══════════════════════════════════════════════════════ */}
      <section
        className="relative min-h-screen flex items-center overflow-hidden"
        style={{ background: "linear-gradient(135deg, #0d0d18 0%, #160d1e 50%, #0d0d18 100%)" }}
      >
        {/* Background glows */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full blur-3xl opacity-20" style={{ background: "#ff1a6c" }}/>
          <div className="absolute bottom-1/4 right-1/4 w-64 h-64 rounded-full blur-3xl opacity-10" style={{ background: "#ff6ba8" }}/>
          {/* Grid pattern */}
          <div
            className="absolute inset-0 opacity-[0.025]"
            style={{
              backgroundImage: "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
              backgroundSize: "60px 60px",
            }}
          />
        </div>

        <div className="relative max-w-7xl mx-auto px-5 sm:px-8 w-full pt-32 pb-20">
          <div className="max-w-3xl">
            {/* Label */}
            <div
              className="inline-flex items-center gap-2 mb-6 px-4 py-1.5 rounded-full text-sm font-medium"
              style={{ background: "rgba(255,26,108,0.12)", border: "1px solid rgba(255,26,108,0.25)", color: "#ff6ba8" }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-pink-400 animate-pulse"/>
              Nova coleção disponível
            </div>

            {/* Headline */}
            <h1 className="text-5xl sm:text-6xl md:text-7xl font-black text-white leading-[1.05] mb-6 tracking-tight">
              Treina.<br/>
              <span className="text-gradient">Brilha.</span><br/>
              Repete.
            </h1>

            <p className="text-white/50 text-lg md:text-xl leading-relaxed mb-10 max-w-lg">
              Roupas fitness que combinam performance e estilo. Monte seu look, experimente em casa — sem compromisso.
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap gap-4">
              <a href="#produtos" className="btn-pink text-base px-8 py-3.5">
                Ver produtos
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-4 h-4">
                  <path d="M7 17L17 7M17 7H7M17 7v10" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </a>
              <a
                href={waUrl("Olá! Gostaria de montar um look personalizado 💕")}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-outline text-base px-8 py-3.5"
              >
                Monte seu look
              </a>
            </div>

            {/* Stats */}
            <div className="flex flex-wrap gap-8 mt-14">
              {[
                { value: productList.length > 0 ? `${productList.length}+` : "∞", label: "produtos" },
                { value: "100%", label: "fitness" },
                { value: "★★★★★", label: "atendimento" },
              ].map(({ value, label }) => (
                <div key={label}>
                  <p className="text-white font-bold text-2xl">{value}</p>
                  <p className="text-white/30 text-xs uppercase tracking-wider mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Scroll hint */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 opacity-30">
          <span className="text-white text-xs uppercase tracking-widest">scroll</span>
          <div className="w-px h-8 bg-white/40"/>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          CONDICIONAL — USP único
      ══════════════════════════════════════════════════════ */}
      <section className="py-20 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-0 right-0 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(255,26,108,0.3), transparent)" }}/>
          <div className="absolute bottom-0 left-0 right-0 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(255,26,108,0.3), transparent)" }}/>
        </div>

        <div className="max-w-7xl mx-auto px-5 sm:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">

            {/* Text */}
            <div>
              <p className="section-label mb-4">exclusividade</p>
              <h2 className="text-4xl md:text-5xl font-black text-white leading-tight mb-6">
                Experimente<br/>
                <span className="text-gradient">antes de comprar</span>
              </h2>
              <p className="text-white/50 text-lg leading-relaxed mb-8">
                Com nosso sistema <strong className="text-white">Condicional</strong>, você recebe as peças em casa, experimenta com calma e paga apenas o que ficar.
                Sem pressão, sem fila, sem compromisso.
              </p>
              <a
                href={waUrl("Olá! Quero saber mais sobre o sistema condicional 👗")}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-pink"
              >
                Saiba mais
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-4 h-4">
                  <path d="M9 18l6-6-6-6" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </a>
            </div>

            {/* Steps */}
            <div className="grid grid-cols-1 gap-4">
              {[
                { n: "01", title: "Escolha o look", desc: "Monte uma combinação com nossos produtos ou peça sugestão." },
                { n: "02", title: "Receba em casa",  desc: "Enviamos as peças para você experimentar com tranquilidade." },
                { n: "03", title: "Pague o que ficou", desc: "Devolveu o resto? Pagou só o que amou. Simples assim." },
              ].map(({ n, title, desc }) => (
                <div
                  key={n}
                  className="flex gap-5 p-5 rounded-2xl transition-colors"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}
                >
                  <span
                    className="text-2xl font-black flex-shrink-0 leading-none mt-0.5"
                    style={{ background: "linear-gradient(135deg, #ff1a6c, #ff6ba8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
                  >
                    {n}
                  </span>
                  <div>
                    <h4 className="text-white font-semibold mb-1">{title}</h4>
                    <p className="text-white/40 text-sm leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          LOOKS EM ALTA
      ══════════════════════════════════════════════════════ */}
      {lookList.length > 0 && (
        <section className="py-20">
          <div className="max-w-7xl mx-auto px-5 sm:px-8">
            {/* Header */}
            <div className="flex items-end justify-between mb-10">
              <div>
                <p className="section-label mb-2">lookbook</p>
                <h2 className="text-3xl md:text-4xl font-black text-white leading-tight">
                  Looks em alta
                </h2>
              </div>
              <Link
                href="/looks"
                className="hidden sm:flex items-center gap-1.5 text-sm font-medium text-white/50 hover:text-white transition-colors"
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
          PRODUTOS
      ══════════════════════════════════════════════════════ */}
      <section id="produtos" className="py-20">
        <div className="max-w-7xl mx-auto px-5 sm:px-8">
          {/* Header */}
          <div className="mb-10">
            <p className="section-label mb-2">catálogo</p>
            <h2 className="text-3xl md:text-4xl font-black text-white leading-tight">
              {productList.length > 0
                ? `${productList.length} produtos disponíveis`
                : "Nossa coleção"}
            </h2>
          </div>

          {productList.length === 0 ? (
            <div
              className="rounded-3xl p-16 text-center"
              style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}
            >
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5"
                style={{ background: "rgba(255,26,108,0.1)", border: "1px solid rgba(255,26,108,0.2)" }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-8 h-8 text-pink-400">
                  <path d="M20 7H4a2 2 0 00-2 2v6a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z" strokeWidth="1.5"/>
                  <path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" strokeWidth="1.5"/>
                </svg>
              </div>
              <h3 className="text-white font-bold text-xl mb-2">Produtos em breve</h3>
              <p className="text-white/40 mb-8">Estamos preparando novidades incríveis para você.</p>
              <a
                href={waUrl("Olá! Quero saber quais produtos estão disponíveis.")}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-pink"
              >
                Perguntar no WhatsApp
              </a>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-5">
              {productList.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          CTA FINAL — WhatsApp
      ══════════════════════════════════════════════════════ */}
      <section className="py-10 pb-20">
        <div className="max-w-7xl mx-auto px-5 sm:px-8">
          <div
            className="relative rounded-3xl overflow-hidden px-8 py-16 text-center"
            style={{ background: "linear-gradient(135deg, #1a0010 0%, #2a0025 50%, #1a0010 100%)" }}
          >
            {/* Glows */}
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-40 rounded-full blur-3xl opacity-40" style={{ background: "#ff1a6c" }}/>
              <div className="absolute bottom-0 left-1/4 w-48 h-48 rounded-full blur-3xl opacity-20" style={{ background: "#ff6ba8" }}/>
            </div>

            {/* Border */}
            <div className="absolute inset-0 rounded-3xl pointer-events-none" style={{ border: "1px solid rgba(255,26,108,0.2)" }}/>

            <div className="relative">
              <p className="section-label mb-4">atendimento exclusivo</p>
              <h2 className="text-4xl md:text-5xl font-black text-white mb-4 leading-tight">
                Não encontrou<br/>o que procura?
              </h2>
              <p className="text-white/50 text-lg mb-10 max-w-md mx-auto">
                Nossa equipe te ajuda a montar o look perfeito, verificar disponibilidade ou fazer um pedido especial.
              </p>

              <a
                href={waUrl("Olá! Vim pelo site e não encontrei o que procuro. Poderia me ajudar? 😊")}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-3 bg-white font-bold text-lg px-10 py-4 rounded-2xl transition-all hover:-translate-y-1 hover:shadow-[0_0_40px_rgba(255,255,255,0.15)]"
                style={{ color: "#ff1a6c" }}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6" style={{ color: "#25D366" }}>
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                Falar no WhatsApp
              </a>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
