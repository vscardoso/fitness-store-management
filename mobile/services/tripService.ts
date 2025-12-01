/**
 * Trip Service - Gerenciamento de Viagens
 * Comunicação com API de viagens (CRUD + Analytics)
 */

import api from './api';
import type { Trip, TripCreate, TripUpdate, TripAnalytics, TripStatus } from '@/types';

const TRIPS_ENDPOINT = '/trips/';

/**
 * Listar todas as viagens com filtros opcionais
 */
export async function getTrips(params?: {
  status?: TripStatus;
  start_date?: string;
  end_date?: string;
  destination?: string;
  limit?: number;
  skip?: number;
}): Promise<Trip[]> {
  const response = await api.get<Trip[]>(TRIPS_ENDPOINT, { params });
  return response.data;
}

/**
 * Buscar viagem por ID
 */
export async function getTripById(id: number): Promise<Trip> {
  const response = await api.get<Trip>(`${TRIPS_ENDPOINT}${id}`);
  return response.data;
}

/**
 * Buscar analytics de uma viagem
 */
export async function getTripAnalytics(id: number): Promise<TripAnalytics> {
  const response = await api.get<TripAnalytics>(`${TRIPS_ENDPOINT}${id}/analytics`);
  return response.data;
}

/**
 * Criar nova viagem
 */
export async function createTrip(trip: TripCreate): Promise<Trip> {
  const response = await api.post<Trip>(TRIPS_ENDPOINT, trip);
  return response.data;
}

/**
 * Verificar se código de viagem já existe
 */
export async function checkTripCode(tripCode: string): Promise<{ exists: boolean; message: string }> {
  const response = await api.get<{ exists: boolean; message: string }>(
    `${TRIPS_ENDPOINT}check-code/${encodeURIComponent(tripCode)}`,
    {
      headers: { 'X-Skip-Loading': 'true' }
    }
  );
  return response.data;
}

/**
 * Atualizar viagem
 */
export async function updateTrip(id: number, trip: TripUpdate): Promise<Trip> {
  const response = await api.put<Trip>(`${TRIPS_ENDPOINT}${id}`, trip);
  return response.data;
}

/**
 * Atualizar status da viagem
 */
export async function updateTripStatus(id: number, status: TripStatus): Promise<Trip> {
  const response = await api.put<Trip>(`${TRIPS_ENDPOINT}${id}/status`, { status });
  return response.data;
}

/**
 * Deletar viagem (soft delete)
 */
export async function deleteTrip(id: number): Promise<void> {
  await api.delete(`${TRIPS_ENDPOINT}${id}`);
}

/**
 * Comparar viagens (2 ou mais)
 * Aceita array de IDs ou 2 IDs individuais
 */
export async function compareTrips(
  tripIds: number[] | { tripId1: number; tripId2: number }
): Promise<{
  trip1: Trip & { analytics: TripAnalytics };
  trip2: Trip & { analytics: TripAnalytics };
  comparison: Record<string, any>;
}> {
  // Se receber objeto com tripId1 e tripId2, converter para formato da API
  if (!Array.isArray(tripIds)) {
    const response = await api.get(`${TRIPS_ENDPOINT}compare`, {
      params: { trip_id_1: tripIds.tripId1, trip_id_2: tripIds.tripId2 },
    });
    return response.data;
  }
  
  // Se receber array, usar o primeiro e segundo elemento
  const [id1, id2] = tripIds;
  const response = await api.get(`${TRIPS_ENDPOINT}compare`, {
    params: { trip_id_1: id1, trip_id_2: id2 },
  });
  return response.data;
}
