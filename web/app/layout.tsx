import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";
import WhatsAppButton from "@/components/WhatsAppButton";

const storeName = process.env.NEXT_PUBLIC_STORE_NAME || "Fitness Store";

export const metadata: Metadata = {
  title: {
    default: storeName,
    template: `%s | ${storeName}`,
  },
  description: `Roupas e acessórios fitness de qualidade. Confira nosso catálogo e monte seu look perfeito.`,
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: storeName,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>
        <Navbar />
        <main className="min-h-screen">{children}</main>

        {/* Footer */}
        <footer className="bg-dark-800 border-t border-dark-700 mt-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div>
                <h3 className="text-white font-bold mb-3">{storeName}</h3>
                <p className="text-dark-400 text-sm leading-relaxed">
                  Roupas e acessórios fitness para você treinar com estilo e conforto.
                </p>
              </div>

              <div>
                <h4 className="text-white font-semibold mb-3">Navegação</h4>
                <ul className="space-y-2">
                  <li>
                    <a href="/" className="text-dark-400 hover:text-white text-sm transition-colors">
                      Produtos
                    </a>
                  </li>
                  <li>
                    <a href="/looks" className="text-dark-400 hover:text-white text-sm transition-colors">
                      Looks
                    </a>
                  </li>
                </ul>
              </div>

              <div>
                <h4 className="text-white font-semibold mb-3">Atendimento</h4>
                <p className="text-dark-400 text-sm mb-3">
                  Prefere falar com a gente? Estamos no WhatsApp!
                </p>
                <a
                  href={`https://wa.me/${process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || ""}?text=${encodeURIComponent("Olá! Gostaria de mais informações sobre os produtos.")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 bg-[#25D366] hover:bg-[#1db954] text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                  WhatsApp
                </a>
              </div>
            </div>

            <div className="border-t border-dark-700 mt-8 pt-6 text-center">
              <p className="text-dark-500 text-xs">
                © {new Date().getFullYear()} {storeName}. Todos os direitos reservados.
              </p>
            </div>
          </div>
        </footer>

        {/* Floating WhatsApp button */}
        <WhatsAppButton />
      </body>
    </html>
  );
}
