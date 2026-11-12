/**
 * Lê as anotações de um prejuízo ("Cliente: ... | Item do envio: ... | Quantidade perdida: 2 | Custo unitário: R$ 45,00 | ...").
 * O prejuízo é gravado como despesa com esses dados juntos no campo de observações; a lista e o detalhe os separam em campos.
 * Sem imports do React Native (teste: node scripts/test-stock-loss-notes.mts).
 */
export interface StockLossInfo {
  customer: string | null;
  shipmentItem: string | null;
  /** Peças perdidas, como veio escrito. */
  quantity: string | null;
  /** Custo de cada peça: número (já em reais) ou o texto "R$ 45,00" quando veio formatado. */
  unitCost: number | string | null;
  productId: string | null;
  sku: string | null;
  /** Texto livre de quem lançou (sem os dados técnicos). */
  observation: string | null;
}

const KNOWN = ['Cliente', 'Item do envio', 'Quantidade perdida', 'Custo unitário', 'Produto ID', 'SKU', 'Observações'];

export function parseNoteValue(notes: string | null | undefined, key: string): string | null {
  if (!notes) return null;
  const found = notes.split('|').map((part) => part.trim()).find((part) => part.toLowerCase().startsWith(key.toLowerCase()));
  if (!found) return null;
  return found.substring(found.indexOf(':') + 1).trim() || null;
}

export function parseStockLoss(notes: string | null | undefined): StockLossInfo {
  const unit = parseNoteValue(notes, 'Custo unitário');
  const tokens = (notes ?? '').split('|').map((t) => t.trim()).filter(Boolean);
  const free = tokens.filter((t) => !KNOWN.some((k) => t.toLowerCase().startsWith(k.toLowerCase())));
  return {
    customer: parseNoteValue(notes, 'Cliente'),
    shipmentItem: parseNoteValue(notes, 'Item do envio'),
    quantity: parseNoteValue(notes, 'Quantidade perdida'),
    unitCost: unit === null ? null : /^R\$/.test(unit) ? unit : Number.isFinite(Number(unit)) ? Number(unit) : unit,
    productId: parseNoteValue(notes, 'Produto ID'),
    sku: parseNoteValue(notes, 'SKU'),
    observation: parseNoteValue(notes, 'Observações') ?? (free.length ? free.join(' | ') : null),
  };
}

/** Nome do produto no lançamento avulso ("Prejuízo - Legging Preta" vira "Legging Preta"). */
export function lossProductName(description: string): string {
  return description.replace(/^Preju[ií]zo\s*[-:]\s*/i, '').trim() || description;
}
