// ── Providers ─────────────────────────────────────────────────────────────────

export type PaymentProvider =
  | 'mercadopago'
  | 'cielo'
  | 'stone'
  | 'rede'
  | 'getnet'
  | 'pagseguro'
  | 'sumup'
  | 'manual';

export interface ProviderListResponse {
  terminal_providers: string[];
  pix_providers: string[];
}

// ── Terminais ─────────────────────────────────────────────────────────────────

export interface PDVTerminal {
  id: number;
  name: string;
  external_id: string;
  provider: PaymentProvider;
  provider_config: Record<string, unknown>;
  mp_pos_id: string | null;
  mp_qr_image: string | null;
  mp_qr_template_document: string | null;
  mp_terminal_id: string | null;
  operating_mode: string | null;
  is_configured: boolean;
  is_pdv_active: boolean;
  is_active: boolean;
  created_at: string;
}

export interface PDVTerminalCreate {
  name: string;
  external_id: string;
  provider?: PaymentProvider;
}

// ── Setup Store (provider-specific) ──────────────────────────────────────────

export interface MPStoreSetupRequest {
  mp_user_id: string;
  store_name: string;
  external_id: string;
  street_number: string;
  street_name: string;
  city_name: string;
  state_name: string;
  latitude?: number;
  longitude?: number;
}

export interface MPStoreSetupResponse {
  mp_store_id: string;
  mp_user_id: string;
  message: string;
}

export interface MPPOSSetupResponse {
  terminal_id: number;
  mp_pos_id: string | null;
  qr_image: string | null;
  message: string;
}

// ── Orders (pagamento via terminal) ──────────────────────────────────────────

export interface PDVOrderRequest {
  sale_id: number;
  terminal_id: number;
  total_amount: number;
  description?: string;
  expiration_time?: string;
  payment_type?: string;
  installments?: number;
  installments_cost?: string;
}

export interface PDVOrderResponse {
  sale_id: number;
  terminal_id: number | null;
  order_id: string | null;
  mp_order_id: string | null;       // backward compat
  mp_payment_id: string | null;
  status: string;
  external_reference: string | null;
  message: string;
}

export interface PDVOrderStatus {
  sale_id: number;
  order_id: string | null;
  mp_order_id: string | null;       // backward compat
  status: string;
  paid: boolean;
  message: string;
}

export interface PDVOrderActionResponse {
  sale_id: number;
  order_id: string | null;
  mp_order_id: string | null;       // backward compat
  status: string;
  refund_id: string | null;
  message: string;
}

// ── Confirmação manual ───────────────────────────────────────────────────────

export interface ManualConfirmResponse {
  sale_id: number;
  status: string;
  message: string;
}

// ── PIX QR Code ───────────────────────────────────────────────────────────────

export interface PixPaymentData {
  sale_id: number;
  payment_id: string;
  qr_code: string;
  qr_code_base64: string;
  expires_at: string | null;
  status: string;
  message: string;
}

export interface PixPaymentStatus {
  sale_id: number | null;
  payment_id: string;
  status: string;
  paid: boolean;
  message: string;
}

// ── PIX Start ────────────────────────────────────────────────────────────────

export interface PixStartRequest {
  customer_id?: number;
  payment_method?: string;
  items: Array<{
    product_id: number;
    variant_id?: number;
    quantity: number;
    unit_price: number;
    discount_amount?: number;
  }>;
  payments: Array<{
    payment_method: string;
    amount: number;
    installments?: number;
  }>;
  discount_amount?: number;
  tax_amount?: number;
  notes?: string;
  payer_email?: string;
}

export interface PixStartResponse {
  sale_id: number;
  sale_number: string;
  total_amount: number;
  payment_id: string;
  qr_code: string;
  qr_code_base64: string;
  expires_at: string | null;
  status: string;
  message: string;
}

// ── Compat aliases ───────────────────────────────────────────────────────────

export type PDVPaymentRequest = PDVOrderRequest;
export type PDVPaymentResponse = PDVOrderResponse;
export type PDVPaymentStatus = PDVOrderStatus;

// ── Dispositivos físicos (maquininhas) ───────────────────────────────────────

export interface MPDeviceTerminal {
  id: string;
  pos_id: string | null;
  store_id: string | null;
  external_pos_id: string | null;
  operating_mode: string;
}

export interface MPDeviceListResponse {
  terminals: MPDeviceTerminal[];
  total: number;
}

export interface ActivatePDVRequest {
  terminal_device_id?: string;
  mp_terminal_id?: string;  // backward compat
}

export interface ActivatePDVResponse {
  terminal_id: number;
  terminal_device_id: string | null;
  mp_terminal_id: string | null;
  operating_mode: string;
  message: string;
}
