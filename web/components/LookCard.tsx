import Link from "next/link";
import Image from "next/image";
import type { LookListItem } from "@/types";

interface LookCardProps {
  look: LookListItem;
}

function formatPrice(price: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(price);
}

export default function LookCard({ look }: LookCardProps) {
  const hasDiscount = look.discount_percentage > 0;

  return (
    <Link href={`/looks/${look.id}`} className="group">
      <div className="card hover:shadow-xl hover:shadow-brand-500/10 hover:-translate-y-1 transition-all duration-300">
        {/* Image placeholder (looks don't have a single image — show icon) */}
        <div className="relative aspect-[4/3] bg-gradient-to-br from-dark-700 to-dark-800 overflow-hidden flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 bg-brand-500/20 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                className="w-8 h-8 text-brand-400"
              >
                <path
                  d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <p className="text-dark-400 text-xs">Look completo</p>
          </div>

          {/* Discount badge */}
          {hasDiscount && (
            <div className="absolute top-3 right-3">
              <span className="badge bg-brand-500 text-white text-sm font-bold px-3 py-1">
                -{look.discount_percentage.toFixed(0)}%
              </span>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="p-4">
          <h3 className="text-white font-semibold leading-snug line-clamp-2 mb-1 group-hover:text-brand-400 transition-colors">
            {look.name}
          </h3>

          {look.description && (
            <p className="text-dark-400 text-sm line-clamp-2 mb-3">
              {look.description}
            </p>
          )}

          <div className="flex items-center justify-between mt-3">
            <div>
              <p className="text-dark-400 text-xs mb-0.5">{look.items_count} peças</p>
              {look.total_price > 0 && (
                <p className="price-tag">{formatPrice(look.total_price)}</p>
              )}
            </div>

            {hasDiscount && look.total_price > 0 && (
              <div className="text-right">
                <p className="text-dark-400 text-xs line-through">
                  {formatPrice(look.total_price / (1 - look.discount_percentage / 100))}
                </p>
                <p className="text-green-400 text-xs font-medium">
                  Desconto no look
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
