/**
 * Estado e ações de "mandar este PDF" (compartilhar o arquivo para a impressora/WhatsApp ou abrir numa aba): UM hook para toda tela
 * que gera PDF. Guarda o PDF já pronto (objeto reaproveitado: o arquivo é baixado uma vez e o toque seguinte não espera rede) e o
 * estado "toque de novo" que o iPhone exige quando o compartilhar demora. Não copie esta lógica para a tela: use este hook ou
 * o <PdfActions /> (components/ui/PdfActions.tsx).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PdfDelivery, PdfMode, PrintedPdf } from '@/services/pdfDelivery';
import { parseApiError } from '@/utils/apiError';

export interface UsePdfDeliveryOptions {
  /** PDF que já existe (ex.: acabou de ser gerado). */
  pdf?: PrintedPdf | null;
  /** Como pedir o PDF ao servidor quando ele ainda não existe. */
  getPdf?: () => Promise<PrintedPdf>;
  /** Muda quando o conteúdo do PDF muda (período, fornecedor...): o PDF guardado deixa de valer. */
  cacheKey?: string;
  /** Pede o PDF logo que a tela abre, para o 1º toque já compartilhar sem esperar. */
  prefetch?: boolean;
}

export function usePdfDelivery({ pdf, getPdf, cacheKey = 'default', prefetch = false }: UsePdfDeliveryOptions) {
  const cache = useRef<{ key: string; ready: Promise<PrintedPdf> } | null>(null);
  const readyRef = useRef<{ key: string; pdf: PrintedPdf } | null>(null);
  const getRef = useRef(getPdf);
  getRef.current = getPdf;
  const [busy, setBusy] = useState<PdfMode | null>(null);
  const [delivery, setDelivery] = useState<PdfDelivery | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resolve = useCallback((): Promise<PrintedPdf> => {
    if (pdf) return Promise.resolve(pdf);
    if (!getRef.current) return Promise.reject(new Error('PDF indisponível.'));
    if (!cache.current || cache.current.key !== cacheKey) {
      const key = cacheKey;
      const ready = getRef.current();
      ready.then((p) => { readyRef.current = { key, pdf: p }; }, () => undefined);   // guarda o PDF pronto para o toque seguinte
      cache.current = { key, ready };
    }
    return cache.current.ready;
  }, [pdf, cacheKey]);

  // conteúdo mudou: esquece o toque pendente
  useEffect(() => { setDelivery(null); setError(null); }, [pdf, cacheKey]);

  useEffect(() => {
    if (prefetch && !pdf && getRef.current) resolve().catch(() => { cache.current = null; });
  }, [prefetch, pdf, cacheKey, resolve]);

  /** mode 'share' = compartilha o ARQUIVO (impressora/WhatsApp); 'open' = abre o PDF numa aba. */
  const run = useCallback(async (mode: PdfMode = 'share'): Promise<PdfDelivery | null> => {
    if (busy) return null;
    setBusy(mode);
    setError(null);
    try {
      // PDF já pronto: entrega DIRETO, sem nenhum `await` antes. O iPhone só abre a aba e a folha de compartilhar se isso acontecer
      // dentro do próprio toque; esperar antes fazia o sistema bloquear a abertura e cair na tela preta do app instalado (11/11/2026).
      const hit = readyRef.current && readyRef.current.key === cacheKey ? readyRef.current.pdf : null;
      const ready = pdf ?? hit ?? (await resolve());
      const result = await ready.deliver(mode);
      setDelivery(result);
      return result;
    } catch (e: any) {
      cache.current = null;   // pede de novo no próximo toque (o link pode ter vencido)
      readyRef.current = null;
      setError(parseApiError(e) || e?.message || 'Não foi possível gerar o PDF. Tente de novo.');
      return null;
    } finally {
      setBusy(null);
    }
  }, [busy, resolve, pdf, cacheKey]);

  return {
    busy,
    delivery,
    error,
    /** o iPhone pediu um toque novo: o PDF já está pronto e o próximo toque compartilha na hora */
    needsAnotherTap: delivery === 'blocked',
    share: () => run('share'),
    open: () => run('open'),
  };
}
