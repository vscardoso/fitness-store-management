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

/** open = abre o PDF no visualizador do navegador (dali o compartilhar manda o PDF de verdade); share = manda o arquivo direto para outro app; save = baixa o arquivo para o celular (iPhone: download do Safari; tocar nele abre o PDF e o Compartilhar lista a impressora). */
export type PdfMode = 'open' | 'share' | 'save';

export interface PrintedPdf {
  filename: string;
  /** Link https do PDF (assinado, vale 24 horas). Nunca um endereço blob: do navegador. */
  url: string;
  /** Entrega o PDF (de novo). Chamar de dentro de um toque: o iPhone só abre janela e compartilhar assim. */
  deliver: (mode?: PdfMode) => Promise<PdfDelivery>;
}

/** PDF a partir do link https do servidor. */
/**
 * `openAs`: o que "Abrir o PDF" abre no navegador. 'link' = o link https (comprovante, relatórios: no WhatsApp o que vai é o arquivo
 * pelo botão Compartilhar). 'file' = o arquivo já baixado, num endereço blob: (ETIQUETAS: o visualizador do Safari compartilha um
 * blob: como arquivo PDF, que é o que o Label Expert e a impressora recebem; um link https só mandaria o endereço).
 */
export function pdfFromUrl(url: string, filename: string, title = 'Documento', openAs: 'link' | 'file' = 'link'): PrintedPdf {
  if (Platform.OS === 'web') {
    // O arquivo já é baixado AGORA, antes de qualquer toque: o iPhone só abre a folha de compartilhar se ela for chamada logo no
    // toque, sem esperar rede (esperar fazia o 1º toque falhar e exigia um 2º). Sem isso a pessoa salvava e mandava de novo.
    let cached: Blob | null = null;
    let objectUrl: string | null = null;
    fetch(url).then((r) => (r.ok ? r.blob() : null)).then((b) => { if (b) cached = b; }).catch(() => undefined);
    const deliver = async (mode: PdfMode = 'open'): Promise<PdfDelivery> => {
      if (mode === 'save') {
        // SALVAR: o servidor devolve o mesmo PDF como arquivo (?download=1, Content-Disposition: attachment). No iPhone o Safari baixa
        // para Arquivos e a impressora (Label Expert) abre esse arquivo; o Compartilhar do app não lista a impressora. Sem await antes.
        const a = document.createElement('a');
        a.href = url + (url.includes('?') ? '&' : '?') + 'download=1';
        a.download = filename;
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        a.remove();
        return 'opened';
      }
      if (mode === 'share') {
        try {
          if (!cached) cached = await (await fetch(url)).blob();
          const file = new File([cached], filename, { type: 'application/pdf' });
          const nav: any = navigator;
          if (nav.canShare && nav.canShare({ files: [file] }) && /iPhone|iPad|Android/i.test(nav.userAgent || '')) {
            await nav.share({ files: [file] });   // só o arquivo: com título ou texto o WhatsApp mandava também um link
            return 'shared';
          }
        } catch (e: any) {
          if (e?.name === 'AbortError') return 'cancelled';      // a pessoa fechou o compartilhar
          if (e?.name === 'NotAllowedError') return 'blocked';   // passou o tempo do toque: precisa de um toque novo
        }
      }
      // ABRIR: o PDF já baixado vai num endereço blob: do navegador, não no link https. O visualizador do Safari compartilha um
      // blob: como ARQUIVO (é assim que o Label Expert e a impressora recebem o PDF; era assim que funcionava até 10/11/2026); um
      // https vira só o LINK no compartilhar, que a impressora não lê. Sem await antes: o iPhone só abre a aba dentro do toque.
      // Se o arquivo ainda não terminou de baixar, abre o link https (melhor que nada).
      let target = url;
      if (openAs === 'file' && cached) {
        if (!objectUrl) {
          objectUrl = URL.createObjectURL(new Blob([cached], { type: 'application/pdf' }));
          const made = objectUrl;
          setTimeout(() => { URL.revokeObjectURL(made); if (objectUrl === made) objectUrl = null; }, 10 * 60_000);
        }
        target = objectUrl;
      }
      const win = window.open(target, '_blank');
      if (!win) {
        const a = document.createElement('a');
        a.href = target;
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

/** O PDF de uma rota do servidor como objeto (arquivo baixado uma vez e reaproveitado por todos os toques). */
export async function getServerPdf(path: string, options: ServerPdfOptions = {}): Promise<PrintedPdf> {
  const { url, filename } = await getServerPdfLink(path, options);
  return pdfFromUrl(url, filename, options.title);
}

/**
 * Entrega o PDF de uma rota do servidor num toque só (telas que não usam o <PdfActions />, como o relatório de vendas dentro de um
 * diálogo): folha NATIVA de compartilhar com o arquivo; se o iPhone pedir um toque novo, abre o PDF numa aba.
 */
export async function openServerPdf(path: string, options: ServerPdfOptions = {}): Promise<PdfDelivery> {
  const pdf = await getServerPdf(path, options);
  const result = await pdf.deliver('share');
  return result === 'blocked' ? pdf.deliver('open') : result;
}
