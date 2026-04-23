"use client";

import Link from "next/link";
import Image from "next/image";
import type { ProductListItem } from "@/types";
import { useCart } from "@/contexts/CartContext";

interface Props { product: ProductListItem }

const WA_NUM = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "";

const fmt = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

const waUrl = (msg: string) =>
  `https://wa.me/${WA_NUM}?text=${encodeURIComponent(msg)}`;

export default function ProductCard({ product }: Props) {
  const { addItem } = useCart();
  const price       = product.sale_price ?? product.price ?? 0;
  const inStock     = (product.current_stock ?? 0) > 0;
  const sizes       = Array.from(new Set(
    product.variants?.map((v) => v.size).filter((s): s is string => Boolean(s)) ?? []
  ));
  const installment = price >= 30 ? fmt(price / 3) : null;

  return (
    <Link href={`/produtos/${product.id}`} className="group block">
      {/* Image — portrait 3:4 */}
      <div className="relative aspect-[3/4] overflow-hidden rounded-xl bg-[#13131f] mb-3">
        {product.image_url ? (
          <Image
            src={product.image_url}
            alt={product.name}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          />
        ) : (
          <div
            className="w-full h-full flex flex-col items-center justify-center gap-2"
            style={{ background: "linear-gradient(135deg, var(--surface-card), #1e1e30)" }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-10 h-10 text-white/10">
              <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth="1"/>
              <circle cx="8.5" cy="8.5" r="1.5" strokeWidth="1"/>
              <path d="M21 15l-5-5L5 21" strokeWidth="1"/>
            </svg>
            <span className="text-white/20 text-xs">Foto em breve</span>
          </div>
        )}

        {/* Badge esgotado */}
        {!inStock && (
          <div className="absolute top-2.5 left-2.5">
            <span className="text-[10px] font-bold px-2 py-1 rounded-md text-white"
              style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)", border: "1px solid rgba(255,255,255,0.08)" }}>
              Esgotado
            </span>
          </div>
        )}

        {/* Badge em estoque */}
        {inStock && (
          <div className="absolute top-2.5 right-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-green-400 block ring-2 ring-green-400/20 animate-pulse"/>
          </div>
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-3">
          <button
            onClick={(e) => {
              e.preventDefault();
              addItem({ id: product.id, name: product.name, price, image_url: product.image_url });
            }}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-white text-xs font-bold transition-all active:scale-95"
            style={{ background: "linear-gradient(135deg, #ff1a6c, #ff4f96)", boxShadow: "0 0 16px rgba(255,26,108,0.4)" }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-3.5 h-3.5" strokeWidth="2.2">
              <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" strokeLinecap="round" strokeLinejoin="round"/>
              <line x1="3" y1="6" x2="21" y2="6" strokeLinecap="round"/>
              <path d="M16 10a4 4 0 01-8 0" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Adicionar ao carrinho
          </button>
        </div>
      </div>

      {/* Info */}
      <div className="px-0.5">
        {product.category && (
          <p className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: "var(--pink-light)" }}>
            {product.category.name}
          </p>
        )}

        <h3 className="text-white font-semibold text-sm leading-snug line-clamp-2 mb-2 group-hover:text-pink-400 transition-colors duration-200">
          {product.name}
        </h3>

        {/* Sizes */}
        {sizes.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {sizes.slice(0, 5).map((s) => (
              <span key={s}
                className="text-[10px] font-medium px-1.5 py-0.5 rounded text-white/40"
                style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
                {s}
              </span>
            ))}
            {sizes.length > 5 && (
              <span className="text-[10px] text-white/30">+{sizes.length - 5}</span>
            )}
          </div>
        )}

        {/* Price */}
        <span className="price text-base font-bold">{fmt(price)}</span>
        {installment && (
          <p className="text-white/30 text-[11px] mt-0.5">3x de {installment} s/juros</p>
        )}
      </div>
    </Link>
  );
}
