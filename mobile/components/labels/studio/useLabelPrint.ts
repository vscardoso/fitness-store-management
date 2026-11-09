/**
 * Toda a lógica da tela de etiquetas num lugar só (a tela em si só desenha).
 *
 * Fluxo, sempre nesta ordem:
 *   edit       a pessoa escolhe peças, medida e papel
 *   generated  o PDF foi gerado; falta ela dizer se imprimiu ("Já imprimi")
 *   done       confirmou: o servidor gravou o que saiu, tirou da fila e andou a folha ("Desfazer" disponível)
 * Gerar o PDF sozinho não grava nada. Qualquer mudança em peça, medida ou papel depois de gerar volta para `edit`,
 * porque o PDF que a pessoa tem já não corresponde ao que está na tela.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  cmText, customSticker, DEFAULT_STICKER, parseCm, printTagLabels, STICKER_SIZES, stickersPerSheet, stickersPerThermalSheet,
  type StickerSize, type TagLabelLayout,
} from '@/services/labelService';
import { addToQueue, confirmPrint, getPrintState, undoPrint } from '@/services/labelQueueService';

export interface StickerItem {
  variantId: number;
  productName: string;
  color?: string | null;
  size?: string | null;
  price: number;
  code?: string | null; // '#101-1' (ou '#0123' nas peças antigas); vazio = o servidor cria ao gerar o PDF
  stock: number;
}

export interface UseLabelPrintOptions {
  items: StickerItem[];
  /** Quantidade inicial por peça (padrão: o estoque, ou 1). */
  initialQty?: Record<number, number>;
  /** As peças vieram da fila de impressão: confirmar tira da fila. */
  fromQueue?: boolean;
  /** Entrada de origem (impressão direta da entrada), para contar o que já saiu dela. */
  entryId?: number | null;
  onGenerated?: () => void;
  onPrinted?: () => void;
}

export type Step = 'edit' | 'generated' | 'done';
export type Busy = 'generate' | 'confirm' | 'undo' | 'queue' | null;

export const MAX_PER_ITEM = 200;
const SIZE_KEY = '@provador:etiqueta_medida';   // última medida usada neste aparelho
const PAPER_KEY = '@provador:etiqueta_papel';    // último papel usado neste aparelho

export function sizeFrom(w: number, h: number): StickerSize {
  return STICKER_SIZES.find((s) => s.widthMm === w && s.heightMm === h) ?? customSticker(w, h);
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function useLabelPrint({ items, initialQty, fromQueue, entryId, onGenerated, onPrinted }: UseLabelPrintOptions) {
  const queryClient = useQueryClient();
  const [size, setSize] = useState<StickerSize>(DEFAULT_STICKER);
  const [paper, setPaper] = useState<TagLabelLayout>('a4');
  const [qty, setQty] = useState<Record<number, number>>({});
  const [start, setStart] = useState(1);
  const [step, setStep] = useState<Step>('edit');
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [queuedCount, setQueuedCount] = useState(0);
  const [snapshot, setSnapshot] = useState<{ layout: TagLabelLayout; start: number; items: { variantId: number; quantity: number }[] } | null>(null);

  // ── peças: as novas entram com a quantidade inicial; as que já tinham número mantêm o que foi digitado
  useEffect(() => {
    setQty((prev) => {
      const next = { ...prev };
      for (const it of items) {
        if (next[it.variantId] == null) next[it.variantId] = initialQty?.[it.variantId] ?? (it.stock > 0 ? Math.min(MAX_PER_ITEM, it.stock) : 1);
      }
      return next;
    });
  }, [items, initialQty]);

  // ── medida e papel lembrados neste aparelho
  useEffect(() => {
    AsyncStorage.getItem(SIZE_KEY)
      .then((raw) => {
        const v = raw ? JSON.parse(raw) : null;
        if (v && parseCm(cmText(v.w)) === v.w && parseCm(cmText(v.h)) === v.h) setSize(sizeFrom(v.w, v.h));
      })
      .catch(() => {});
    AsyncStorage.getItem(PAPER_KEY)
      .then((raw) => { if (raw === 'a4' || raw === 'roll' || raw === 'sheet') setPaper(raw); })
      .catch(() => {});
  }, []);

  const chooseSize = useCallback((s: StickerSize) => {
    setSize(s);
    AsyncStorage.setItem(SIZE_KEY, JSON.stringify({ w: s.widthMm, h: s.heightMm })).catch(() => {});
  }, []);
  const choosePaper = useCallback((p: TagLabelLayout) => {
    setPaper(p);
    AsyncStorage.setItem(PAPER_KEY, p).catch(() => {});
  }, []);

  const setQuantity = useCallback((id: number, v: number) => setQty((p) => ({ ...p, [id]: Math.max(0, Math.min(MAX_PER_ITEM, v)) })), []);
  const fill = useCallback((fn: (it: StickerItem) => number) => {
    setQty(Object.fromEntries(items.map((it) => [it.variantId, Math.max(0, Math.min(MAX_PER_ITEM, fn(it)))])));
  }, [items]);

  // ── contas da folha
  const perA4 = stickersPerSheet(size.widthMm, size.heightMm);
  const perThermal = stickersPerThermalSheet(size.widthMm, size.heightMm);
  const perSheet = paper === 'sheet' ? Math.max(1, perThermal) : paper === 'a4' ? perA4 : 1;
  const chosen = useMemo(() => items.map((it) => ({ it, q: qty[it.variantId] ?? 0 })).filter((x) => x.q > 0), [items, qty]);
  const total = chosen.reduce((sum, x) => sum + x.q, 0);
  const sheets = paper === 'roll' ? total : total > 0 ? Math.ceil((total + start - 1) / perSheet) : 0;
  const leftover = paper === 'roll' ? 0 : (start - 1 + total) % perSheet;   // quantas posições da última folha ficam usadas

  // ── onde a folha parou: vem do SERVIDOR (última impressão confirmada), vale em qualquer aparelho
  const stateQ = useQuery({
    queryKey: ['label-print-state', paper, size.widthMm, size.heightMm],
    queryFn: () => getPrintState(paper, size.widthMm, size.heightMm),
  });
  const serverNext = paper === 'roll' ? 1 : stateQ.data?.next_position ?? 1;
  const usedCells = paper === 'roll' ? [] : stateQ.data?.sheet ?? [];
  const lastJob = stateQ.data?.last_job ?? null;
  useEffect(() => { setStart(serverNext); }, [serverNext, paper, size.widthMm, size.heightMm]);

  // ── mudou algo depois de gerar: o PDF que a pessoa tem já não vale
  const signature = `${paper}|${size.widthMm}x${size.heightMm}|${start}|${chosen.map((x) => `${x.it.variantId}:${x.q}`).join(',')}`;
  useEffect(() => { setStep((s) => (s === 'generated' ? 'edit' : s)); }, [signature]);

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['label-print-state'] });
    await queryClient.invalidateQueries({ queryKey: ['label-queue'] });
    await queryClient.invalidateQueries({ queryKey: ['label-progress'] });
  }, [queryClient]);

  const run = useCallback(async (kind: Exclude<Busy, null>, failure: string, job: () => Promise<void>) => {
    if (busy) return;
    setBusy(kind);
    setError(null);
    try {
      await job();
    } catch (e: any) {
      setError(e?.message || failure);
    } finally {
      setBusy(null);
    }
  }, [busy]);

  const lines = useCallback(() => chosen.map((x) => ({ variantId: x.it.variantId, quantity: x.q })), [chosen]);

  const generate = useCallback(() => {
    if (total === 0) return;
    return run('generate', 'Não foi possível gerar o PDF. Tente de novo.', async () => {
      const layout = paper;
      const from = layout === 'roll' ? 1 : start;
      await printTagLabels(lines(), { layout, startPosition: from, widthMm: size.widthMm, heightMm: size.heightMm });
      setSnapshot({ layout, start: from, items: lines() });
      setNotice(null);
      setStep('generated');
      onGenerated?.();
    });
  }, [total, run, paper, start, lines, size, onGenerated]);

  const confirm = useCallback(() => {
    if (!snapshot) return;
    return run('confirm', 'Não foi possível marcar como impresso. Tente de novo.', async () => {
      const r = await confirmPrint({
        layout: snapshot.layout, widthMm: size.widthMm, heightMm: size.heightMm, startPosition: snapshot.start,
        items: snapshot.items, fromQueue: !!fromQueue, entryId,
      });
      setNotice(r.next_position > 1 && snapshot.layout !== 'roll'
        ? `Marcado como impresso. A próxima impressão começa na posição ${r.next_position} da folha.`
        : 'Marcado como impresso.');
      setSnapshot(null);
      setStep('done');
      await refresh();
      onPrinted?.();
    });
  }, [snapshot, run, size, fromQueue, entryId, refresh, onPrinted]);

  const undo = useCallback(() => {
    if (!lastJob) return;
    return run('undo', 'Não foi possível desfazer.', async () => {
      const r = await undoPrint(lastJob.id);
      setNotice(`Desfeito. ${plural(r.returned, 'etiqueta voltou', 'etiquetas voltaram')} para a fila.`);
      setStep('edit');
      await refresh();
      onPrinted?.();
    });
  }, [lastJob, run, refresh, onPrinted]);

  const sendToQueue = useCallback(() => {
    if (total === 0) return;
    return run('queue', 'Não foi possível pôr na fila.', async () => {
      const r = await addToQueue(lines());
      setQueuedCount(r.added);
      setNotice(`${plural(r.added, 'etiqueta colocada', 'etiquetas colocadas')} na fila de impressão.`);
      await queryClient.invalidateQueries({ queryKey: ['label-queue'] });
    });
  }, [total, run, lines, queryClient]);

  const backToEdit = useCallback(() => { setStep('edit'); setSnapshot(null); setNotice(null); }, []);
  const newSheet = useCallback(() => setStart(1), []);

  return {
    // escolhas
    size, chooseSize, paper, choosePaper, qty, setQuantity, fill,
    // folha
    start, setStart, newSheet, perA4, perThermal, perSheet, sheets, leftover, usedCells, lastJob,
    // peças escolhidas
    chosen, total,
    // fluxo
    step, busy, error, notice, queuedCount, canQueue: !fromQueue && !entryId,
    generate, confirm, undo, sendToQueue, backToEdit,
  };
}

export type LabelPrint = ReturnType<typeof useLabelPrint>;
