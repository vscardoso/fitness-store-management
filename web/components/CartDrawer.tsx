"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { useCart } from "@/contexts/CartContext";

const WA_NUM    = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "";
const STORE     = process.env.NEXT_PUBLIC_STORE_NAME || "nossa loja";

const fmt = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

function buildWhatsAppMessage(items: ReturnType<typeof useCart>["items"], total: number) {
  const lines = items.map(
    (i) => `• ${i.qty}x ${i.name} — ${fmt(i.price * i.qty)}`
  );
  return [
    `Olá! Gostaria de fazer um pedido em ${STORE}:\n`,
    ...lines,
    `\n*Total: ${fmt(total)}*`,
    `\nPoderia me ajudar a finalizar?`,
  ].join("\n");
}

const WA_ICON = (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 flex-shrink-0">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
);

export default function CartDrawer() {
  const { items, isOpen, totalItems, totalPrice, removeItem, setQty, clearCart, closeCart } = useCart();
  const drawerRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") closeCart(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [closeCart]);

  // Prevent body scroll when open
  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  const handleCheckout = () => {
    const msg = buildWhatsAppMessage(items, totalPrice);
    window.open(`https://wa.me/${WA_NUM}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  return (
    <>
      {/* Overlay */}
      <div
        className={`fixed inset-0 z-[60] transition-opacity duration-300 ${isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
        style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
        onClick={closeCart}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-label="Carrinho"
        className={`fixed top-0 right-0 h-full z-[70] flex flex-col transition-transform duration-300 ease-out ${isOpen ? "translate-x-0" : "translate-x-full"}`}
        style={{ width: "min(420px, 100vw)", background: "#0f0f1e", borderLeft: "1px solid rgba(255,255,255,0.07)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
          <div className="flex items-center gap-2.5">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-5 h-5 text-pink-400" strokeWidth="1.8">
              <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" strokeLinecap="round" strokeLinejoin="round"/>
              <line x1="3" y1="6" x2="21" y2="6" strokeLinecap="round"/>
              <path d="M16 10a4 4 0 01-8 0" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="text-white font-bold text-base">Carrinho</span>
            {totalItems > 0 && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(255,26,108,0.15)", color: "#ff6ba8" }}>
                {totalItems} {totalItems === 1 ? "item" : "itens"}
              </span>
            )}
          </div>
          <button
            onClick={closeCart}
            className="text-white/40 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/5"
            aria-label="Fechar carrinho"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-5 h-5" strokeWidth="2">
              <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto py-4 px-5 space-y-3">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-7 h-7 text-white/20" strokeWidth="1.5">
                  <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" strokeLinecap="round" strokeLinejoin="round"/>
                  <line x1="3" y1="6" x2="21" y2="6" strokeLinecap="round"/>
                  <path d="M16 10a4 4 0 01-8 0" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div>
                <p className="text-white/50 font-medium text-sm">Carrinho vazio</p>
                <p className="text-white/25 text-xs mt-1">Adicione produtos para montar seu pedido</p>
              </div>
              <button
                onClick={closeCart}
                className="text-sm font-semibold px-5 py-2.5 rounded-full transition-all"
                style={{ background: "rgba(255,26,108,0.1)", border: "1px solid rgba(255,26,108,0.2)", color: "#ff6ba8" }}
              >
                Ver produtos
              </button>
            </div>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                className="flex gap-3 p-3 rounded-xl"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
              >
                {/* Thumbnail */}
                <div className="relative w-16 h-20 flex-shrink-0 rounded-lg overflow-hidden" style={{ background: "#13131f" }}>
                  {item.image_url ? (
                    <Image src={item.image_url} alt={item.name} fill className="object-cover" sizes="64px"/>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-5 h-5 text-white/10" strokeWidth="1">
                        <rect x="3" y="3" width="18" height="18" rx="2"/>
                        <circle cx="8.5" cy="8.5" r="1.5"/>
                        <path d="M21 15l-5-5L5 21"/>
                      </svg>
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium leading-snug line-clamp-2 mb-2">{item.name}</p>
                  <p className="text-pink-400 text-sm font-bold mb-3">{fmt(item.price)}</p>

                  {/* Qty controls */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setQty(item.id, item.qty - 1)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-all"
                      style={{ border: "1px solid rgba(255,255,255,0.1)" }}
                      aria-label="Diminuir quantidade"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-3.5 h-3.5" strokeWidth="2.5">
                        <path d="M5 12h14" strokeLinecap="round"/>
                      </svg>
                    </button>
                    <span className="text-white text-sm font-semibold w-5 text-center">{item.qty}</span>
                    <button
                      onClick={() => setQty(item.id, item.qty + 1)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-all"
                      style={{ border: "1px solid rgba(255,255,255,0.1)" }}
                      aria-label="Aumentar quantidade"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-3.5 h-3.5" strokeWidth="2.5">
                        <path d="M12 5v14M5 12h14" strokeLinecap="round"/>
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Subtotal + remove */}
                <div className="flex flex-col items-end justify-between">
                  <button
                    onClick={() => removeItem(item.id)}
                    className="text-white/20 hover:text-red-400 transition-colors p-1"
                    aria-label={`Remover ${item.name}`}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-4 h-4" strokeWidth="1.8">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                  <p className="text-white/60 text-xs font-medium">{fmt(item.price * item.qty)}</p>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="px-5 py-5 border-t space-y-3" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
            {/* Total */}
            <div className="flex items-center justify-between mb-1">
              <span className="text-white/50 text-sm">Total do pedido</span>
              <span className="text-white font-black text-xl">{fmt(totalPrice)}</span>
            </div>
            <p className="text-white/25 text-xs">3x de {fmt(totalPrice / 3)} sem juros via WhatsApp</p>

            {/* CTA */}
            <button
              onClick={handleCheckout}
              className="w-full flex items-center justify-center gap-2.5 font-bold text-white text-base py-4 rounded-2xl transition-all hover:-translate-y-0.5 active:translate-y-0"
              style={{ background: "#25D366", boxShadow: "0 0 24px rgba(37,211,102,0.3)" }}
            >
              {WA_ICON}
              Enviar pedido no WhatsApp
            </button>

            <button
              onClick={clearCart}
              className="w-full text-center text-white/30 hover:text-white/60 text-xs py-1 transition-colors"
            >
              Limpar carrinho
            </button>
          </div>
        )}
      </div>
    </>
  );
}
