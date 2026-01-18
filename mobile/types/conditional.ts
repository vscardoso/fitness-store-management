/**
 * Tipos TypeScript para envios condicionais (try before you buy).
 */

export type ShipmentStatus =
  | 'PENDING'                    // Aguardando envio
  | 'SENT'                       // Enviado, aguardando retorno
  | 'RETURNED_NO_SALE'           // Devolveu tudo, não vendeu nada
  | 'COMPLETED_PARTIAL_SALE'     // Vendeu alguns, devolveu outros
  | 'COMPLETED_FULL_SALE';       // Vendeu tudo

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

  // Informações de transporte
  carrier?: string;
  tracking_code?: string;

  // Agendamento e prazo
  scheduled_ship_date?: string;
  
  // Datas de ida e devolução (NOVO)
  departure_datetime?: string;  // Data/hora de ida ao cliente
  return_datetime?: string;     // Data/hora prevista para devolução
  
  // LEGACY - manter por compatibilidade
  deadline_type?: 'days' | 'hours';
  deadline_value?: number;

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

  // Agendamento de envio e retorno
  departure_datetime?: string;  // Data/hora de ida ao cliente
  return_datetime?: string;     // Data/hora prevista para devolução
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
  
  // Datas de ida e devolução (NOVO)
  departure_datetime?: string;  // ISO string
  return_datetime?: string;     // ISO string
  
  // LEGACY - manter por compatibilidade
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
  payment_method?: 'cash' | 'credit_card' | 'debit_card' | 'pix' | 'bank_transfer' | 'installments' | 'loyalty_points';
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
  PENDING: '#9E9E9E',                // Cinza - Aguardando
  SENT: '#2196F3',                   // Azul - Em trânsito
  RETURNED_NO_SALE: '#F44336',       // Vermelho - Sem venda
  COMPLETED_PARTIAL_SALE: '#FF9800', // Laranja - Venda parcial
  COMPLETED_FULL_SALE: '#4CAF50',    // Verde - Venda total
};

/**
 * Ícones para status (MaterialCommunityIcons - usado pelo react-native-paper)
 */
export const SHIPMENT_STATUS_ICONS: Record<ShipmentStatus, string> = {
  PENDING: 'clock-outline',
  SENT: 'package-variant',
  RETURNED_NO_SALE: 'keyboard-return',
  COMPLETED_PARTIAL_SALE: 'check-circle',
  COMPLETED_FULL_SALE: 'check-all',
};

/**
 * Tradução de status para PT-BR
 */
export const SHIPMENT_STATUS_LABELS: Record<ShipmentStatus, string> = {
  PENDING: 'Pendente',
  SENT: 'Enviado',
  RETURNED_NO_SALE: 'Sem Venda',
  COMPLETED_PARTIAL_SALE: 'Venda Parcial',
  COMPLETED_FULL_SALE: 'Venda Total',
};

/**
 * Helper: verifica se é um status final (já processado)
 */
export function isFinalStatus(status: ShipmentStatus): boolean {
  return [
    'RETURNED_NO_SALE',
    'COMPLETED_PARTIAL_SALE',
    'COMPLETED_FULL_SALE'
  ].includes(status);
}

/**
 * Helper: verifica se houve alguma venda
 */
export function hasAnySale(status: ShipmentStatus): boolean {
  return [
    'COMPLETED_PARTIAL_SALE',
    'COMPLETED_FULL_SALE'
  ].includes(status);
}

/**
 * Helper: formatar prazo para exibição
 */
export function formatDeadline(deadline: Date | string): string {
  if (!deadline) return 'Sem prazo';

  const deadlineDate = typeof deadline === 'string' ? new Date(deadline) : deadline;
  const now = new Date();
  const diffMs = deadlineDate.getTime() - now.getTime();
  const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (daysRemaining === 0) return 'Vence hoje';
  if (daysRemaining === 1) return 'Vence amanhã';
  if (daysRemaining < 0) return `${Math.abs(daysRemaining)}d atraso`;
  return `${daysRemaining}d restantes`;
}

/**
 * Helper: cor do contador de prazo
 */
export function getDeadlineColor(deadline: Date | string | undefined | null): string {
  if (!deadline) return '#4CAF50';

  const deadlineDate = typeof deadline === 'string' ? new Date(deadline) : deadline;

  // Validar se a data é válida
  if (!deadlineDate || isNaN(deadlineDate.getTime())) {
    return '#4CAF50';
  }

  const now = new Date();
  const diffMs = deadlineDate.getTime() - now.getTime();
  const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (daysRemaining < 0) return '#D32F2F';  // Vermelho (atrasado)
  if (daysRemaining <= 2) return '#FF9800';  // Laranja (urgente)
  return '#4CAF50';  // Verde (ok)
}
