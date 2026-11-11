/**
 * Desconto por peça (Black Friday: cada peça da mesma venda com o seu desconto).
 *
 * Quem fixa o desconto é a pessoa que vende: digita em % ou em R$ POR PEÇA. Nada aqui tem valor pronto.
 * Tudo em centavos inteiros: o servidor grava o desconto da linha em reais com 2 casas, e a conta precisa
 * dar o mesmo número na tela, no comprovante, na devolução e no relatório.
 *
 * Regra do preço por peça: o preço com desconto é arredondado ao centavo POR PEÇA (R$ 99,90 com 33% = R$ 66,93 cada),
 * e o desconto da linha é (preço cheio - preço com desconto) x quantidade. Assim 3 peças custam 3 x R$ 66,93 e devolver
 * uma devolve exatamente R$ 66,93.
 *
 * Sem imports do React Native: testável com `node scripts/test-item-discount.mts`.
 */

export type DiscountKind = 'percent' | 'value';

export type DiscountResult =
  | { ok: true; unitDiscount: number; percent: number }
  | { ok: false; message: string };

const toCents = (v: number): number => Math.round((Number(v) + Number.EPSILON) * 100);
const fromCents = (c: number): number => c / 100;

/** "12,5", "1.234,50", "R$ 10", "30%" -> número. Vazio, texto ou negativo -> null. */
export function parseTypedNumber(raw: string): number | null {
  if (raw == null) return null;
  let s = String(raw).trim().replace(/R\$|%|\s/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Percentual do desconto sobre o preço cheio (uma casa decimal): 6,99 de 99,90 = 7,0. */
export function percentOf(unitDiscount: number, unitPrice: number): number {
  if (!(unitPrice > 0)) return 0;
  return Math.round((toCents(unitDiscount) / toCents(unitPrice)) * 1000) / 10;
}

/** Desconto da linha toda: desconto por peça x quantidade, em centavos exatos. */
export function lineDiscount(unitDiscount: number, quantity: number): number {
  return fromCents(toCents(unitDiscount) * Math.max(0, Math.trunc(quantity)));
}

/** Preço de UMA peça já com desconto. */
export function unitNet(unitPrice: number, unitDiscount: number): number {
  return fromCents(Math.max(0, toCents(unitPrice) - toCents(unitDiscount)));
}

/** Valor da linha (quantidade x preço) menos o desconto da linha. */
export function lineNet(unitPrice: number, quantity: number, unitDiscount: number): number {
  return fromCents(toCents(unitPrice) * quantity - toCents(unitDiscount) * quantity);
}

/**
 * Converte o que foi digitado em desconto por peça.
 * `kind` 'percent': 0 < % < 100. `kind` 'value': 0 < R$ por peça < preço da peça.
 * Desconto que deixaria a peça de graça é recusado (peça sem cobrança é Brinde, com o custo registrado).
 */
export function discountFromInput(kind: DiscountKind, raw: string, unitPrice: number): DiscountResult {
  const typed = parseTypedNumber(raw);
  if (typed === null) return { ok: false, message: kind === 'percent' ? 'Digite o desconto em %, por exemplo 15.' : 'Digite o desconto em R$ por peça.' };
  const priceCents = toCents(unitPrice);
  if (priceCents <= 0) return { ok: false, message: 'Esta peça está sem preço.' };
  if (typed <= 0) return { ok: false, message: 'O desconto precisa ser maior que zero.' };

  let discountCents: number;
  if (kind === 'percent') {
    if (typed >= 100) return { ok: false, message: 'O desconto tem que ser menor que 100%. Para dar a peça sem cobrança, use Brindes no menu Mais.' };
    // preço com desconto arredondado ao centavo POR PEÇA
    const netCents = Math.round((priceCents * (100 - typed)) / 100);
    discountCents = priceCents - netCents;
  } else {
    discountCents = toCents(typed);
  }
  if (discountCents <= 0) return { ok: false, message: 'Esse desconto é menor que 1 centavo por peça.' };
  if (discountCents > priceCents) return { ok: false, message: `O desconto não pode ser maior que o preço da peça (${brl(unitPrice)}).` };
  if (discountCents === priceCents) return { ok: false, message: 'A peça ficaria de graça. Para dar a peça sem cobrança, use Brindes no menu Mais.' };
  const unitDiscount = fromCents(discountCents);
  return { ok: true, unitDiscount, percent: percentOf(unitDiscount, unitPrice) };
}

function brl(v: number): string {
  return `R$ ${v.toFixed(2).replace('.', ',')}`;
}

/** "30%" ou "12,5%" (sem zero à toa). */
export function percentLabel(p: number): string {
  const r = Math.round(p * 10) / 10;
  return `${String(r).replace('.', ',')}%`;
}

/** Soma dos descontos dados em cada peça de uma venda (centavos exatos). */
export function itemsDiscountOf(items: { discount_amount?: number | string | null }[] | undefined | null): number {
  return fromCents((items ?? []).reduce((s, i) => s + toCents(Number(i.discount_amount ?? 0)), 0));
}
