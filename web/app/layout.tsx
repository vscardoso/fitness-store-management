import type { Metadata, Viewport } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";
import WhatsAppButton from "@/components/WhatsAppButton";

const STORE = process.env.NEXT_PUBLIC_STORE_NAME || "Fitness Store";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://wamodafitness.com.br";

export const viewport: Viewport = {
  themeColor: "#ff1a6c",
  colorScheme: "dark",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title:       { default: STORE, template: `%s · ${STORE}` },
  description: "Roupas e acessórios fitness de qualidade. Looks exclusivos, condicional disponível.",
  keywords:    ["fitness", "roupas fitness", "lookbook", "moda fitness", "activewear"],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type:     "website",
    locale:   "pt_BR",
    siteName: STORE,
    url:      SITE_URL,
    title:    STORE,
    description: "Roupas e acessórios fitness de qualidade. Looks exclusivos, condicional disponível.",
  },
  twitter: {
    card: "summary_large_image",
    title: STORE,
    description: "Roupas e acessórios fitness de qualidade. Looks exclusivos, condicional disponível.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com"/>
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous"/>
        <link
          href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;500;600;700;800;900&family=Barlow:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{ background: "#0d0d18" }}>
        <Navbar />
        <main>{children}</main>

        {/* ── Footer ── */}
        <footer className="relative mt-24 border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
          <div className="absolute top-0 left-0 right-0 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(255,26,108,0.4), transparent)" }}/>

          <div className="max-w-7xl mx-auto px-5 sm:px-8 py-14">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-10">

              {/* Brand */}
              <div>
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center mb-4"
                  style={{ background: "linear-gradient(135deg, #ff1a6c, #ff6ba8)" }}
                >
                  <svg viewBox="0 0 24 24" fill="white" className="w-5 h-5">
                    <path d="M20.57 14.86L22 13.43 20.57 12 17 15.57 8.43 7 12 3.43 10.57 2 9.14 3.43 7.71 2 5.57 4.14 4.14 2.71 2.71 4.14l1.43 1.43L2 7.71l1.43 1.43L2 10.57 3.43 12 7 8.43 15.57 17 12 20.57 13.43 22l1.43-1.43L16.29 22l2.14-2.14 1.43 1.43 1.43-1.43-1.43-1.43L22 16.29l-1.43-1.43z"/>
                  </svg>
                </div>
                <p className="text-white font-bold text-lg mb-2">{STORE}</p>
                <p className="text-white/40 text-sm leading-relaxed">
                  Moda fitness com estilo.<br/>
                  Treina, brilha, repete.
                </p>
              </div>

              {/* Links */}
              <div>
                <p className="section-label mb-4">Catálogo</p>
                <ul className="space-y-3">
                  {[
                    { href: "/#produtos", label: "Todos os produtos" },
                    { href: "/looks",     label: "Galeria de looks" },
                  ].map(({ href, label }) => (
                    <li key={href}>
                      <a href={href} className="text-white/40 hover:text-white text-sm transition-colors">{label}</a>
                    </li>
                  ))}
                </ul>
              </div>

              {/* WhatsApp */}
              <div>
                <p className="section-label mb-4">Atendimento</p>
                <p className="text-white/40 text-sm mb-4 leading-relaxed">
                  Tire dúvidas, peça condicional ou solicite um look personalizado.
                </p>
                <a
                  href={`https://wa.me/${process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || ""}?text=${encodeURIComponent("Olá! Gostaria de mais informações.")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm font-semibold text-white px-5 py-2.5 rounded-full transition-all"
                  style={{ background: "#25D366", boxShadow: "0 0 16px rgba(37,211,102,0.25)" }}
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                  Falar agora
                </a>
              </div>
            </div>

            <div className="divider mt-10 mb-6"/>
            <p className="text-white/20 text-xs text-center">
              © {new Date().getFullYear()} {STORE} · Todos os direitos reservados
            </p>
          </div>
        </footer>

        <WhatsAppButton />
      </body>
    </html>
  );
}
