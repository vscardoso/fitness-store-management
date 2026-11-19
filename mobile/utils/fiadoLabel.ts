/**
 * Textos que ligam o Fiado do relatório de vendas à tela Fiado. As duas contas são diferentes de propósito:
 *  - relatório de vendas: o que foi VENDIDO no fiado no período (inclusive o que já foi pago ou devolvido);
 *  - tela Fiado: o que FALTA receber hoje, de todas as vendas e do fiado anterior ao app.
 * Sem esses textos a loja via R$ 4.307,13 num lado e R$ 5.501,63 no outro e achava que um estava errado.
 * Sem imports do React Native (testes: node scripts/test-fiado-label.mts).
 */
export interface FiadoSituation { received: number; returned: number; open: number }

type Money = (value: number) => string;
const cents = (v: number) => Math.round((Number(v) || 0) * 100);

// Cada trecho usa espaço que não quebra: na coluna estreita a linha quebra ENTRE os trechos, nunca no meio de "Falta receber".
const solid = (t: string) => t.replace(/ /g, ' ');

/** "Já recebido R$ 50,00 · Devolvido R$ 94,90 · Falta receber R$ 4.162,23"; só o que existe. */
export function fiadoSituationText(s: FiadoSituation | null | undefined, money: Money): string | null {
  if (!s) return null;
  const parts: string[] = [];
  if (cents(s.received) > 0) parts.push(solid(`Já recebido ${money(s.received)}`));
  if (cents(s.returned) > 0) parts.push(solid(`Devolvido ${money(s.returned)}`));
  parts.push(solid(cents(s.open) > 0 ? `Falta receber ${money(s.open)}` : 'Nada a receber'));
  return parts.join(' · ');
}

/** Frase embaixo do cartão: o que o relatório conta e onde ver o que falta receber. */
export const FIADO_REPORT_NOTE =
  'No fiado, o valor é o que foi vendido no período, mesmo o que já foi pago ou devolvido. Quanto falta receber, somando o fiado anterior ao app, está na tela Fiado.';

/** Tela Fiado: de onde vem o "A receber". Só aparece quando há fiado anterior ao app (senão é tudo de vendas). */
export function fiadoSplitText(s: { open_from_sales?: number; open_from_opening?: number } | null | undefined, money: Money): string | null {
  if (!s || cents(s.open_from_opening ?? 0) <= 0) return null;
  return `Vendas no fiado ${money(s.open_from_sales ?? 0)} · Fiado anterior ao app ${money(s.open_from_opening ?? 0)}`;
}
