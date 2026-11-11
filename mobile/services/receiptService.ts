/**
 * Comprovante da venda para a cliente: texto e link do WhatsApp e PDF (A6) gerado no servidor.
 * O servidor monta tudo (nunca sai custo nem lucro). Web: compartilhar do aparelho, senão abre ou baixa.
 */
import api from './api';
import { getServerPdf, type PrintedPdf } from './pdfDelivery';

/** O PDF sai sempre em A6 (folha pequena, boa para mandar e para abrir no celular): ninguém escolhe papel. */
const PDF_SIZE = 'a6';

export interface ReceiptInfo {
  text: string;
  whatsapp_url: string | null;
  receipt: {
    sale_number: string; customer: string | null; customer_phone: string | null; total: number;
    /** Brindes dados junto com a venda (R$ 0,00 para a cliente) */
    gifts?: { name: string; variant: string | null; quantity: number }[];
  };
  /** Número oficial da loja (o fixo) ligado à Cloud API da Meta; só com ele o envio sai pela loja */
  store_whatsapp: { connected: boolean; number: string | null };
}

export interface StoreSendResult {
  mode: 'pdf' | 'template';
  store_number: string | null;
  customer: string;
}

const q = (change?: number) => (change && change > 0 ? `?change=${change}` : '');

export async function getReceipt(saleId: number, change?: number): Promise<ReceiptInfo> {
  const { data } = await api.get<ReceiptInfo>(`/sales/${saleId}/receipt${q(change)}`, { headers: { 'X-Skip-Loading': 'true' } });
  return data;
}

/** Manda o comprovante pelo WhatsApp OFICIAL da loja (nunca pelo WhatsApp pessoal). Erros vêm em frase pronta do servidor. */
export async function sendReceiptViaStoreWhatsapp(saleId: number, change?: number): Promise<StoreSendResult> {
  const { data } = await api.post<StoreSendResult>(`/sales/${saleId}/receipt/send-whatsapp${q(change)}`, null, {
    headers: { 'X-Loading-Message': 'Enviando pelo WhatsApp da loja...' },
  });
  return data;
}

/** Link do WhatsApp: direto na cliente quando há telefone válido; senão abre o WhatsApp para escolher o contato. */
export function receiptWhatsappUrl(info: ReceiptInfo): string {
  return info.whatsapp_url || `https://wa.me/?text=${encodeURIComponent(info.text)}`;
}

/** Baixa um PDF do servidor e entrega à pessoa: web = compartilhar do aparelho, senão abre ou baixa; celular = compartilhar. */
/** Comprovante da venda em PDF (objeto para o <PdfActions />). */
export function getReceiptPdf(saleId: number, saleNumber: string, change?: number): Promise<PrintedPdf> {
  return getServerPdf(`/sales/${saleId}/receipt/pdf`, {
    params: { size: PDF_SIZE, change: change && change > 0 ? change : undefined }, message: 'Gerando comprovante...', title: `Comprovante ${saleNumber}`,
  });
}
