import api from './api';
import { getAccessToken } from './storage';
import { API_CONFIG } from '@/constants/Config';
import type {
  PDVTerminal,
  PDVTerminalCreate,
  ProviderListResponse,
  MPStoreSetupRequest,
  MPStoreSetupResponse,
  MPPOSSetupResponse,
  MPDeviceListResponse,
  ActivatePDVRequest,
  ActivatePDVResponse,
  PDVOrderRequest,
  PDVOrderResponse,
  PDVOrderStatus,
  PDVOrderActionResponse,
  ManualConfirmResponse,
  PixPaymentData,
  PixPaymentStatus,
  PixStartRequest,
  PixStartResponse,
} from '@/types/pdv';

const BASE = '/pdv';

// ── Providers ────────────────────────────────────────────────────────────────

export async function listProviders(): Promise<ProviderListResponse> {
  const { data } = await api.get(`${BASE}/providers`);
  return data;
}

// ── Setup loja (provider-specific) ───────────────────────────────────────────

export async function setupMPStore(payload: MPStoreSetupRequest): Promise<MPStoreSetupResponse> {
  const { data } = await api.post(`${BASE}/store/setup`, payload);
  return data;
}

// ── Terminais ─────────────────────────────────────────────────────────────────

export async function listTerminals(): Promise<PDVTerminal[]> {
  const { data } = await api.get(`${BASE}/terminals`);
  return data;
}

export async function createTerminal(payload: PDVTerminalCreate): Promise<PDVTerminal> {
  const { data } = await api.post(`${BASE}/terminals`, payload);
  return data;
}

export async function setupTerminal(terminalId: number): Promise<MPPOSSetupResponse> {
  const { data } = await api.post(`${BASE}/terminals/${terminalId}/setup`);
  return data;
}

export async function deleteTerminal(terminalId: number): Promise<void> {
  await api.delete(`${BASE}/terminals/${terminalId}`);
}

// ── Dispositivos físicos (maquininhas) ───────────────────────────────────────

export async function listDevices(
  provider: string = 'mercadopago',
  storeId?: string,
  posId?: string,
): Promise<MPDeviceListResponse> {
  const params: Record<string, string> = { provider };
  if (storeId) params.store_id = storeId;
  if (posId) params.pos_id = posId;
  const { data } = await api.get(`${BASE}/devices`, { params });
  return data;
}

export async function activatePDVMode(
  terminalId: number,
  payload: ActivatePDVRequest,
): Promise<ActivatePDVResponse> {
  const { data } = await api.post(`${BASE}/terminals/${terminalId}/activate`, payload);
  return data;
}

// ── Orders (pagamento via terminal) ──────────────────────────────────────────

export async function createOrder(payload: PDVOrderRequest): Promise<PDVOrderResponse> {
  const { data } = await api.post(`${BASE}/orders`, payload);
  return data;
}

export interface TerminalStartRequest {
  terminal_id: number;
  payment_type: string;
  installments: number;
  items: Array<{ product_id: number; variant_id?: number; quantity: number; unit_price: number; discount_amount?: number }>;
  payments: Array<{ payment_method: string; amount: number; installments?: number }>;
  customer_id?: number;
  discount_amount?: number;
  tax_amount?: number;
  notes?: string;
}

export interface TerminalStartResponse {
  sale_id: number;
  sale_number: string;
  total_amount: number;
  terminal_id: number;
  terminal_name: string;
  provider: string;
  status: string;
  message: string;
}

export async function terminalStart(payload: TerminalStartRequest): Promise<TerminalStartResponse> {
  const { data } = await api.post(`${BASE}/terminal/start`, payload);
  return data;
}

export async function getOrderStatus(saleId: number): Promise<PDVOrderStatus> {
  const { data } = await api.get(`${BASE}/orders/${saleId}/status`, {
    headers: { 'X-Skip-Loading': 'true' },
  });
  return data;
}

export async function cancelOrder(saleId: number): Promise<PDVOrderActionResponse> {
  const { data } = await api.post(`${BASE}/orders/${saleId}/cancel`);
  return data;
}

export async function refundOrder(saleId: number): Promise<PDVOrderActionResponse> {
  const { data } = await api.post(`${BASE}/orders/${saleId}/refund`);
  return data;
}

// ── Confirmação manual ───────────────────────────────────────────────────────

export async function confirmManualPayment(saleId: number): Promise<ManualConfirmResponse> {
  const { data } = await api.post(`${BASE}/orders/${saleId}/confirm`);
  return data;
}

// ── PIX QR Code ───────────────────────────────────────────────────────────────

export async function generatePixPayment(
  saleId: number,
  payerEmail?: string,
): Promise<PixPaymentData> {
  const params: Record<string, string> = {};
  if (payerEmail) params.payer_email = payerEmail;
  const { data } = await api.post(`${BASE}/pix/${saleId}`, null, { params });
  return data;
}

export async function getPixStatus(paymentId: string): Promise<PixPaymentStatus> {
  const { data } = await api.get(`${BASE}/pix/${paymentId}/status`, {
    headers: { 'X-Skip-Loading': 'true' },
  });
  return data;
}

export async function pixStart(payload: PixStartRequest): Promise<PixStartResponse> {
  const { data } = await api.post(`${BASE}/pix/start`, payload);
  return data;
}

export async function refundPixPayment(
  paymentId: string,
): Promise<{ payment_id: string; refund_id: string; sale_id: number; status: string; message: string }> {
  const { data } = await api.post(`${BASE}/pix/${paymentId}/refund`);
  return data;
}

/**
 * SSE stream para confirmação instantânea do PIX.
 * @returns AbortController para fechar o stream (chamar no cleanup do useEffect)
 */
export function subscribePixStatus(
  paymentId: string,
  onConfirmed: () => void,
  onExpiredOrCancelled: () => void,
): AbortController {
  const controller = new AbortController();

  (async () => {
    try {
      const token = await getAccessToken();
      const url = `${API_CONFIG.BASE_URL}/pdv/pix/${paymentId}/events`;

      const response = await fetch(url, {
        headers: {
          Accept: 'text/event-stream',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: controller.signal,
      });

      if (!response.body) return;

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.paid === true) {
              onConfirmed();
              return;
            } else if (data.status === 'expired' || data.status === 'cancelled') {
              onExpiredOrCancelled();
              return;
            }
          } catch {
            // linha malformada — ignora
          }
        }
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        console.warn('[PIX SSE] erro no stream:', err?.message);
      }
    }
  })();

  return controller;
}

// ── Compat aliases ───────────────────────────────────────────────────────────

// ── Pagamentos Pendentes ──────────────────────────────────────────────────────

export async function getPendingSales(): Promise<import('@/types/pdv').PendingSale[]> {
  const { data } = await api.get(`${BASE}/pending-sales`, {
    headers: { 'X-Skip-Loading': 'true' },
  });
  return data;
}

/** @deprecated Use setupTerminal */
export const setupTerminalMP = setupTerminal;
/** @deprecated Use listDevices */
export const listMPTerminals = (storeId?: string, posId?: string) =>
  listDevices('mercadopago', storeId, posId);
export const createPDVPayment = createOrder;
export const checkPDVPaymentStatus = getOrderStatus;
