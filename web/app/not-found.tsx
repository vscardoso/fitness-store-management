import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="text-center">
        <div className="text-8xl font-black text-brand-500 mb-4">404</div>
        <h1 className="text-2xl font-bold text-white mb-2">Página não encontrada</h1>
        <p className="text-dark-400 mb-8">
          A página que você está procurando não existe ou foi removida.
        </p>
        <Link href="/" className="btn-primary">
          Voltar ao início
        </Link>
      </div>
    </div>
  );
}
