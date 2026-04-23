"use client";

import { useState, useMemo } from "react";
import type { ProductListItem, Category } from "@/types";
import ProductCard from "@/components/ProductCard";
import CategoryFilter from "@/components/CategoryFilter";

interface Props {
  products: ProductListItem[];
  categories: Category[];
}

const WA_NUM = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "";
const waUrl = (msg: string) =>
  `https://wa.me/${WA_NUM}?text=${encodeURIComponent(msg)}`;

export default function ProductsSection({ products, categories }: Props) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const list = selectedCategory
      ? products.filter((p) => p.category?.name === selectedCategory)
      : products;

    // Sort: in stock first
    return [...list].sort((a, b) => {
      const aStock = (a.current_stock ?? 0) > 0 ? 1 : 0;
      const bStock = (b.current_stock ?? 0) > 0 ? 1 : 0;
      return bStock - aStock;
    });
  }, [products, selectedCategory]);

  return (
    <section id="produtos" className="py-24">
      <div className="max-w-7xl mx-auto px-5 sm:px-8">
        {/* Header */}
        <div className="mb-10">
          <p className="section-label mb-2">catalogo</p>
          <h2 className="text-3xl md:text-4xl font-black text-white leading-tight mb-6">
            {products.length > 0
              ? `${products.length} produtos disponíveis`
              : "Nossa colecao"}
          </h2>

          {/* Category filter */}
          {categories.length > 0 && (
            <CategoryFilter
              categories={categories}
              selected={selectedCategory}
              onChange={setSelectedCategory}
            />
          )}
        </div>

        {filtered.length === 0 && products.length > 0 ? (
          /* No results for this category */
          <div className="glass rounded-3xl p-16 text-center">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5"
              style={{ background: "var(--pink-glow)" }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-8 h-8" style={{ color: "var(--pink-light)" }}>
                <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <h3 className="text-white font-bold text-xl mb-2">Nenhum produto nesta categoria</h3>
            <p className="text-white/40 mb-6">Tente selecionar outra categoria ou veja todos.</p>
            <button
              onClick={() => setSelectedCategory(null)}
              className="btn-outline text-sm px-6 py-2.5 cursor-pointer"
            >
              Ver todos
            </button>
          </div>
        ) : products.length === 0 ? (
          /* No products at all */
          <div className="glass rounded-3xl p-16 text-center">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5"
              style={{ background: "var(--pink-glow)" }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-8 h-8" style={{ color: "var(--pink-light)" }}>
                <path d="M20 7H4a2 2 0 00-2 2v6a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z" strokeWidth="1.5"/>
                <path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" strokeWidth="1.5"/>
              </svg>
            </div>
            <h3 className="text-white font-bold text-xl mb-2">Produtos em breve</h3>
            <p className="text-white/40 mb-8">Estamos preparando novidades incriveis para voce.</p>
            <a
              href={waUrl("Ola! Quero saber quais produtos estao disponiveis.")}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-pink"
            >
              Perguntar no WhatsApp
            </a>
          </div>
        ) : (
          /* Product grid */
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-5">
            {filtered.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}

        {/* Results count when filtering */}
        {selectedCategory && filtered.length > 0 && (
          <p className="text-white/30 text-sm text-center mt-6">
            {filtered.length} {filtered.length === 1 ? "produto" : "produtos"} em {selectedCategory}
          </p>
        )}
      </div>
    </section>
  );
}
