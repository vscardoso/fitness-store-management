"use client";

import { useState } from "react";
import Image from "next/image";

interface Props {
  images: string[];
  productName: string;
  fallbackImage?: string;
}

export default function ProductGallery({ images, productName, fallbackImage }: Props) {
  const allImages = images.length > 0 ? images : (fallbackImage ? [fallbackImage] : []);
  const [selected, setSelected] = useState(0);

  if (allImages.length === 0) {
    return (
      <div
        className="relative overflow-hidden rounded-2xl w-full flex flex-col items-center justify-center gap-3"
        style={{ aspectRatio: "3/4", background: "linear-gradient(135deg, #13131f, #1e1e30)" }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-16 h-16 text-white/10">
          <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth="1"/>
          <circle cx="8.5" cy="8.5" r="1.5" strokeWidth="1"/>
          <path d="M21 15l-5-5L5 21" strokeWidth="1"/>
        </svg>
        <p className="text-white/20 text-sm">Foto em breve</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Imagem principal */}
      <div
        className="relative overflow-hidden rounded-2xl"
        style={{ aspectRatio: "3/4", background: "linear-gradient(135deg, #13131f, #1e1e30)" }}
      >
        <Image
          src={allImages[selected]}
          alt={`${productName} — foto ${selected + 1}`}
          fill
          className="object-cover transition-opacity duration-300"
          sizes="(max-width: 1024px) 100vw, 50vw"
          priority={selected === 0}
        />

        {/* Navegação por setas (só se tiver múltiplas fotos) */}
        {allImages.length > 1 && (
          <>
            <button
              onClick={() => setSelected((s) => (s - 1 + allImages.length) % allImages.length)}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center transition-all hover:scale-110"
              style={{ background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.1)" }}
              aria-label="Foto anterior"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="white" className="w-4 h-4">
                <path d="M15 18l-6-6 6-6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <button
              onClick={() => setSelected((s) => (s + 1) % allImages.length)}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center transition-all hover:scale-110"
              style={{ background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.1)" }}
              aria-label="Próxima foto"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="white" className="w-4 h-4">
                <path d="M9 18l6-6-6-6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>

            {/* Indicador de posição */}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
              {allImages.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setSelected(i)}
                  className="rounded-full transition-all"
                  style={{
                    width: i === selected ? "20px" : "6px",
                    height: "6px",
                    background: i === selected ? "var(--pink-light)" : "rgba(255,255,255,0.3)",
                  }}
                  aria-label={`Ir para foto ${i + 1}`}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Thumbnails (só se tiver 2+ fotos) */}
      {allImages.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {allImages.map((url, i) => (
            <button
              key={i}
              onClick={() => setSelected(i)}
              className="flex-shrink-0 relative overflow-hidden rounded-lg transition-all"
              style={{
                width: "64px",
                height: "80px",
                border: i === selected
                  ? "2px solid var(--pink-light)"
                  : "2px solid rgba(255,255,255,0.08)",
                opacity: i === selected ? 1 : 0.5,
              }}
              aria-label={`Selecionar foto ${i + 1}`}
            >
              <Image
                src={url}
                alt={`${productName} miniatura ${i + 1}`}
                fill
                className="object-cover"
                sizes="64px"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
