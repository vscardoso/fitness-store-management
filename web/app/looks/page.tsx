import type { Metadata } from "next";
import type { LookListItem } from "@/types";
import { getLooks } from "@/services/api";
import LookCard from "@/components/LookCard";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Looks",
  description: "Combinações exclusivas montadas pela nossa equipe. Inspire-se e monte o seu.",
};

const WA  = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "";
const wa  = (msg: string) => `https://wa.me/${WA}?text=${encodeURIComponent(msg)}`;

export default async function LooksPage() {
  let looks: LookListItem[] = [];
  try {
    const all = await getLooks(50);
    looks = all.filter((l) => l.is_public);
  } catch { looks = []; }

  return (
    <div style={{ background: "#0d0d18" }}>
      {/* Header section */}
      <section
        className="relative pt-32 pb-16 overflow-hidden"
        style={{ background: "linear-gradient(180deg, #160d1e 0%, #0d0d18 100%)" }}
      >
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-48 blur-3xl opacity-20 rounded-full" style={{ background: "#ff1a6c" }}/>
          <div className="absolute bottom-0 left-0 right-0 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(255,26,108,0.3), transparent)" }}/>
        </div>
        <div className="relative max-w-7xl mx-auto px-5 sm:px-8">
          <p className="section-label mb-4">lookbook</p>
          <h1 className="text-5xl md:text-6xl font-black text-white leading-tight mb-4 tracking-tight">
            Galeria de<br/>
            <span className="text-gradient">Looks</span>
          </h1>
          <p className="text-white/40 text-lg max-w-lg">
            Combinações criadas pela nossa equipe para inspirar seu estilo fitness. Cada look pode virar um condicional — experimente em casa.
          </p>
        </div>
      </section>

      {/* Grid */}
      <section className="max-w-7xl mx-auto px-5 sm:px-8 py-16">
        {looks.length === 0 ? (
          <div
            className="rounded-3xl p-20 text-center"
            style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}
          >
            <div
              className="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6"
              style={{ background: "rgba(255,26,108,0.1)", border: "1px solid rgba(255,26,108,0.2)" }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-10 h-10 text-pink-400">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
                  strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h2 className="text-white text-2xl font-black mb-3">Looks em breve</h2>
            <p className="text-white/40 mb-8 max-w-sm mx-auto leading-relaxed">
              Estamos montando combinações incríveis. Enquanto isso, podemos criar um look personalizado só para você!
            </p>
            <a
              href={wa("Olá! Quero um look fitness personalizado 💕")}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-pink"
            >
              Pedir look personalizado
            </a>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
              {looks.map((look) => (
                <LookCard key={look.id} look={look} />
              ))}
            </div>

            {/* CTA */}
            <div
              className="mt-16 rounded-2xl p-8 text-center"
              style={{ background: "rgba(255,26,108,0.06)", border: "1px solid rgba(255,26,108,0.15)" }}
            >
              <p className="text-white font-bold text-lg mb-2">Quer um look personalizado?</p>
              <p className="text-white/40 text-sm mb-5">Nossa equipe monta combinações especiais para você.</p>
              <a
                href={wa("Olá! Gostaria de um look fitness personalizado 💕")}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-pink text-sm px-6 py-2.5"
              >
                Falar no WhatsApp
              </a>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
