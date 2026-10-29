/**
 * Peças pré-escolhidas para o assistente de envio condicional: o botão "Pedir condicional" do look guarda as peças
 * aqui e o assistente (`conditional/create`) as lê uma vez ao abrir, para a lojista só escolher a cliente e preencher
 * endereço e prazo. Vale por 10 minutos, para não pegar peças de uma tentativa abandonada.
 */
export interface PresetConditionalItem {
  product_id: number;
  name: string;
  price: number;
  max_stock?: number;
  variant_id: number;
  variant_size?: string;
  variant_color?: string;
}

let preset: { items: PresetConditionalItem[]; notes: string; at: number } | null = null;
const TTL_MS = 10 * 60 * 1000;

export function setPresetConditional(items: PresetConditionalItem[], notes: string): void {
  preset = { items, notes, at: Date.now() };
}

/** Devolve as peças pré-escolhidas (se ainda valem) e esquece. */
export function takePresetConditional(): { items: PresetConditionalItem[]; notes: string } | null {
  const p = preset;
  preset = null;
  if (!p || Date.now() - p.at > TTL_MS) return null;
  return { items: p.items, notes: p.notes };
}
