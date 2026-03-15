import Link from "next/link";

export default function NotFound() {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-5"
      style={{ background: "#0d0d18" }}
    >
      <div className="text-center">
        {/* Glow number */}
        <div className="relative mb-6">
          <p
            className="text-[10rem] font-black leading-none select-none"
            style={{
              background: "linear-gradient(135deg, #ff1a6c, #ff6ba8)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              filter: "drop-shadow(0 0 40px rgba(255,26,108,0.4))",
            }}
          >
            404
          </p>
        </div>

        <h1 className="text-2xl font-bold text-white mb-3">Página não encontrada</h1>
        <p className="text-white/40 mb-8 max-w-xs mx-auto text-sm leading-relaxed">
          O link que você acessou não existe ou foi removido.
        </p>

        <Link href="/" className="btn-pink px-8 py-3">
          Voltar ao início
        </Link>
      </div>
    </div>
  );
}
