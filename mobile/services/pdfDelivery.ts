/**
 * Entrega de PDF: UM jeito só, usado por etiquetas, comprovante, brinde, relatórios e estoque.
 *
 * O servidor devolve o PDF como link https assinado (`?link=true`, ver backend/app/services/pdf_delivery.py) e o app abre ou
 * compartilha ESSE link. Abrir um endereço blob: do navegador e compartilhar mandava para o WhatsApp e para a impressora o TEXTO
 * "blob:https://app..." (só existe no aparelho); com o link https o visualizador do iPhone compartilha o arquivo PDF de verdade.
 * Não copie este código para outra tela: chame `openServerPdf` (PDF de uma rota do servidor) ou `pdfFromUrl` (já tenho o link).
 */
import { Platform } from 'react-native';
import * as Sharing from 'expo-sharing';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import api from './api';

/** O que aconteceu ao entregar o PDF: compartilhado, aberto/baixado, a pessoa fechou, ou o iPhone exigiu um toque novo. */
export type PdfDelivery = 'shared' | 'opened' | 'cancelled' | 'blocked';

/** open = abre o PDF no visualizador do navegador (dali o compartilhar manda o PDF de verdade); share = manda o arquivo direto para outro app. */
export type PdfMode = 'open' | 'share';

export interface PrintedPdf {
  filename: string;
  /** Link https do PDF (assinado, vale 24 horas). Nunca um endereço blob: do navegador. */
  url: string;
  /** Entrega o PDF (de novo). Chamar de dentro de um toque: o iPhone só abre janela e compartilhar assim. */
  deliver: (mode?: PdfMode) => Promise<PdfDelivery>;
}

/** PDF a partir do link https do servidor. */
export function pdfFromUrl(url: string, filename: string, title = 'Documento'): PrintedPdf {
  if (Platform.OS === 'web') {
    let cached: Blob | null = null;   // o 2º toque em "compartilhar" já usa o arquivo baixado (o iPhone exige um toque novo)
    const deliver = async (mode: PdfMode = 'open'): Promise<PdfDelivery> => {
      if (mode === 'share') {
        try {
          if (!cached) cached = await (await fetch(url)).blob();
          const file = new File([cached], filename, { type: 'application/pdf' });
          const nav: any = navigator;
          if (nav.canShare && nav.canShare({ files: [file] }) && /iPhone|iPad|Android/i.test(nav.userAgent || '')) {
            await nav.share({ files: [file], title });
            return 'shared';
          }
        } catch (e: any) {
          if (e?.name === 'AbortError') return 'cancelled';      // a pessoa fechou o compartilhar
          if (e?.name === 'NotAllowedError') return 'blocked';   // passou o tempo do toque: precisa de um toque novo
        }
      }
      const win = window.open(url, '_blank');
      if (!win) {
        const a = document.createElement('a');
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      return 'opened';
    };
    return { filename, url, deliver };
  }

  const deliver = async (_mode: PdfMode = 'open'): Promise<PdfDelivery> => {
    const path = `${LegacyFileSystem.cacheDirectory}${filename}`;
    await LegacyFileSystem.downloadAsync(url, path);
    if (!(await Sharing.isAvailableAsync())) throw new Error('Compartilhamento não disponível neste aparelho.');
    await Sharing.shareAsync(path, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: title });
    return 'shared';
  };
  return { filename, url, deliver };
}

export interface ServerPdfOptions {
  /** Parâmetros da rota (período, tamanho do papel, troco...). `link` já vai sozinho. */
  params?: Record<string, string | number | boolean | undefined | null>;
  /** Texto do carregamento enquanto o servidor gera o PDF */
  message?: string;
  /** Nome do documento na folha de compartilhar do celular */
  title?: string;
}

/** Pede o link https de um PDF a uma rota do servidor (a rota aceita `link=true`). */
export async function getServerPdfLink(path: string, options: ServerPdfOptions = {}): Promise<{ url: string; filename: string }> {
  const params: Record<string, unknown> = { link: true };
  for (const [k, v] of Object.entries(options.params ?? {})) if (v !== undefined && v !== null) params[k] = v;
  const { data } = await api.get<{ url: string; filename: string }>(path, {
    params,
    headers: { 'X-Loading-Message': options.message ?? 'Gerando PDF...' },
  });
  return data;
}

/**
 * Abre ou compartilha o PDF de uma rota do servidor. Chamar direto do toque do botão: no navegador a aba é aberta JÁ, dentro do
 * toque (depois da espera do servidor o navegador bloquearia a janela) e recebe o link quando ele chega.
 */
export async function openServerPdf(path: string, options: ServerPdfOptions = {}): Promise<PdfDelivery> {
  const win = Platform.OS === 'web' && typeof window !== 'undefined' ? window.open('', '_blank') : null;
  try {
    const { url, filename } = await getServerPdfLink(path, options);
    if (win) {
      win.location.href = url;
      return 'opened';
    }
    return await pdfFromUrl(url, filename, options.title).deliver('open');
  } catch (e) {
    try { win?.close(); } catch { /* aba já fechada */ }
    throw e;
  }
}
