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
