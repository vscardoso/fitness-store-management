/**
 * Leitura de etiqueta no envio condicional (regra pura, sem tela; testes em scripts/test-conditional-scan.mts).
 * - Montar o envio: cada leitura soma 1 peça daquela cor/tamanho, sem passar do estoque.
 * - Receber de volta: cada leitura marca 1 peça daquela cor/tamanho como devolvida.
 * Número sozinho (26 = produto #026) só vale quando o produto tem uma variação: com várias, não dá para saber qual peça é.
 */
import type { LookupResult } from '../services/codeResolver';

export type ScanOutcome = { kind: 'ok' | 'warn' | 'error'; text: string };

export interface ScanSelectedProduct {
  product_id: number;
  name: string;
  price: number;
  quantity_sent: number;
  max_stock?: number;
  variant_id?: number;
  variant_size?: string;
  variant_color?: string;
}

const label = (color?: string | null, size?: string | null) => [color, size].filter(Boolean).join(' · ') || 'Única';

/** Número sozinho de produto com várias variações: pedir a etiqueta da peça. */
function ambiguousProduct(found: LookupResult): ScanOutcome | null {
  if (found.match !== 'product' || found.siblings.length <= 1) return null;
  return {
    kind: 'warn',
    text: `${found.product.name}: esse é o código do produto. Bipe a etiqueta da peça (cor e tamanho).`,
  };
}

/** Montar o envio: devolve a lista nova (ou a mesma, se recusou) e o aviso da barra. */
export function addScannedPiece(
  list: ScanSelectedProduct[],
  found: LookupResult,
): { list: ScanSelectedProduct[]; outcome: ScanOutcome } {
  const amb = ambiguousProduct(found);
  if (amb) return { list, outcome: amb };

  const v = found.variant;
  const title = `${found.product.name} · ${label(v.color, v.size)}`;
  const idx = list.findIndex((p) => p.product_id === found.product.id && p.variant_id === v.id);
  const already = idx >= 0 ? list[idx].quantity_sent : 0;
  const stock = Number(v.current_stock) || 0;

  if (stock <= 0) return { list, outcome: { kind: 'warn', text: `${title}: sem estoque, não foi adicionada.` } };
  if (already + 1 > stock) {
    return { list, outcome: { kind: 'warn', text: `${title}: só há ${stock} em estoque e já estão no envio.` } };
  }

  const next = idx >= 0
    ? list.map((p, i) => (i === idx ? { ...p, quantity_sent: p.quantity_sent + 1, max_stock: stock } : p))
    : [...list, {
        product_id: found.product.id,
        name: found.product.name,
        price: Number(v.price) || 0,
        quantity_sent: 1,
        max_stock: stock,
        variant_id: v.id,
        variant_size: v.size || undefined,
        variant_color: v.color || undefined,
      }];
  return { list: next, outcome: { kind: 'ok', text: `${title}: ${already + 1} no envio` } };
}

export interface ScanShipmentItem {
  id: number;
  product_id: number;
  variant_id?: number | null;
  quantity_sent: number;
  product_name?: string;
  variant_color?: string | null;
  variant_size?: string | null;
}

export interface ScanItemDraft {
  quantity_kept: number;
  quantity_returned: number;
  quantity_damaged: number;
  quantity_lost: number;
}

const used = (d?: ScanItemDraft) =>
  d ? d.quantity_kept + d.quantity_returned + d.quantity_damaged + d.quantity_lost : 0;

/**
 * Receber de volta: qual item ganha +1 devolvida. Uma peça marcada como "comprou" que aparece na leitura
 * passa a ser devolvida (a cliente trouxe de volta), desde que ainda haja "comprou" naquele item.
 */
export function markReturnedPiece(
  items: ScanShipmentItem[],
  drafts: Record<number, ScanItemDraft | undefined>,
  found: LookupResult,
): { itemId: number | null; updates?: Partial<ScanItemDraft>; outcome: ScanOutcome } {
  const inShipment = (variantId: number) =>
    items.filter((it) => it.product_id === found.product.id && (it.variant_id ?? null) === variantId);

  // número sozinho: só serve se uma única variação do produto estiver neste envio
  let candidates = inShipment(found.variant.id);
  if (found.match === 'product' && found.siblings.length > 1) {
    const sentVariants = new Set(
      items.filter((it) => it.product_id === found.product.id).map((it) => it.variant_id ?? null),
    );
    if (sentVariants.size !== 1) {
      return { itemId: null, outcome: ambiguousProduct(found)! };
    }
    candidates = items.filter((it) => it.product_id === found.product.id);
  }

  const v = found.variant;
  const first = candidates[0];
  const title = `${found.product.name} · ${label(first?.variant_color ?? v.color, first?.variant_size ?? v.size)}`;
  if (candidates.length === 0) {
    return { itemId: null, outcome: { kind: 'error', text: `${title}: essa peça não está neste envio.` } };
  }

  const pending = candidates.find((it) => used(drafts[it.id]) < it.quantity_sent);
  if (pending) {
    const d = drafts[pending.id];
    const returned = (d?.quantity_returned ?? 0) + 1;
    return {
      itemId: pending.id,
      updates: { quantity_returned: returned },
      outcome: { kind: 'ok', text: `${title}: ${returned} de ${pending.quantity_sent} devolvida${pending.quantity_sent > 1 ? 's' : ''}` },
    };
  }

  const keptOne = candidates.find((it) => (drafts[it.id]?.quantity_kept ?? 0) > 0);
  if (keptOne) {
    const d = drafts[keptOne.id]!;
    return {
      itemId: keptOne.id,
      updates: { quantity_kept: d.quantity_kept - 1, quantity_returned: d.quantity_returned + 1 },
      outcome: { kind: 'ok', text: `${title}: estava como comprada, passou para devolvida` },
    };
  }

  const sent = candidates.reduce((s, it) => s + it.quantity_sent, 0);
  return {
    itemId: null,
    outcome: { kind: 'warn', text: `${title}: as ${sent} enviadas já foram marcadas.` },
  };
}

/** "O resto ela ficou": o que não foi bipado nem marcado vira comprado. */
export function keepTheRest(
  items: ScanShipmentItem[],
  drafts: Record<number, ScanItemDraft | undefined>,
): { itemId: number; quantity_kept: number }[] {
  return items
    .map((it) => {
      const d = drafts[it.id];
      const rest = it.quantity_sent - used(d);
      return rest > 0 ? { itemId: it.id, quantity_kept: (d?.quantity_kept ?? 0) + rest } : null;
    })
    .filter((x): x is { itemId: number; quantity_kept: number } => x !== null);
}
