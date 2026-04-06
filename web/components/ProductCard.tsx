import Link from "next/link";
import Image from "next/image";
import type { ProductListItem } from "@/types";

interface Props { product: ProductListItem }

const fmt = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

export default function ProductCard({ product }: Props) {
  const price    = product.sale_price ?? product.price ?? 0;
  const inStock  = (product.current_stock ?? 0) > 0;
  const variants = product.variant_count ?? 0;

  return (
    <Link href={`/produtos/${product.id}`} className="group block">
      <div className="card-dark">
        {/* Imagem */}
        <div className="relative aspect-square overflow-hidden bg-surface-800">
          {product.image_url ? (
            <Image
              src={product.image_url}
              alt={product.name}
              fill
              className="object-cover transition-transform duration-500 group-hover:scale-105"
              sizes="(max-width: 640px) 50vw, (max-width-1024px) 33vw, 25vw"
            />
          ) : (
            /* Placeholder elegante */
            <div
              className="w-full h-full flex flex-col items-center justify-center gap-2"
              style={{ background: "linear-gradient(135deg, #13131f, #1e1e30)" }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-10 h-10 text-white/10">
                <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth="1"/>
                <circle cx="8.5" cy="8.5" r="1.5" strokeWidth="1"/>
                <path d="M21 15l-5-5L5 21" strokeWidth="1"/>
              </svg>
              <span className="text-white/20 text-xs">Foto em breve</span>
            </div>
          )}

          {/* Overlay hover */}
          <div className="absolute inset-0 bg-pink-500/0 group-hover:bg-pink-500/5 transition-colors duration-300"/>

          {/* Badges */}
          <div className="absolute top-3 left-3 flex flex-col gap-1.5">
            {!inStock && (
              <span className="tag text-[11px]">Esgotado</span>
            )}
            {variants > 0 && (
              <span className="tag-pink text-[11px]">{variants} tam.</span>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="p-4">
          {product.category && (
            <p className="section-label text-[10px] mb-1.5">{product.category.name}</p>
          )}

          <h3 className="text-white font-semibold text-sm leading-snug line-clamp-2 mb-3 group-hover:text-pink-400 transition-colors duration-200">
            {product.name}
          </h3>

          <div className="flex items-center justify-between">
            <span className="price text-base">{fmt(price)}</span>
            {product.brand && (
              <span className="text-white/50 text-xs">{product.brand}</span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
