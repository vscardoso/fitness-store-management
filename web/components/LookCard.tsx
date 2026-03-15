import Link from "next/link";
import type { LookListItem } from "@/types";

interface Props { look: LookListItem }

const fmt = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

export default function LookCard({ look }: Props) {
  const hasDiscount = look.discount_percentage > 0;

  return (
    <Link href={`/looks/${look.id}`} className="group block">
      <div className="card-dark">
        {/* Visual */}
        <div
          className="relative aspect-[4/3] flex flex-col items-center justify-center overflow-hidden"
          style={{ background: "linear-gradient(135deg, #1a0e20, #13131f)" }}
        >
          {/* Glow orb */}
          <div
            className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-40 rounded-full opacity-20 blur-3xl"
            style={{ background: "#ff1a6c" }}
          />

          {/* Icon */}
          <div
            className="relative z-10 w-16 h-16 rounded-2xl flex items-center justify-center mb-3"
            style={{ background: "rgba(255,26,108,0.15)", border: "1px solid rgba(255,26,108,0.2)" }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-8 h-8 text-pink-400">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
                strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>

          <p className="relative z-10 text-white/40 text-xs">Look completo</p>

          {/* Discount badge */}
          {hasDiscount && (
            <div className="absolute top-3 right-3">
              <span
                className="text-xs font-bold text-white px-2.5 py-1 rounded-full"
                style={{ background: "linear-gradient(135deg, #ff1a6c, #ff4f96)" }}
              >
                -{look.discount_percentage.toFixed(0)}% OFF
              </span>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="p-4">
          <h3 className="text-white font-semibold leading-snug line-clamp-1 mb-1 group-hover:text-pink-400 transition-colors duration-200">
            {look.name}
          </h3>
          {look.description && (
            <p className="text-white/40 text-xs line-clamp-1 mb-3">{look.description}</p>
          )}

          <div className="flex items-end justify-between">
            <div>
              <p className="text-white/30 text-xs mb-0.5">{look.items_count} peças</p>
              {look.total_price > 0 && (
                <span className="price text-sm">{fmt(look.total_price)}</span>
              )}
            </div>
            {hasDiscount && look.total_price > 0 && (
              <span className="text-green-400 text-xs font-medium">Desconto no look</span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
