export type ConnectionType = 'usb' | 'ethernet' | 'serial';
export type PrinterProtocol = 'zpl' | 'cpcl' | 'esc_pos';
export type PrintJobStatus = 'queued' | 'printing' | 'done' | 'error' | 'cancelled';

export interface LabelPrinter {
  id: number;
  name: string;
  model: string;
  connection_type: ConnectionType;
  protocol: PrinterProtocol;
  ip_address: string | null;
  port: number;
  serial_port: string | null;
  baud_rate: number;
  usb_device: string | null;
  label_width_mm: number;
  label_height_mm: number;
  dpi: number;
  is_default: boolean;
  is_active: boolean;
  tenant_id: number | null;
  created_at: string;
}

export interface LabelPrinterCreate {
  name: string;
  model?: string;
  connection_type: ConnectionType;
  protocol?: PrinterProtocol;
  ip_address?: string;
  port?: number;
  serial_port?: string;
  baud_rate?: number;
  usb_device?: string;
  label_width_mm?: number;
  label_height_mm?: number;
  dpi?: number;
  is_default?: boolean;
}

export interface LabelPrinterUpdate {
  name?: string;
  connection_type?: ConnectionType;
  ip_address?: string;
  port?: number;
  serial_port?: string;
  baud_rate?: number;
  usb_device?: string;
  label_width_mm?: number;
  label_height_mm?: number;
  dpi?: number;
  is_default?: boolean;
  is_active?: boolean;
}

export interface LabelPrinterListResponse {
  items: LabelPrinter[];
  total: number;
}

export interface PrinterTestResponse {
  success: boolean;
  message: string;
  printer_id: number;
}

export interface PrintJobCreate {
  printer_id: number;
  product_id?: number;
  variant_id?: number;
  quantity: number;
  show_price?: boolean;
  show_sku?: boolean;
}

export interface PrintJobBatchItem {
  variant_id: number;
  quantity: number;
  show_price?: boolean;
  show_sku?: boolean;
}

export interface PrintJobBatchCreate {
  printer_id: number;
  product_id: number;
  items: PrintJobBatchItem[];
}

export interface PrintJob {
  id: number;
  printer_id: number;
  product_id: number | null;
  variant_id: number | null;
  quantity: number;
  status: PrintJobStatus;
  error_message: string | null;
  product_name: string | null;
  sku: string | null;
  variant_label: string | null;
  price: string | null;
  show_price: boolean;
  show_sku: boolean;
  created_at: string;
}

export interface PrintJobListResponse {
  items: PrintJob[];
  total: number;
}

export interface ZplPreviewResponse {
  zpl: string;
  width_dots: number;
  height_dots: number;
  label_width_mm: number;
  label_height_mm: number;
  dpi: number;
}

// Representa uma variante com quantidade para o batch de impressão
export interface PrintVariantItem {
  variant_id: number;
  sku: string;
  color: string | null;
  size: string | null;
  price: number;
  quantity: number;
  show_price: boolean;
  show_sku: boolean;
}
