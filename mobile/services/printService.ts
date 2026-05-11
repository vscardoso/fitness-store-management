import api from './api';
import type {
  LabelPrinter,
  LabelPrinterCreate,
  LabelPrinterUpdate,
  LabelPrinterListResponse,
  PrinterTestResponse,
  PrintJobCreate,
  PrintJobBatchCreate,
  PrintJob,
  PrintJobListResponse,
  PrintJobStatus,
  ZplPreviewResponse,
} from '@/types/printer';

const BASE = '/label-printers';

// ============================================================================
// IMPRESSORAS
// ============================================================================

export async function listPrinters(): Promise<LabelPrinterListResponse> {
  const { data } = await api.get(BASE);
  return data;
}

export async function getDefaultPrinter(): Promise<LabelPrinter | null> {
  const { data } = await api.get(`${BASE}/default`);
  return data;
}

export async function createPrinter(payload: LabelPrinterCreate): Promise<LabelPrinter> {
  const { data } = await api.post(BASE, payload);
  return data;
}

export async function updatePrinter(id: number, payload: LabelPrinterUpdate): Promise<LabelPrinter> {
  const { data } = await api.put(`${BASE}/${id}`, payload);
  return data;
}

export async function deletePrinter(id: number): Promise<void> {
  await api.delete(`${BASE}/${id}`);
}

export async function testPrinter(id: number): Promise<PrinterTestResponse> {
  const { data } = await api.post(`${BASE}/${id}/test`);
  return data;
}

// ============================================================================
// IMPRESSÃO
// ============================================================================

export async function printLabel(payload: PrintJobCreate): Promise<PrintJob> {
  const { data } = await api.post(`${BASE}/print`, payload);
  return data;
}

export async function printLabelsBatch(payload: PrintJobBatchCreate): Promise<PrintJobListResponse> {
  const { data } = await api.post(`${BASE}/print/batch`, payload);
  return data;
}

export async function listPrintJobs(params?: {
  status?: PrintJobStatus;
  limit?: number;
}): Promise<PrintJobListResponse> {
  const { data } = await api.get(`${BASE}/print/jobs`, { params });
  return data;
}

export async function getZplPreview(params: {
  variant_id: number;
  product_id: number;
  printer_id?: number;
  show_price?: boolean;
  show_sku?: boolean;
}): Promise<ZplPreviewResponse> {
  const { data } = await api.get(`${BASE}/print/preview`, { params });
  return data;
}

// ============================================================================
// Helpers para label design
// ============================================================================

export const LABEL_DEFAULTS = {
  WIDTH_MM: 55,
  HEIGHT_MM: 65,
  DPI: 203,
};

export function labelDimensions(printer: LabelPrinter | null) {
  return {
    widthMm: printer?.label_width_mm ?? LABEL_DEFAULTS.WIDTH_MM,
    heightMm: printer?.label_height_mm ?? LABEL_DEFAULTS.HEIGHT_MM,
    dpi: printer?.dpi ?? LABEL_DEFAULTS.DPI,
  };
}

export function connectionLabel(printer: LabelPrinter): string {
  switch (printer.connection_type) {
    case 'ethernet':
      return `Ethernet ${printer.ip_address ?? ''}:${printer.port}`;
    case 'usb':
      return `USB${printer.usb_device ? ` (${printer.usb_device})` : ''}`;
    case 'serial':
      return `Serial ${printer.serial_port ?? ''} @ ${printer.baud_rate} baud`;
    default:
      return printer.connection_type;
  }
}

export function statusColor(status: PrintJobStatus): string {
  switch (status) {
    case 'done':     return '#10B981';
    case 'error':    return '#EF4444';
    case 'printing': return '#3B82F6';
    case 'queued':   return '#F59E0B';
    case 'cancelled': return '#6B7280';
    default: return '#6B7280';
  }
}

export function statusLabel(status: PrintJobStatus): string {
  switch (status) {
    case 'done':      return 'Impresso';
    case 'error':     return 'Erro';
    case 'printing':  return 'Imprimindo';
    case 'queued':    return 'Na fila';
    case 'cancelled': return 'Cancelado';
    default: return status;
  }
}
