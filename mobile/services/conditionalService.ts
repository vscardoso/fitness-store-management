/**
 * Serviço de API para envios condicionais (try before you buy).
 */
import api from './api';
import type {
  ConditionalShipment,
  ConditionalShipmentList,
  CreateShipmentDTO,
  ProcessReturnDTO,
} from '../types/conditional';

/**
 * Criar novo envio condicional
 */
export const createShipment = async (data: CreateShipmentDTO): Promise<ConditionalShipment> => {
  try {
    const { data: response } = await api.post<ConditionalShipment>('/conditional-shipments/', data);
    return response;
  } catch (error) {
    throw error;
  }
};

/**
 * Listar envios condicionais com filtros
 */
export const listShipments = async (params?: {
  status?: string;
  customer_id?: number;
  is_overdue?: boolean;
  skip?: number;
  limit?: number;
}): Promise<ConditionalShipmentList[]> => {
  try {
    const { data } = await api.get<ConditionalShipmentList[]>('/conditional-shipments/', { params });
    return data;
  } catch (error) {
    throw error;
  }
};

/**
 * Buscar envio por ID com detalhes completos
 */
export const getShipment = async (id: number): Promise<ConditionalShipment> => {
  try {
    const { data } = await api.get<ConditionalShipment>(`/conditional-shipments/${id}`);
    return data;
  } catch (error) {
    throw error;
  }
};

/**
 * Marcar envio como SENT (enviado ao cliente)
 */
export const markAsSent = async (
  id: number,
  data: {
    carrier?: string;
    tracking_code?: string;
    sent_notes?: string;
  }
): Promise<ConditionalShipment> => {
  try {
    const { data: response } = await api.put<ConditionalShipment>(
      `/conditional-shipments/${id}/mark-as-sent`,
      data
    );
    return response;
  } catch (error) {
    throw error;
  }
};

/**
 * Processar devolução de envio
 */
export const processReturn = async (
  id: number,
  data: ProcessReturnDTO
): Promise<ConditionalShipment> => {
  try {
    const { data: response } = await api.put<ConditionalShipment>(
      `/conditional-shipments/${id}/process-return`,
      data
    );
    return response;
  } catch (error) {
    throw error;
  }
};

/**
 * Atualizar envio condicional
 */
export const updateShipment = async (
  id: number,
  data: { status?: string; shipping_address?: string; notes?: string }
): Promise<ConditionalShipment> => {
  try {
    const { data: response } = await api.put<ConditionalShipment>(
      `/conditional-shipments/${id}`,
      data
    );
    return response;
  } catch (error) {
    throw error;
  }
};

/**
 * Cancelar envio condicional
 */
export const cancelShipment = async (id: number, reason: string): Promise<void> => {
  try {
    await api.delete(`/conditional-shipments/${id}`, {
      params: { reason },
    });
  } catch (error) {
    throw error;
  }
};

/**
 * Checar envios atrasados (atualiza status automaticamente)
 */
export const checkOverdueShipments = async (): Promise<ConditionalShipmentList[]> => {
  try {
    const { data } = await api.get<ConditionalShipmentList[]>('/conditional-shipments/overdue/check');
    return data;
  } catch (error) {
    throw error;
  }
};

/**
 * Helper: Buscar envios pendentes (SENT ou PARTIAL_RETURN)
 */
export const getPendingShipments = async (): Promise<ConditionalShipmentList[]> => {
  try {
    return await listShipments({ status: 'SENT', limit: 100 });
  } catch (error) {
    throw error;
  }
};

/**
 * Helper: Buscar envios atrasados
 */
export const getOverdueShipments = async (): Promise<ConditionalShipmentList[]> => {
  try {
    return await listShipments({ is_overdue: true, limit: 100 });
  } catch (error) {
    throw error;
  }
};

/**
 * Helper: Buscar envios concluídos
 */
export const getCompletedShipments = async (limit = 50): Promise<ConditionalShipmentList[]> => {
  try {
    return await listShipments({ status: 'COMPLETED', limit });
  } catch (error) {
    throw error;
  }
};

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
  markAsSent,
  updateShipment,
  processReturn,
  cancelShipment,
  checkOverdueShipments,
  getPendingShipments,
  getOverdueShipments,
  getCompletedShipments,
  getShipmentsByCustomer,
};
