/**
 * Cartão "o dinheiro do mês bate?" do Financeiro: monta o título e as linhas a partir do que o servidor entrega
 * (`GET /finance/reconciliation`), sem refazer conta: começou + entrou - saiu ± caixa ± correções à mão ± outras diferenças = contas mostram.
 * O servidor guarda `should_have` (deveria ter) e `difference` (contas menos deveria ter); a diferença é dividida em
 * "correções feitas à mão" (`adjustments_total`) e "outras diferenças" (o que sobrar), então a soma das linhas SEMPRE chega no que as contas mostram.
 */
import type { Reconciliation } from '@/services/financeService';

export type ReconTone = 'ok' | 'warn';
export type ReconRow = { key: string; label: string; value: number; kind: 'plain' | 'plus' | 'minus' | 'signed' | 'total' };
export type ReconView = {
  tone: ReconTone;
  /** 'ok' bate; 'adjusted' houve correção à mão; 'unexplained' há sobra que o app não sabe explicar */
  status: 'ok' | 'adjusted' | 'unexplained';
  title: string;
  hint: string | null;
  rows: ReconRow[];
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export function buildReconView(d: Reconciliation, brl: (n: number) => string): ReconView | null {
  if (!d.started || d.status === 'empty' || d.should_have === undefined) return null;
  const residual = d.bridge && d.bridge.status === 'unexplained' ? Math.abs(d.bridge.residual) : 0;
  const diff = r2(d.difference ?? 0);
  const adj = r2(d.adjustments_total ?? 0);
  const other = r2(diff - adj);
  const status: ReconView['status'] = residual > 0 ? 'unexplained' : diff === 0 ? 'ok' : 'adjusted';

  const rows: ReconRow[] = [
    { key: 'opening', label: 'Começou o mês com', value: d.opening ?? 0, kind: 'plain' },
    { key: 'entered', label: '+ Entrou (vendas e fiado recebido)', value: d.entered ?? 0, kind: 'plus' },
    { key: 'left', label: '− Saiu (despesas, compras, contas pagas)', value: d.left ?? 0, kind: 'minus' },
  ];
  if (Math.abs(d.cash_net ?? 0) > 0.004) rows.push({ key: 'cash', label: '± Caixa (colocado menos tirado)', value: d.cash_net ?? 0, kind: 'signed' });
  if (Math.abs(adj) > 0.004) rows.push({ key: 'adjustments', label: '± Correções feitas à mão', value: adj, kind: 'signed' });
  if (Math.abs(other) > 0.004) rows.push({ key: 'other', label: '± Outras diferenças', value: other, kind: 'signed' });
  rows.push({ key: 'have', label: '= As contas mostram', value: d.have ?? 0, kind: 'total' });

  const title = status === 'ok' ? 'O dinheiro do mês bate'
    : status === 'unexplained' ? `${brl(residual)} sem explicação`
      : 'Você corrigiu o dinheiro à mão neste mês';
  const hint = status === 'unexplained'
    ? 'O app não sabe de onde veio nem para onde foi esse dinheiro. Toque em “Ver para onde foi o dinheiro” e confira.'
    : null;
  return { tone: status === 'ok' ? 'ok' : 'warn', status, title, hint, rows };
}

/** Soma das linhas até a última (para conferir que o cartão fecha na tela). */
export function reconRowsSum(rows: ReconRow[]): number {
  let t = 0;
  for (const r of rows) {
    if (r.kind === 'total') continue;
    t += r.kind === 'minus' ? -r.value : r.value;
  }
  return r2(t);
}
