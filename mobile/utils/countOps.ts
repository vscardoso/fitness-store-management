/**
 * Operações de contagem compartilhada (Conferência de estoque e Conferir recebimento usam as MESMAS): cada bipada é uma
 * operação sobre uma peça, enviada ao servidor, onde soma com as das outras pessoas. Lógica pura, testada em
 * scripts/test-count-ops.mts.
 */

export interface CountOp {
  variant_id: number;
  /** +1 ao bipar, -1 na seta */
  delta?: number;
  /** quantidade digitada */
  set?: number;
  /** volta a peça para "não contada" */
  clear?: boolean;
}

export type CountMap = Record<number, number>;

const clamp = (n: number) => Math.max(0, Math.min(Math.trunc(n), 1_000_000));

/** Aplica UMA operação ao mapa de contagens (peça sem leitura = ausente). Devolve um mapa novo. */
export const applyOp = (base: CountMap, op: CountOp): CountMap => {
  const next = { ...base };
  if (op.clear) {
    delete next[op.variant_id];
    return next;
  }
  const cur = next[op.variant_id] ?? 0;
  next[op.variant_id] = op.set != null ? clamp(op.set) : clamp(cur + (op.delta ?? 0));
  return next;
};

/** O que o aparelho mostra: o que o servidor tem + as operações deste aparelho que o servidor ainda não confirmou. */
export const overlayOps = (server: CountMap, pending: CountOp[]): CountMap => pending.reduce(applyOp, { ...server });

/** Identificador de lote: o servidor ignora um lote que já aplicou (reenvio depois de falha de rede). */
export const newBatchId = (): string => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** Total de peças de um mapa. */
export const sumCounts = (m: CountMap): number => Object.values(m).reduce((a, b) => a + b, 0);
