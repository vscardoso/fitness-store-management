/**
 * Nome da(s) forma(s) de pagamento de uma venda, para tabelas e listas. Mostra todas as formas usadas ("Dinheiro + PIX") e
 * conhece todas as do sistema, inclusive Fiado e Pontos (a tabela do notebook não conhecia Fiado e mostrava "-").
 * Sem imports do React Native (testes: node scripts/test-payment-label.mts).
 */
export const PAYMENT_LABEL: Record<string, string> = {
  cash: 'Dinheiro', pix: 'PIX', debit_card: 'Débito', credit_card: 'Crédito', transfer: 'Transferência', bank_transfer: 'Transferência',
  installments: 'Parcelado', on_account: 'Fiado', loyalty_points: 'Pontos',
};

export function paymentText(sale: { payment_method?: unknown; payments?: Array<{ payment_method?: unknown; method?: unknown }> | null }): string {
  const fromPayments = Array.from(new Set((sale.payments ?? []).map((p) => String(p.payment_method ?? p.method ?? '').toLowerCase()).filter(Boolean)));
  const methods = fromPayments.length ? fromPayments : [String(sale.payment_method ?? '').toLowerCase()];
  return methods.map((m) => PAYMENT_LABEL[m]).filter(Boolean).join(' + ');
}

const LONG_LABEL: Record<string, string> = {
  cash: 'Dinheiro', pix: 'PIX', debit_card: 'Cartão de débito', credit_card: 'Cartão de crédito', transfer: 'Transferência',
  bank_transfer: 'Transferência', installments: 'Parcelado', on_account: 'Fiado', loyalty_points: 'Pontos de fidelidade',
};

/**
 * Uma linha de pagamento para a tela e o comprovante: o nome da forma, o detalhe (parcelas do crédito) e o valor, cada um no
 * seu lugar. Antes tudo ia num texto só ("Cartão de Crédito · 6x de R$ 116,67 R$ 700,00") e passava da largura da tela.
 * `money` formata em reais (ex.: formatCurrency).
 */
export function paymentLine(
  p: { method?: unknown; payment_method?: unknown; amount: number | string; installments?: number | null },
  money: (n: number) => string,
): { label: string; detail: string | null; amount: string } {
  const key = String(p.method ?? p.payment_method ?? '').toLowerCase();
  const amount = Number(p.amount) || 0;
  const inst = Number(p.installments) || 1;
  let detail: string | null = null;
  if (key === 'credit_card') detail = inst > 1 ? `${inst}x de ${money(amount / inst)}` : 'à vista';
  return { label: LONG_LABEL[key] ?? (key || 'Não informado'), detail, amount: money(amount) };
}
