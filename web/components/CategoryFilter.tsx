"use client";

import type { Category } from "@/types";

interface Props {
  categories: Category[];
  selected: string | null;
  onChange: (cat: string | null) => void;
}

export default function CategoryFilter({ categories, selected, onChange }: Props) {
  const pills = [
    { key: null, label: "Todos" },
    ...categories.map((c) => ({ key: c.name, label: c.name })),
  ];

  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2">
      {pills.map(({ key, label }) => {
        const active = selected === key;
        return (
          <button
            key={label}
            onClick={() => onChange(key)}
            className={`flex-shrink-0 px-5 py-2 rounded-full text-sm font-semibold transition-all duration-300 cursor-pointer ${
              active
                ? "btn-pink shadow-none"
                : "glass text-white/60 hover:text-white hover:border-white/20"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
