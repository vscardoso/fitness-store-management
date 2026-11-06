/**
 * Conexão do WhatsApp da loja ao Provador pelo Embedded Signup da Meta (inclusive coexistência: o mesmo número
 * continua no app WhatsApp Business do celular). Servidor: `app/api/v1/endpoints/whatsapp_connect.py`.
 */
import api from './api';

export interface WaHistorySync {
  status: string | null;
  requested_at: string | null;
  phase: number | null;
  progress: number | null;
}

export interface WaConnectedNumber {
  id: number;
  phone_number_id: string;
  waba_id: string | null;
  display_phone_number: string | null;
  verified_name: string | null;
  is_coexistence: boolean;
  has_business_token: boolean;
  connected_at: string | null;
  connection_status: string;
  connection_event: string | null;
  connection_event_at: string | null;
  connection_detail: string | null;
  warning: string | null;
  contacts_sync_requested_at: string | null;
  history_sync: WaHistorySync;
}

export interface WaConnectStatus {
  configured: boolean;
  app_id: string | null;
  config_id: string | null;
  connected: boolean;
  numbers: WaConnectedNumber[];
}

export const getWhatsappConnectStatus = async (): Promise<WaConnectStatus> =>
  (await api.get<WaConnectStatus>('/whatsapp/connect/status', { headers: { 'X-Skip-Loading': 'true' } })).data;

export const finishWhatsappEmbeddedSignup = async (body: {
  code: string;
  phone_number_id: string;
  waba_id: string;
  business_id?: string | null;
  coexistence: boolean;
}): Promise<WaConnectStatus> =>
  (await api.post('/whatsapp/connect/embedded-signup', body, {
    headers: { 'X-Loading-Message': 'Conectando o WhatsApp...' },
  })).data;
