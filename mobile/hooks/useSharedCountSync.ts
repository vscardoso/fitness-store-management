/**
 * Motor do bipe compartilhado: é o MESMO para a Conferência de estoque e para o Conferir recebimento (só muda o escopo: a loja
 * ou uma entrada). Cada bipada vira operação (+1, -1, quantidade digitada, limpar), vai ao servidor em lotes e soma com as das
 * outras pessoas; a tela puxa o que os outros contaram a cada poucos segundos.
 *
 * - Fila: as operações esperam 300 ms (várias bipadas seguidas viram um lote só).
 * - Lote com identificador: se a resposta se perde e o aparelho reenvia, o servidor reconhece o lote e NÃO conta de novo.
 * - Falha de rede: o lote fica guardado e é reenviado (2,5 s depois), igual, com o mesmo identificador.
 * - 404/409 (conferência apagada ou finalizada por outra pessoa): avisa a tela (`onEnded`) e esquece a fila.
 * - A atualização automática não roda enquanto há operação por enviar (não pisa no que a pessoa acabou de bipar).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { newBatchId, type CountOp } from '@/utils/countOps';

/** Versão do que o servidor tem; quando muda, chegou contagem nova. */
export type CountRevision = number | string;

export interface SharedCountSyncOptions<D> {
  /** Há conferência no servidor: liga a atualização automática. */
  enabled: boolean;
  /** Leitura silenciosa (sem a lupa de carregando). */
  fetchDetail: () => Promise<D>;
  revisionOf: (detail: D) => CountRevision;
  /** A conferência acabou (finalizada por outra pessoa)? */
  isEnded?: (detail: D) => boolean;
  /** Envia um lote e devolve a versão nova do servidor (ou null se não souber). */
  sendOps: (ops: CountOp[], batchId: string) => Promise<CountRevision | null>;
  /** Põe na tela o que o servidor tem (a tela sobrepõe `getPending()`). */
  onDetail: (detail: D) => void;
  onEnded: () => void;
  pollMs?: number;
}

const statusOf = (e: any): number | undefined => e?.response?.status ?? e?.status;

export function useSharedCountSync<D>(options: SharedCountSyncOptions<D>) {
  const opts = useRef(options);
  opts.current = options;

  const pendingRef = useRef<CountOp[]>([]);
  const inflightRef = useRef<{ id: string; ops: CountOp[] } | null>(null);
  const flushingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revisionRef = useRef<CountRevision | null>(null);
  const [syncError, setSyncError] = useState(false);

  /** Operações deste aparelho que o servidor ainda não confirmou (o lote em voo vem primeiro). */
  const getPending = useCallback((): CountOp[] => [...(inflightRef.current?.ops ?? []), ...pendingRef.current], []);
  const hasPending = useCallback(() => !!inflightRef.current || pendingRef.current.length > 0, []);

  const reset = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    pendingRef.current = [];
    inflightRef.current = null;
    revisionRef.current = null;
    setSyncError(false);
  }, []);

  const scheduleFlush = useCallback((ms: number) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { void flushRef.current(); }, ms);
  }, []);

  const flushRef = useRef<() => Promise<void>>(async () => {});
  flushRef.current = async () => {
    if (flushingRef.current) return;
    if (!inflightRef.current) {
      if (!pendingRef.current.length) return;
      inflightRef.current = { id: newBatchId(), ops: pendingRef.current };
      pendingRef.current = [];
    }
    flushingRef.current = true;
    let ended = false;
    try {
      const rev = await opts.current.sendOps(inflightRef.current.ops, inflightRef.current.id);
      inflightRef.current = null;
      if (rev != null) revisionRef.current = rev;
      setSyncError(false);
    } catch (e: any) {
      const st = statusOf(e);
      if (st === 404 || st === 409) {
        ended = true;
        reset();
        opts.current.onEnded();
      } else {
        setSyncError(true);   // o lote continua guardado e vai de novo, com o mesmo identificador
      }
    } finally {
      flushingRef.current = false;
      if (!ended && hasPending()) scheduleFlush(2500);
    }
  };

  const flushNow = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    await flushRef.current();
  }, []);

  /** Uma bipada ou toque na seta/campo: entra na fila e segue em ~300 ms. */
  const queueOp = useCallback((op: CountOp) => {
    pendingRef.current.push(op);
    scheduleFlush(300);
  }, [scheduleFlush]);

  const setRevision = useCallback((rev: CountRevision | null) => { revisionRef.current = rev; }, []);

  /** Envia o que falta e baixa o estado de agora (para quando a tela precisa estar em dia). */
  const syncNow = useCallback(async () => {
    await flushNow();
    const d = await opts.current.fetchDetail();
    if (opts.current.isEnded?.(d)) {
      reset();
      opts.current.onEnded();
      return;
    }
    revisionRef.current = opts.current.revisionOf(d);
    opts.current.onDetail(d);
  }, [flushNow, reset]);

  // Puxa o que os outros contaram
  useEffect(() => {
    if (!options.enabled) return;
    const t = setInterval(async () => {
      if (flushingRef.current || hasPending()) return;
      try {
        const d = await opts.current.fetchDetail();
        if (opts.current.isEnded?.(d)) {
          reset();
          opts.current.onEnded();
          return;
        }
        if (flushingRef.current || hasPending()) return;   // a pessoa bipou durante a leitura: não pisa
        const rev = opts.current.revisionOf(d);
        if (rev !== revisionRef.current) {
          revisionRef.current = rev;
          opts.current.onDetail(d);
        }
      } catch (e: any) {
        if (statusOf(e) === 404) {
          reset();
          opts.current.onEnded();
        }
        // sem rede: tenta de novo no próximo
      }
    }, options.pollMs ?? 4000);
    return () => clearInterval(t);
  }, [options.enabled, options.pollMs, hasPending, reset]);

  // Saiu da tela com bipadas por enviar: manda agora
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    void flushRef.current();
  }, []);

  return { queueOp, getPending, hasPending, scheduleFlush, flushNow, syncNow, setRevision, reset, syncError };
}
