import Link from "next/link";
import Image from "next/image";
import type { ProductListItem } from "@/types";

interface ProductCardProps {
  product: ProductListItem;
}

function formatPrice(price: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(price);
}

export default function ProductCard({ product }: ProductCardProps) {
  const price = product.sale_price ?? product.price;
  const hasVariants = (product.variant_count ?? 0) > 0;
  const inStock = (product.current_stock ?? 0) > 0;

  return (
    <Link href={`/produtos/${product.id}`} className="group">
      <div className="card hover:shadow-xl hover:shadow-brand-500/10 hover:-translate-y-1 transition-all duration-300">
        {/* Image */}
        <div className="relative aspect-square bg-dark-700 overflow-hidden">
          {product.image_url ? (
            <Image
              src={product.image_url}
              alt={product.name}
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-500"
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                className="w-16 h-16 text-dark-500"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth="1.5" />
                <circle cx="8.5" cy="8.5" r="1.5" strokeWidth="1.5" />
                <path d="M21 15l-5-5L5 21" strokeWidth="1.5" />
              </svg>
            </div>
          )}

          {/* Badges */}
          <div className="absolute top-2 left-2 flex flex-col gap-1">
            {!inStock && (
              <span className="badge bg-dark-700/90 text-dark-200 backdrop-blur-sm">
                Esgotado
              </span>
            )}
            {hasVariants && (
              <span className="badge bg-brand-500/90 text-white backdrop-blur-sm">
                {product.variant_count} tamanhos
              </span>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="p-4">
          {product.category && (
            <p className="text-dark-400 text-xs font-medium uppercase tracking-wider mb-1">
              {product.category.name}
            </p>
          )}

          <h3 className="text-white font-semibold text-sm leading-snug line-clamp-2 mb-2 group-hover:text-brand-400 transition-colors">
            {product.name}
          </h3>

          <div className="flex items-center justify-between mt-auto">
            <span className="price-tag">{formatPrice(price)}</span>

            {product.brand && (
              <span className="text-dark-400 text-xs">{product.brand}</span>
            )}
          </div>

          {(product.gender || product.color) && (
            <div className="flex gap-1 mt-2 flex-wrap">
              {product.gender && (
                <span className="badge bg-dark-700 text-dark-300">
                  {product.gender}
                </span>
              )}
              {product.color && (
                <span className="badge bg-dark-700 text-dark-300">
                  {product.color}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
