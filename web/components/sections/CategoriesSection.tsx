import type { Category } from "@/types";

interface Props {
  categories: Category[];
  onSelect?: (name: string) => void;
}

// Mapeamento de ícone + cor por nome de categoria (fallback genérico)
const CATEGORY_CONFIG: Record<string, { icon: string; gradient: string }> = {
  "Camisetas": {
    icon: "M12 3C9 3 6.5 5 6 8H4l1 13h14l1-13h-2c-.5-3-3-5-6-5zm0 2c2 0 3.5 1.3 4 3H8c.5-1.7 2-3 4-3z",
    gradient: "from-pink-600/20 to-rose-900/20",
  },
  "Leggings e Calças": {
    icon: "M8 3l-2 18h4l2-8 2 8h4L16 3h-2l-2 7-2-7H8z",
    gradient: "from-purple-600/20 to-violet-900/20",
  },
  "Shorts e Bermudas": {
    icon: "M6 3l-1 9h10L14 3H6zm-1 9l2 9h2l1-5 1 5h2l2-9H5z",
    gradient: "from-blue-600/20 to-indigo-900/20",
  },
  "Tops e Sutiãs": {
    icon: "M12 2C9.5 2 7.5 3.5 7 5.5L5 8h14l-2-2.5C16.5 3.5 14.5 2 12 2zm-7 8l2 12h10l2-12H5z",
    gradient: "from-pink-500/20 to-fuchsia-900/20",
  },
  "Jaquetas e Moletons": {
    icon: "M12 2L8 4v4H4l1 14h14l1-14h-4V4L12 2zm0 2.5L14 5.5V8h-4V5.5L12 4.5z",
    gradient: "from-orange-600/20 to-red-900/20",
  },
  "Tênis e Calçados": {
    icon: "M3 14l2-4 4-1 2 2h6l2 3-1 4H4l-1-4zm14-4l1-4-8-1-2 5h9z",
    gradient: "from-green-600/20 to-emerald-900/20",
  },
  "Acessórios": {
    icon: "M12 2a4 4 0 100 8 4 4 0 000-8zm-1 10v9l-4-2V12h4zm2 0h4v7l-4 2V12z",
    gradient: "from-yellow-600/20 to-amber-900/20",
  },
};

const DEFAULT_CONFIG = {
  icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
  gradient: "from-slate-600/20 to-slate-900/20",
};

export default function CategoriesSection({ categories }: Props) {
  if (categories.length === 0) return null;

  return (
    <section className="py-16">
      <div className="max-w-7xl mx-auto px-5 sm:px-8">
        <div className="mb-10">
          <p className="section-label mb-2">navegue por</p>
          <h2 className="text-3xl md:text-4xl font-black text-white leading-tight">
            Categorias
          </h2>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
          {categories.map((cat) => {
            const config = CATEGORY_CONFIG[cat.name] ?? DEFAULT_CONFIG;
            return (
              <a
                key={cat.id}
                href={`/#produtos`}
                className="group flex flex-col items-center gap-3 p-5 rounded-2xl text-center transition-all duration-300 hover:-translate-y-1 hover:border-white/15 cursor-pointer"
                style={{
                  background: `linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))`,
                  border: "1px solid rgba(255,255,255,0.07)",
                }}
              >
                {/* Ícone com gradiente */}
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br ${config.gradient} transition-transform duration-300 group-hover:scale-110`}
                  style={{ border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-5 h-5" style={{ color: "var(--pink-light)" }}>
                    <path d={config.icon} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>

                <span className="text-white/70 text-xs font-medium leading-tight group-hover:text-white transition-colors">
                  {cat.name}
                </span>
              </a>
            );
          })}
        </div>
      </div>
    </section>
  );
}
