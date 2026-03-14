import Link from "next/link";
import { getFeaturedProducts, getLooks, getCategories } from "@/services/api";
import ProductCard from "@/components/ProductCard";
import LookCard from "@/components/LookCard";

export const revalidate = 60;

export default async function HomePage() {
  // Fetch data in parallel
  const [products, looks, categories] = await Promise.allSettled([
    getFeaturedProducts(12),
    getLooks(4),
    getCategories(),
  ]);

  const productList = products.status === "fulfilled" ? products.value : [];
  const lookList = looks.status === "fulfilled" ? looks.value.filter((l) => l.is_public) : [];
  const categoryList = categories.status === "fulfilled" ? categories.value : [];

  const storeName = process.env.NEXT_PUBLIC_STORE_NAME || "Fitness Store";

  return (
    <div>
      {/* Hero */}
      <section className="relative bg-gradient-to-br from-dark-900 via-dark-800 to-dark-900 overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-brand-500 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-brand-700 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-28">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 bg-brand-500/20 text-brand-400 text-sm font-semibold px-4 py-1.5 rounded-full border border-brand-500/30 mb-6">
              <span className="w-1.5 h-1.5 bg-brand-400 rounded-full animate-pulse" />
              Novidades disponíveis
            </span>

            <h1 className="text-4xl md:text-6xl font-extrabold text-white leading-tight mb-6">
              Vista-se para{" "}
              <span className="text-brand-500">superar</span>
              <br />seus limites
            </h1>

            <p className="text-dark-200 text-lg md:text-xl leading-relaxed mb-8">
              Roupas e acessórios fitness de qualidade para você treinar com
              estilo, conforto e performance.
            </p>

            <div className="flex flex-wrap gap-4">
              <a href="#produtos" className="btn-primary text-base px-8 py-3.5">
                Ver produtos
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-5 h-5">
                  <path d="M19 12H5M12 19l7-7-7-7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </a>
              {lookList.length > 0 && (
                <Link href="/looks" className="btn-secondary text-base px-8 py-3.5">
                  Ver looks
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Categories filter bar */}
      {categoryList.length > 0 && (
        <section className="bg-dark-800/50 border-b border-dark-700">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              <a
                href="#produtos"
                className="flex-shrink-0 px-4 py-1.5 rounded-full bg-brand-500 text-white text-sm font-medium"
              >
                Todos
              </a>
              {categoryList.slice(0, 8).map((cat) => (
                <a
                  key={cat.id}
                  href={`/?category=${cat.id}#produtos`}
                  className="flex-shrink-0 px-4 py-1.5 rounded-full bg-dark-700 hover:bg-dark-600 text-dark-200 hover:text-white text-sm font-medium transition-colors"
                >
                  {cat.name}
                </a>
              ))}
            </div>
          </div>
        </section>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Featured Looks */}
        {lookList.length > 0 && (
          <section className="mb-16">
            <div className="flex items-end justify-between mb-6">
              <div>
                <h2 className="section-title">Looks em destaque</h2>
                <p className="section-subtitle">
                  Combinações montadas especialmente para você
                </p>
              </div>
              <Link
                href="/looks"
                className="text-brand-400 hover:text-brand-300 text-sm font-medium flex items-center gap-1 transition-colors"
              >
                Ver todos
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-4 h-4">
                  <path d="M9 18l6-6-6-6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {lookList.map((look) => (
                <LookCard key={look.id} look={look} />
              ))}
            </div>
          </section>
        )}

        {/* Products Grid */}
        <section id="produtos">
          <div className="flex items-end justify-between mb-6">
            <div>
              <h2 className="section-title">Nossos produtos</h2>
              <p className="section-subtitle">
                {productList.length > 0
                  ? `${productList.length} produtos disponíveis`
                  : "Confira nossa coleção"}
              </p>
            </div>
          </div>

          {productList.length === 0 ? (
            <div className="text-center py-20">
              <div className="w-16 h-16 bg-dark-700 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-8 h-8 text-dark-400">
                  <path d="M20 7H4a2 2 0 00-2 2v6a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z" strokeWidth="1.5" />
                  <path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" strokeWidth="1.5" />
                </svg>
              </div>
              <h3 className="text-white font-semibold mb-2">Produtos em breve</h3>
              <p className="text-dark-400 text-sm mb-6">
                Estamos preparando novidades para você.
              </p>
              <a
                href={`https://wa.me/${process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || ""}?text=${encodeURIComponent("Olá! Gostaria de saber mais sobre os produtos disponíveis.")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary"
              >
                Perguntar no WhatsApp
              </a>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6">
              {productList.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </section>

        {/* WhatsApp CTA */}
        <section className="mt-20 rounded-3xl bg-gradient-to-r from-brand-600 to-brand-800 p-10 text-center relative overflow-hidden">
          <div className="absolute inset-0 opacity-10">
            <div className="absolute -top-10 -right-10 w-64 h-64 bg-white rounded-full" />
            <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-white rounded-full" />
          </div>
          <div className="relative">
            <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-3">
              Não encontrou o que procura?
            </h2>
            <p className="text-brand-100 text-lg mb-8 max-w-xl mx-auto">
              Fale diretamente com a gente pelo WhatsApp. Podemos ajudar com tamanhos, cores e disponibilidade.
            </p>
            <a
              href={`https://wa.me/${process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || ""}?text=${encodeURIComponent("Olá! Vim pelo catálogo online e não encontrei o que procuro. Poderia me ajudar?")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-3 bg-white text-brand-600 font-bold text-lg px-8 py-4 rounded-2xl hover:bg-brand-50 transition-colors shadow-xl"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              Falar no WhatsApp
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}
