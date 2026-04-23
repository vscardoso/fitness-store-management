import Link from "next/link";
import Image from "next/image";
import type { ProductListItem } from "@/types";

interface Props { product: ProductListItem }

const WA_NUM = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "";

const fmt = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

const waUrl = (msg: string) =>
  `https://wa.me/${WA_NUM}?text=${encodeURIComponent(msg)}`;

export default function ProductCard({ product }: Props) {
  const price    = product.sale_price ?? product.price ?? 0;
  const inStock  = (product.current_stock ?? 0) > 0;
  const variants = product.variant_count ?? 0;

  return (
    <Link href={`/produtos/${product.id}`} className="group block">
      <div className="card-dark relative">
        {/* Image */}
        <div className="relative aspect-square overflow-hidden">
          {product.image_url ? (
            <Image
              src={product.image_url}
              alt={product.name}
              fill
              className="object-cover transition-transform duration-500 group-hover:scale-110"
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            />
          ) : (
            /* Placeholder */
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

          {/* Hover overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"/>

          {/* Badges - top left */}
          <div className="absolute top-3 left-3 flex flex-col gap-1.5">
            {!inStock && (
              <span
                className="inline-flex items-center text-[11px] font-bold px-2.5 py-1 rounded-full text-white"
                style={{ background: "rgba(239,68,68,0.85)", backdropFilter: "blur(4px)" }}
              >
                Esgotado
              </span>
            )}
            {variants > 0 && (
              <span className="tag tag-pink text-[11px]">{variants} tam.</span>
            )}
          </div>

          {/* Stock indicator dot - top right */}
          {inStock && (
            <div className="absolute top-3 right-3">
              <span className="flex items-center gap-1.5 tag text-[10px]" style={{ background: "rgba(34,197,94,0.15)", borderColor: "rgba(34,197,94,0.3)", color: "rgb(74,222,128)" }}>
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"/>
                Disponivel
              </span>
            </div>
          )}

          {/* WhatsApp hover button */}
          <div className="absolute bottom-3 left-3 right-3 translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300">
            <a
              href={waUrl(`Ola! Tenho interesse no produto *${product.name}*. Poderia me dar mais informacoes?`)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-white text-xs font-semibold transition-all duration-200 hover:brightness-110"
              style={{ background: "#25D366", boxShadow: "0 4px 16px rgba(37,211,102,0.4)" }}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              Pedir no WhatsApp
            </a>
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
            <span className="price text-lg">{fmt(price)}</span>
            {product.brand && (
              <span className="text-white/40 text-xs">{product.brand}</span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
