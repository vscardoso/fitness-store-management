/**
 * Custom Hooks para Trips
 * Gerenciamento de estado e cache com React Query
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Trip, TripCreate, TripUpdate, TripStatus } from '@/types';
import {
  getTrips,
  getTripById,
  getTripAnalytics,
  createTrip,
  updateTrip,
  updateTripStatus,
  deleteTrip,
} from '@/services/tripService';

/**
 * Hook para listar viagens com filtros
 */
export function useTrips(params?: {
  status?: TripStatus;
  start_date?: string;
  end_date?: string;
  destination?: string;
  limit?: number;
}) {
  return useQuery({
    queryKey: ['trips', params],
    queryFn: () => getTrips(params),
  });
}

/**
 * Hook para buscar viagem por ID
 */
export function useTrip(id: number) {
  return useQuery({
    queryKey: ['trip', id],
    queryFn: () => getTripById(id),
    enabled: !!id && id > 0,
  });
}

/**
 * Hook para buscar analytics de uma viagem
 */
export function useTripAnalytics(id: number) {
  return useQuery({
    queryKey: ['trip-analytics', id],
    queryFn: () => getTripAnalytics(id),
    enabled: !!id && id > 0,
  });
}

/**
 * Hook para criar viagem
 */
export function useCreateTrip() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (trip: TripCreate) => createTrip(trip),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trips'] });
    },
  });
}

/**
 * Hook para atualizar viagem
 */
export function useUpdateTrip() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: TripUpdate }) => updateTrip(id, data),
    onSuccess: (_data: Trip, variables: { id: number; data: TripUpdate }) => {
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      queryClient.invalidateQueries({ queryKey: ['trip', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['trip-analytics', variables.id] });
    },
  });
}

/**
 * Hook para atualizar status da viagem
 */
export function useUpdateTripStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: TripStatus }) => 
      updateTripStatus(id, status),
    onSuccess: (_data: Trip, variables: { id: number; status: TripStatus }) => {
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      queryClient.invalidateQueries({ queryKey: ['trip', variables.id] });
    },
  });
}

/**
 * Hook para deletar viagem
 */
export function useDeleteTrip() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => deleteTrip(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trips'] });
    },
  });
}
