/**
 * Tipos TypeScript para envios condicionais (try before you buy).
 */

export type ShipmentStatus =
  | 'PENDING'
  | 'SENT'
  | 'PARTIAL_RETURN'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'OVERDUE';

export type ShipmentItemStatus =
  | 'SENT'
  | 'KEPT'
  | 'RETURNED'
  | 'DAMAGED'
  | 'LOST';

/**
 * Item de um envio condicional (produto enviado)
 */
export interface ConditionalShipmentItem {
  id: number;
  shipment_id: number;
  product_id: number;
  quantity_sent: number;
  quantity_kept: number;
  quantity_returned: number;
  quantity_pending: number;  // Calculado: sent - kept - returned
  status: ShipmentItemStatus;
  unit_price: number;
  notes?: string;
  total_value: number;  // Calculado: sent * price
  kept_value: number;   // Calculado: kept * price
  created_at: string;
  updated_at: string;
  
  // Dados do produto (nested)
  product_name?: string;
  product_sku?: string;
}

/**
 * Envio condicional completo
 */
export interface ConditionalShipment {
  id: number;
  tenant_id: number;
  customer_id: number;
  status: ShipmentStatus;
  sent_at?: string;
  deadline?: string;
  returned_at?: string;
  completed_at?: string;
  notes?: string;
  shipping_address: string;
  
  // Propriedades calculadas
  is_overdue: boolean;
  days_remaining: number;
  total_items_sent: number;
  total_items_kept: number;
  total_items_returned: number;
  total_value_sent: number;
  total_value_kept: number;
  
  // Dados relacionados
  items: ConditionalShipmentItem[];
  customer_name?: string;
  customer_phone?: string;
  
  created_at: string;
  updated_at: string;
  is_active: boolean;
}

/**
 * Versão resumida para listagem (sem itens detalhados)
 */
export interface ConditionalShipmentList {
  id: number;
  customer_id: number;
  customer_name?: string;
  customer_phone?: string;
  status: ShipmentStatus;
  deadline?: string;
  is_overdue: boolean;
  days_remaining: number;
  total_items_sent: number;
  total_items_kept: number;
  total_items_returned: number;
  total_value_sent: number;
  total_value_kept: number;
  created_at: string;
}

/**
 * DTO para criar novo envio
 */
export interface CreateShipmentItemDTO {
  product_id: number;
  quantity_sent: number;
  unit_price: number;
  notes?: string;
}

export interface CreateShipmentDTO {
  customer_id: number;
  shipping_address: string;
  items: CreateShipmentItemDTO[];
  deadline_days?: number;  // Padrão: 7
  notes?: string;
}

/**
 * DTO para processar devolução
 */
export interface ProcessReturnItemDTO {
  id: number;  // ID do item
  quantity_kept: number;
  quantity_returned: number;
  status: ShipmentItemStatus;
  notes?: string;
}

export interface ProcessReturnDTO {
  items: ProcessReturnItemDTO[];
  create_sale?: boolean;  // Padrão: true
  notes?: string;
}

/**
 * Filtros para listagem
 */
export interface ShipmentFilters {
  status?: ShipmentStatus;
  customer_id?: number;
  is_overdue?: boolean;
  skip?: number;
  limit?: number;
}

/**
 * Status badge colors para UI
 */
export const SHIPMENT_STATUS_COLORS: Record<ShipmentStatus, string> = {
  PENDING: '#9E9E9E',      // Cinza
  SENT: '#2196F3',         // Azul
  PARTIAL_RETURN: '#FF9800', // Laranja
  COMPLETED: '#4CAF50',    // Verde
  CANCELLED: '#F44336',    // Vermelho
  OVERDUE: '#D32F2F',      // Vermelho escuro
};

/**
 * Ícones para status
 */
export const SHIPMENT_STATUS_ICONS: Record<ShipmentStatus, string> = {
  PENDING: 'clock-outline',
  SENT: 'package-variant',
  PARTIAL_RETURN: 'package-variant-closed',
  COMPLETED: 'check-circle',
  CANCELLED: 'close-circle',
  OVERDUE: 'alert-circle',
};

/**
 * Tradução de status para PT-BR
 */
export const SHIPMENT_STATUS_LABELS: Record<ShipmentStatus, string> = {
  PENDING: 'Pendente',
  SENT: 'Enviado',
  PARTIAL_RETURN: 'Devolução Parcial',
  COMPLETED: 'Concluído',
  CANCELLED: 'Cancelado',
  OVERDUE: 'Atrasado',
};

/**
 * Helper: formatar prazo para exibição
 */
export function formatDeadline(deadline: string | undefined, daysRemaining: number): string {
  if (!deadline) return 'Sem prazo';
  
  if (daysRemaining === 0) return 'Vence hoje';
  if (daysRemaining === 1) return 'Vence amanhã';
  if (daysRemaining < 0) return `Atrasado ${Math.abs(daysRemaining)} dias`;
  return `${daysRemaining} dias restantes`;
}

/**
 * Helper: cor do contador de prazo
 */
export function getDeadlineColor(daysRemaining: number, isOverdue: boolean): string {
  if (isOverdue) return '#D32F2F';  // Vermelho
  if (daysRemaining <= 2) return '#FF9800';  // Laranja
  return '#4CAF50';  // Verde
}
