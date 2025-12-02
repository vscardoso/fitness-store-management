/**
 * Serviço de API para envios condicionais (try before you buy).
 */
import api from './api';
import {
  ConditionalShipment,
  ConditionalShipmentList,
  CreateShipmentDTO,
  ProcessReturnDTO,
  ShipmentFilters,
} from '../types/conditional';

const BASE_URL = '/conditional-shipments';

/**
 * Criar novo envio condicional
 */
export async function createShipment(data: CreateShipmentDTO): Promise<ConditionalShipment> {
  const response = await api.post<ConditionalShipment>(BASE_URL, data);
  return response.data;
}

/**
 * Listar envios condicionais com filtros
 */
export async function listShipments(
  filters?: ShipmentFilters
): Promise<ConditionalShipmentList[]> {
  const params: Record<string, any> = {};
  
  if (filters?.status) params.status = filters.status;
  if (filters?.customer_id) params.customer_id = filters.customer_id;
  if (filters?.is_overdue !== undefined) params.is_overdue = filters.is_overdue;
  if (filters?.skip !== undefined) params.skip = filters.skip;
  if (filters?.limit !== undefined) params.limit = filters.limit;
  
  const response = await api.get<ConditionalShipmentList[]>(BASE_URL, { params });
  return response.data;
}

/**
 * Buscar envio por ID com detalhes completos
 */
export async function getShipment(id: number): Promise<ConditionalShipment> {
  const response = await api.get<ConditionalShipment>(`${BASE_URL}/${id}`);
  return response.data;
}

/**
 * Processar devolução de envio
 */
export async function processReturn(
  id: number,
  data: ProcessReturnDTO
): Promise<ConditionalShipment> {
  const response = await api.put<ConditionalShipment>(
    `${BASE_URL}/${id}/process-return`,
    data
  );
  return response.data;
}

/**
 * Cancelar envio condicional
 */
export async function cancelShipment(id: number, reason: string): Promise<void> {
  await api.delete(`${BASE_URL}/${id}`, {
    params: { reason },
  });
}

/**
 * Checar envios atrasados (atualiza status automaticamente)
 */
export async function checkOverdueShipments(): Promise<ConditionalShipmentList[]> {
  const response = await api.get<ConditionalShipmentList[]>(`${BASE_URL}/overdue/check`);
  return response.data;
}

/**
 * Helper: Buscar envios pendentes (SENT ou PARTIAL_RETURN)
 */
export async function getPendingShipments(): Promise<ConditionalShipmentList[]> {
  return listShipments({ status: 'SENT', limit: 100 });
}

/**
 * Helper: Buscar envios atrasados
 */
export async function getOverdueShipments(): Promise<ConditionalShipmentList[]> {
  return listShipments({ is_overdue: true, limit: 100 });
}

/**
 * Helper: Buscar envios concluídos
 */
export async function getCompletedShipments(limit = 50): Promise<ConditionalShipmentList[]> {
  return listShipments({ status: 'COMPLETED', limit });
}

/**
 * Helper: Buscar envios por cliente
 */
export async function getShipmentsByCustomer(
  customerId: number
): Promise<ConditionalShipmentList[]> {
  return listShipments({ customer_id: customerId, limit: 100 });
}

export default {
  createShipment,
  listShipments,
  getShipment,
  processReturn,
  cancelShipment,
  checkOverdueShipments,
  getPendingShipments,
  getOverdueShipments,
  getCompletedShipments,
  getShipmentsByCustomer,
};
