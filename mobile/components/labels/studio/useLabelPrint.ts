/**
 * Toda a lógica da tela de etiquetas num lugar só (a tela em si só desenha).
 *
 * Fluxo:
 *   edit   a pessoa escolhe peças, medida e papel e toca em "Gerar PDF"
 *   done   o PDF foi gerado E a impressão já foi salva (tirou da fila e andou a folha) numa chamada só do servidor:
 *          gerar = imprimir. Não existe passo "Já imprimi". "Não saiu? Desfazer" devolve as etiquetas para a fila.
 * Se a fila mudou (outra pessoa imprimiu ou tirou a peça) o servidor não grava nada e a tela atualiza.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  cmText, customSticker, DEFAULT_STICKER, parseCm, printLabelsSaved, STICKER_SIZES, stickersPerSheet, stickersPerThermalSheet,
  type PdfDelivery, type PdfMode, type PrintedPdf, type StickerSize, type TagLabelLayout,
} from '@/services/labelService';
import { addToQueue, getPrintState, undoPrint } from '@/services/labelQueueService';

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

export type Step = 'edit' | 'done';
export type Busy = 'generate' | 'undo' | 'queue' | 'share' | null;

export const MAX_PER_ITEM = 200;
const SIZE_KEY = '@provador:etiqueta_medida';   // última medida usada neste aparelho
const PAPER_KEY = '@provador:etiqueta_papel';    // último papel usado neste aparelho
const LEGACY_PENDING_KEY = '@provador:etiqueta_pendente';   // do fluxo antigo (Já imprimi): só é apagado

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
  const [pdf, setPdf] = useState<PrintedPdf | null>(null);
  const [delivery, setDelivery] = useState<PdfDelivery | null>(null);
  const [printedTotal, setPrintedTotal] = useState(0);

  // sobra do fluxo antigo (Já imprimi): apaga para nunca mais aparecer aviso de PDF pendente
  useEffect(() => { AsyncStorage.removeItem(LEGACY_PENDING_KEY).catch(() => {}); }, []);

  // ── peças: as novas entram com a quantidade inicial; as que já tinham número mantêm o que foi digitado
  useEffect(() => {
    setQty((prev) => {
      const next = { ...prev };
      for (const it of items) {
        if (next[it.variantId] == null) next[it.variantId] = initialQty?.[it.variantId] ?? (it.stock > 0 ? Math.min(MAX_PER_ITEM, it.stock) : 1);
        // na fila a tela acompanha a fila (outra pessoa pode ter imprimido ou tirado): nunca pede mais do que ela tem
        else if (fromQueue && initialQty?.[it.variantId] != null) next[it.variantId] = Math.min(next[it.variantId], initialQty[it.variantId]);
      }
      return next;
    });
  }, [items, initialQty, fromQueue]);

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

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['label-print-state'] });
    await queryClient.invalidateQueries({ queryKey: ['label-queue'] });
    await queryClient.invalidateQueries({ queryKey: ['label-progress'] });
    await queryClient.invalidateQueries({ queryKey: ['label-recent-prints'] });
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
      let printed: PrintedPdf;
      try {
        printed = await printLabelsSaved({
          items: lines(), layout: paper, startPosition: paper === 'roll' ? 1 : start, widthMm: size.widthMm, heightMm: size.heightMm,
          fromQueue: !!fromQueue, entryId: entryId ?? null,
        });
      } catch (e) {
        await refresh();   // a fila pode ter mudado: mostra o que há de verdade agora
        throw e;
      }
      // a impressão já está salva no servidor (tirou da fila e andou a folha)
      setPdf(printed);
      setDelivery(null);
      setPrintedTotal(total);
      setNotice(null);
      setStep('done');
      await refresh();
      onGenerated?.();
      onPrinted?.();
      setDelivery(await printed.deliver('open').catch(() => 'blocked' as PdfDelivery));
    });
  }, [total, run, paper, start, lines, size, fromQueue, entryId, refresh, onGenerated, onPrinted]);

  // abre o PDF de novo (compartilhar ou imprimir) sem salvar nada outra vez; chamado por um toque
  const reshare = useCallback(async (mode: PdfMode = 'open') => {
    if (!pdf || busy) return;
    setBusy('share');
    setError(null);
    try {
      setDelivery(await pdf.deliver(mode));
    } catch (e: any) {
      setError(e?.message || 'Não foi possível abrir o PDF. Tente de novo.');
    } finally {
      setBusy(null);
    }
  }, [pdf, busy]);

  const undo = useCallback(() => {
    if (!lastJob) return;
    return run('undo', 'Não foi possível desfazer.', async () => {
      const r = await undoPrint(lastJob.id);
      setNotice(`Desfeito. ${plural(r.returned, 'etiqueta voltou', 'etiquetas voltaram')} para a fila.`);
      setPdf(null);
      setStep('edit');
      await refresh();
      onPrinted?.();
    });
  }, [lastJob, run, refresh, onPrinted]);

  const sendToQueue = useCallback(() => {
    if (total === 0) return;
    return run('queue', 'Não foi possível pôr na fila.', async () => {
      const r = await addToQueue(lines(), entryId ?? null);
      setQueuedCount(r.added);
      setNotice(`${plural(r.added, 'etiqueta colocada', 'etiquetas colocadas')} na fila de impressão.`);
      await queryClient.invalidateQueries({ queryKey: ['label-queue'] });
    });
  }, [total, run, lines, entryId, queryClient]);

  const backToEdit = useCallback(() => { setStep('edit'); setPdf(null); setDelivery(null); setNotice(null); setError(null); }, []);
  const newSheet = useCallback(() => setStart(1), []);

  return {
    // escolhas
    size, chooseSize, paper, choosePaper, qty, setQuantity, fill,
    // folha
    start, setStart, newSheet, perA4, perThermal, perSheet, sheets, leftover, usedCells, lastJob,
    // peças escolhidas
    chosen, total,
    // fluxo
    step, busy, error, notice, queuedCount, canQueue: !fromQueue, printedTotal, delivery, hasPdf: !!pdf,
    generate, reshare, undo, sendToQueue, backToEdit,
  };
}

export type LabelPrint = ReturnType<typeof useLabelPrint>;
