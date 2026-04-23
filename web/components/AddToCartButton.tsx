"use client";

import { useCart } from "@/contexts/CartContext";

interface Props {
  product: {
    id: number;
    name: string;
    price: number;
    image_url?: string;
  };
}

export default function AddToCartButton({ product }: Props) {
  const { addItem } = useCart();

  return (
    <button
      onClick={() => addItem({ id: product.id, name: product.name, price: product.price, image_url: product.image_url })}
      className="w-full flex items-center justify-center gap-3 font-bold text-white text-base py-4 rounded-2xl transition-all hover:-translate-y-0.5 active:scale-[0.98]"
      style={{ background: "linear-gradient(135deg, #ff1a6c, #ff4f96)", boxShadow: "0 0 24px rgba(255,26,108,0.35)" }}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-5 h-5 flex-shrink-0" strokeWidth="2">
        <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" strokeLinecap="round" strokeLinejoin="round"/>
        <line x1="3" y1="6" x2="21" y2="6" strokeLinecap="round"/>
        <path d="M16 10a4 4 0 01-8 0" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      Adicionar ao carrinho
    </button>
  );
}
