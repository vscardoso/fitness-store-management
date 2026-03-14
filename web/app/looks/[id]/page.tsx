import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { getLook, buildWhatsAppUrl, buildLookWhatsAppMessage } from "@/services/api";

export const revalidate = 60;

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const look = await getLook(Number(id));
    const storeName = process.env.NEXT_PUBLIC_STORE_NAME || "Fitness Store";
    return {
      title: look.name,
      description: look.description || `${look.name} — look completo em ${storeName}`,
    };
  } catch {
    return { title: "Look não encontrado" };
  }
}

function formatPrice(price: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(price);
}

export default async function LookDetailPage({ params }: Props) {
  const { id } = await params;

  let look;
  try {
    look = await getLook(Number(id));
  } catch {
    notFound();
  }

  if (!look) notFound();

  const whatsappUrl = buildWhatsAppUrl(buildLookWhatsAppMessage(look));
  const hasDiscount = look.discount_percentage > 0;
  const discountedTotal = hasDiscount
    ? look.total_price * (1 - look.discount_percentage / 100)
    : look.total_price;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-dark-400 mb-8">
        <Link href="/" className="hover:text-white transition-colors">Início</Link>
        <span>/</span>
        <Link href="/looks" className="hover:text-white transition-colors">Looks</Link>
        <span>/</span>
        <span className="text-white">{look.name}</span>
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-10">
        {/* Left: Look info */}
        <div className="lg:col-span-2">
          <div className="sticky top-24">
            {/* Look hero card */}
            <div className="relative rounded-2xl bg-gradient-to-br from-dark-700 to-dark-800 border border-dark-600 p-8 mb-6 text-center overflow-hidden">
              <div className="absolute inset-0 opacity-5">
                <div className="absolute top-0 right-0 w-40 h-40 bg-brand-500 rounded-full blur-3xl" />
              </div>
              <div className="relative">
                <div className="w-20 h-20 bg-brand-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-10 h-10 text-brand-400">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <h1 className="text-2xl font-extrabold text-white mb-2">{look.name}</h1>
                {look.description && (
                  <p className="text-dark-300 text-sm leading-relaxed">{look.description}</p>
                )}
              </div>
            </div>

            {/* Price summary */}
            <div className="card p-6 mb-6">
              <h3 className="text-white font-semibold mb-4">Resumo do look</h3>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-dark-300">{look.items_count} peças</span>
                  {look.total_price > 0 && (
                    <span className="text-white">{formatPrice(look.total_price)}</span>
                  )}
                </div>
                {hasDiscount && (
                  <div className="flex justify-between text-sm">
                    <span className="text-green-400">Desconto do look ({look.discount_percentage}%)</span>
                    <span className="text-green-400">
                      -{formatPrice(look.total_price - discountedTotal)}
                    </span>
                  </div>
                )}
                {look.total_price > 0 && (
                  <div className="flex justify-between font-bold text-lg border-t border-dark-600 pt-2 mt-2">
                    <span className="text-white">Total</span>
                    <span className="text-brand-400">{formatPrice(discountedTotal)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* CTA */}
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-3 bg-[#25D366] hover:bg-[#1db954] text-white font-bold text-lg py-4 rounded-2xl transition-colors shadow-lg"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              Experimentar este look
            </a>
            <p className="text-center text-dark-500 text-xs mt-2">
              Solicite via condicional · Experimente em casa
            </p>
          </div>
        </div>

        {/* Right: Items grid */}
        <div className="lg:col-span-3">
          <h2 className="text-xl font-bold text-white mb-6">
            Peças do look ({look.items.length})
          </h2>

          {look.items.length === 0 ? (
            <div className="text-center py-12 text-dark-400">
              Nenhuma peça adicionada ainda.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {look.items
                .sort((a, b) => a.position - b.position)
                .map((item) => (
                  <Link
                    key={item.id}
                    href={`/produtos/${item.product_id}`}
                    className="group flex gap-4 card p-4 hover:border-brand-500/50 transition-all"
                  >
                    {/* Mini image */}
                    <div className="relative w-20 h-20 rounded-xl overflow-hidden bg-dark-700 flex-shrink-0">
                      {item.product_image_url ? (
                        <Image
                          src={item.product_image_url}
                          alt={item.product_name || "Produto"}
                          fill
                          className="object-cover group-hover:scale-105 transition-transform"
                          sizes="80px"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-8 h-8 text-dark-500">
                            <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth="1.5" />
                            <circle cx="8.5" cy="8.5" r="1.5" strokeWidth="1.5" />
                            <path d="M21 15l-5-5L5 21" strokeWidth="1.5" />
                          </svg>
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <h4 className="text-white font-semibold text-sm line-clamp-2 group-hover:text-brand-400 transition-colors">
                        {item.product_name || `Produto #${item.product_id}`}
                      </h4>
                      {item.variant_description && (
                        <p className="text-dark-400 text-xs mt-0.5">{item.variant_description}</p>
                      )}
                      {item.unit_price && (
                        <p className="text-brand-400 font-bold text-sm mt-2">
                          {formatPrice(item.unit_price)}
                        </p>
                      )}
                    </div>

                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-4 h-4 text-dark-500 group-hover:text-brand-400 flex-shrink-0 self-center transition-colors">
                      <path d="M9 18l6-6-6-6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </Link>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
