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
  const sizes    = Array.from(new Set(
    product.variants?.map((v) => v.size).filter((s): s is string => Boolean(s)) ?? []
  ));
  const installment = price >= 30 ? fmt(price / 3) : null;

  return (
    <Link href={`/produtos/${product.id}`} className="group block">
      {/* Image — portrait 3:4 como Vista Euforia */}
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

        {/* Badge em estoque — dot */}
        {inStock && (
          <div className="absolute top-2.5 right-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-green-400 block ring-2 ring-green-400/20 animate-pulse"/>
          </div>
        )}

        {/* Hover overlay + WhatsApp */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-3">
          <a
            href={waUrl(`Ola! Tenho interesse no produto *${product.name}*`)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-white text-xs font-semibold"
            style={{ background: "#25D366" }}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            Pedir no WhatsApp
          </a>
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
