import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { getProduct, buildWhatsAppUrl, buildProductWhatsAppMessage } from "@/services/api";

export const revalidate = 60;

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const product = await getProduct(Number(id));
    const storeName = process.env.NEXT_PUBLIC_STORE_NAME || "Fitness Store";
    return {
      title: product.name,
      description: product.description || `${product.name} - ${storeName}`,
      openGraph: {
        images: product.image_url ? [product.image_url] : [],
      },
    };
  } catch {
    return { title: "Produto não encontrado" };
  }
}

function formatPrice(price: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(price);
}

export default async function ProductPage({ params }: Props) {
  const { id } = await params;

  let product;
  try {
    product = await getProduct(Number(id));
  } catch {
    notFound();
  }

  if (!product) notFound();

  const price = product.sale_price ?? product.price ?? 0;
  const whatsappUrl = buildWhatsAppUrl(buildProductWhatsAppMessage(product));
  const hasVariants = (product.variants?.length ?? 0) > 0;
  const inStock = (product.current_stock ?? 0) > 0;

  // Group variants by size and color
  const sizes = Array.from(new Set(product.variants?.map((v) => v.size).filter((s): s is string => Boolean(s)) ?? []));
  const colors = Array.from(new Set(product.variants?.map((v) => v.color).filter((c): c is string => Boolean(c)) ?? []));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-dark-400 mb-8">
        <Link href="/" className="hover:text-white transition-colors">
          Início
        </Link>
        <span>/</span>
        {product.category && (
          <>
            <span>{product.category.name}</span>
            <span>/</span>
          </>
        )}
        <span className="text-white">{product.name}</span>
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16">
        {/* Left: Image */}
        <div>
          <div className="relative aspect-square rounded-2xl overflow-hidden bg-dark-700 shadow-2xl">
            {product.image_url ? (
              <Image
                src={product.image_url}
                alt={product.name}
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 50vw"
                priority
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  className="w-24 h-24 text-dark-500"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth="1" />
                  <circle cx="8.5" cy="8.5" r="1.5" strokeWidth="1" />
                  <path d="M21 15l-5-5L5 21" strokeWidth="1" />
                </svg>
              </div>
            )}
          </div>
        </div>

        {/* Right: Info */}
        <div className="flex flex-col">
          {/* Category + Stock status */}
          <div className="flex items-center gap-3 mb-3">
            {product.category && (
              <span className="badge bg-dark-700 text-dark-200 text-xs uppercase tracking-wider">
                {product.category.name}
              </span>
            )}
            <span
              className={`badge text-xs font-semibold ${
                inStock
                  ? "bg-green-500/20 text-green-400"
                  : "bg-red-500/20 text-red-400"
              }`}
            >
              {inStock ? "Em estoque" : "Esgotado"}
            </span>
          </div>

          <h1 className="text-3xl md:text-4xl font-extrabold text-white leading-tight mb-2">
            {product.name}
          </h1>

          {product.brand && (
            <p className="text-dark-400 text-sm mb-4">{product.brand}</p>
          )}

          {/* Price */}
          <div className="mb-6">
            <span className="text-4xl font-black text-brand-400">
              {formatPrice(price)}
            </span>
            {hasVariants && (
              <p className="text-dark-400 text-sm mt-1">
                A partir de {formatPrice(Math.min(...(product.variants?.map((v) => v.price) ?? [price])))}
              </p>
            )}
          </div>

          {/* Variants */}
          {hasVariants && (
            <div className="mb-6 space-y-4">
              {sizes.length > 0 && (
                <div>
                  <h3 className="text-white text-sm font-semibold mb-2">
                    Tamanhos disponíveis
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {sizes.map((size) => (
                      <span
                        key={size}
                        className="px-4 py-2 rounded-xl border border-dark-500 text-white text-sm font-medium bg-dark-700 hover:border-brand-500 hover:bg-brand-500/10 cursor-pointer transition-colors"
                      >
                        {size}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {colors.length > 0 && (
                <div>
                  <h3 className="text-white text-sm font-semibold mb-2">
                    Cores disponíveis
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {colors.map((color) => (
                      <span
                        key={color}
                        className="px-4 py-2 rounded-xl border border-dark-500 text-white text-sm font-medium bg-dark-700 hover:border-brand-500 hover:bg-brand-500/10 cursor-pointer transition-colors"
                      >
                        {color}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Product details */}
          <div className="flex flex-wrap gap-3 mb-6">
            {product.gender && (
              <div className="flex items-center gap-1.5 text-dark-300 text-sm">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-4 h-4 text-dark-400">
                  <path d="M12 22V12m0 0c0-3.5 4-5 4-8a4 4 0 00-8 0c0 3 4 4.5 4 8z" strokeWidth="1.5" />
                </svg>
                {product.gender}
              </div>
            )}
            {product.color && (
              <div className="flex items-center gap-1.5 text-dark-300 text-sm">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-4 h-4 text-dark-400">
                  <circle cx="12" cy="12" r="10" strokeWidth="1.5" />
                </svg>
                {product.color}
              </div>
            )}
            {product.material && (
              <div className="flex items-center gap-1.5 text-dark-300 text-sm">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-4 h-4 text-dark-400">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" strokeWidth="1.5" />
                </svg>
                {product.material}
              </div>
            )}
          </div>

          {/* Description */}
          {product.description && (
            <div className="mb-8">
              <h3 className="text-white font-semibold mb-2">Descrição</h3>
              <p className="text-dark-300 leading-relaxed text-sm">{product.description}</p>
            </div>
          )}

          {/* CTA */}
          <div className="mt-auto space-y-3">
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-3 bg-[#25D366] hover:bg-[#1db954] text-white font-bold text-lg py-4 rounded-2xl transition-colors shadow-lg"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              {hasVariants ? "Escolher tamanho/cor no WhatsApp" : "Pedir via WhatsApp"}
            </a>

            <p className="text-center text-dark-500 text-xs">
              Atendimento rápido · Enviamos para todo o Brasil
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
