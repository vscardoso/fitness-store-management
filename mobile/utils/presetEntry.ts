/**
 * Entrada pré-escolhida para o assistente de produto novo: o botão "Produto novo" dentro de uma entrada guarda o
 * número dela aqui, e a lista de Entradas (modo de vincular) a escolhe sozinha. Vale por 10 minutos e é lido uma vez,
 * para não pegar uma entrada de uma tentativa abandonada.
 */
let preset: { entryId: number; at: number } | null = null;
const TTL_MS = 10 * 60 * 1000;

export function setPresetEntry(entryId: number): void {
  preset = { entryId, at: Date.now() };
}

export function clearPresetEntry(): void {
  preset = null;
}

/** Devolve a entrada pré-escolhida (se ainda valer) e esquece. */
export function takePresetEntry(): number | null {
  const p = preset;
  preset = null;
  if (!p || Date.now() - p.at > TTL_MS) return null;
  return p.entryId;
}
