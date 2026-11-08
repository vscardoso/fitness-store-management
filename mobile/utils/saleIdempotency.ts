/**
 * Chave de idempotência da venda (testes em scripts/test-sale-idempotency.mts).
 * Mesma venda (mesmo conteúdo) = mesma chave: duplo clique ou nova tentativa depois de erro de rede
 * não grava duas vezes. Carrinho ou pagamento mudou = chave nova. Depois do sucesso, `finishSaleKey` zera.
 */
let current: { fingerprint: string; key: string } | null = null;

function newKey(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const hex = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
  return `${hex()}${hex()}-${hex()}-${hex()}-${hex()}-${hex()}${hex()}${hex()}`;
}

/** Chave desta tentativa de finalizar: reaproveita enquanto o conteúdo da venda for o mesmo. */
export function saleKeyFor(payload: unknown): string {
  const fingerprint = JSON.stringify(payload);
  if (!current || current.fingerprint !== fingerprint) current = { fingerprint, key: newKey() };
  return current.key;
}

/** Venda gravada: a próxima venda nunca reaproveita esta chave. */
export function finishSaleKey(): void {
  current = null;
}
