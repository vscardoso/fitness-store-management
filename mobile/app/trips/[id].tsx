import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { getTripById, deleteTrip, updateTripStatus } from '@/services/tripService';
import { TripStatus } from '@/types';
import { Colors } from '@/constants/Colors';
import { formatCurrency, formatDate, formatDateTime } from '@/utils/format';

export default function TripDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [showActions, setShowActions] = useState(false);

  const { data: trip, isLoading } = useQuery({
    queryKey: ['trip', id],
    queryFn: () => getTripById(Number(id)),
    enabled: !!id,
    retry: false, // Não tentar novamente em caso de 404
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTrip,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      Alert.alert('Sucesso', 'Viagem excluída com sucesso!');
      router.back();
    },
    onError: (error: any) => {
      Alert.alert('Erro', error.response?.data?.detail || 'Erro ao excluir viagem');
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: TripStatus }) =>
      updateTripStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trip', id] });
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      Alert.alert('Sucesso', 'Status atualizado com sucesso!');
    },
    onError: (error: any) => {
      Alert.alert('Erro', error.response?.data?.detail || 'Erro ao atualizar status');
    },
  });

  const handleDelete = () => {
    Alert.alert(
      'Confirmar Exclusão',
      'Tem certeza que deseja excluir esta viagem?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: () => deleteMutation.mutate(Number(id)),
        },
      ]
    );
  };

  const handleStatusChange = (status: TripStatus) => {
    statusMutation.mutate({ id: Number(id), status });
    setShowActions(false);
  };

  const getStatusColor = (status: TripStatus) => {
    switch (status) {
      case TripStatus.COMPLETED:
        return Colors.light.success;
      case TripStatus.IN_PROGRESS:
        return Colors.light.warning;
      case TripStatus.PLANNED:
        return Colors.light.info;
      default:
        return Colors.light.text;
    }
  };

  const getStatusText = (status: TripStatus) => {
    switch (status) {
      case TripStatus.COMPLETED:
        return 'Concluída';
      case TripStatus.IN_PROGRESS:
        return 'Em Andamento';
      case TripStatus.PLANNED:
        return 'Planejada';
      default:
        return status;
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={[styles.container, styles.centerContent]}>
          <ActivityIndicator size="large" color={Colors.light.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!trip) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={[styles.container, styles.centerContent]}>
          <Ionicons name="alert-circle-outline" size={64} color={Colors.light.error} />
          <Text style={styles.errorText}>Viagem não encontrada ou foi excluída</Text>
          <Text style={styles.errorSubtext}>
            A viagem pode ter sido excluída ou o link está incorreto.
          </Text>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButtonError}
          >
            <Text style={styles.backButtonText}>Voltar</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{trip.trip_code}</Text>
          <TouchableOpacity onPress={() => setShowActions(!showActions)} style={styles.moreButton}>
            <Ionicons name="ellipsis-vertical" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Actions Menu */}
        {showActions && (
          <View style={styles.actionsMenu}>
            {trip.status !== TripStatus.IN_PROGRESS && (
              <TouchableOpacity
                style={styles.actionItem}
                onPress={() => handleStatusChange(TripStatus.IN_PROGRESS)}
              >
                <Ionicons name="play-circle-outline" size={20} color={Colors.light.warning} />
                <Text style={styles.actionText}>Iniciar Viagem</Text>
              </TouchableOpacity>
            )}
            {trip.status !== TripStatus.COMPLETED && (
              <TouchableOpacity
                style={styles.actionItem}
                onPress={() => handleStatusChange(TripStatus.COMPLETED)}
              >
                <Ionicons name="checkmark-circle-outline" size={20} color={Colors.light.success} />
                <Text style={styles.actionText}>Concluir Viagem</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.actionItem} onPress={handleDelete}>
              <Ionicons name="trash-outline" size={20} color={Colors.light.error} />
              <Text style={[styles.actionText, { color: Colors.light.error }]}>Excluir</Text>
            </TouchableOpacity>
          </View>
        )}

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Status Card */}
          <View style={[styles.statusCard, { backgroundColor: getStatusColor(trip.status) + '10' }]}>
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(trip.status) }]}>
              <Text style={styles.statusBadgeText}>{getStatusText(trip.status)}</Text>
            </View>
          </View>

          {/* Informações Básicas */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Informações da Viagem</Text>

            <View style={styles.infoRow}>
              <View style={styles.infoIcon}>
                <Ionicons name="location-outline" size={20} color={Colors.light.primary} />
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Destino</Text>
                <Text style={styles.infoValue}>{trip.destination}</Text>
              </View>
            </View>

            <View style={styles.infoRow}>
              <View style={styles.infoIcon}>
                <Ionicons name="calendar-outline" size={20} color={Colors.light.primary} />
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Data</Text>
                <Text style={styles.infoValue}>{formatDate(trip.trip_date)}</Text>
              </View>
            </View>

            {trip.departure_time && (
              <View style={styles.infoRow}>
                <View style={styles.infoIcon}>
                  <Ionicons name="time-outline" size={20} color={Colors.light.primary} />
                </View>
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Horário Saída</Text>
                  <Text style={styles.infoValue}>{formatDateTime(trip.departure_time)}</Text>
                </View>
              </View>
            )}

            {trip.return_time && (
              <View style={styles.infoRow}>
                <View style={styles.infoIcon}>
                  <Ionicons name="time-outline" size={20} color={Colors.light.primary} />
                </View>
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Horário Retorno</Text>
                  <Text style={styles.infoValue}>{formatDateTime(trip.return_time)}</Text>
                </View>
              </View>
            )}
          </View>

          {/* Custos */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Custos da Viagem</Text>

            <View style={styles.costRow}>
              <Text style={styles.costLabel}>Combustível</Text>
              <Text style={styles.costValue}>{formatCurrency(trip.travel_cost_fuel)}</Text>
            </View>

            <View style={styles.costRow}>
              <Text style={styles.costLabel}>Alimentação</Text>
              <Text style={styles.costValue}>{formatCurrency(trip.travel_cost_food)}</Text>
            </View>

            <View style={styles.costRow}>
              <Text style={styles.costLabel}>Pedágios</Text>
              <Text style={styles.costValue}>{formatCurrency(trip.travel_cost_toll)}</Text>
            </View>

            <View style={styles.costRow}>
              <Text style={styles.costLabel}>Hospedagem</Text>
              <Text style={styles.costValue}>{formatCurrency(trip.travel_cost_hotel)}</Text>
            </View>

            <View style={styles.costRow}>
              <Text style={styles.costLabel}>Outros</Text>
              <Text style={styles.costValue}>{formatCurrency(trip.travel_cost_other)}</Text>
            </View>

            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>{formatCurrency(trip.travel_cost_total)}</Text>
            </View>
          </View>

          {/* Observações */}
          {trip.notes && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Observações</Text>
              <Text style={styles.notesText}>{trip.notes}</Text>
            </View>
          )}

          {/* Metadados */}
          <View style={styles.metaSection}>
            <Text style={styles.metaText}>
              Criado em: {formatDateTime(trip.created_at)}
            </Text>
            <Text style={styles.metaText}>
              Atualizado em: {formatDateTime(trip.updated_at)}
            </Text>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.light.primary,
  },
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: Colors.light.primary,
  },
  backButton: {
    padding: 8,
  },
  moreButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  actionsMenu: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 8,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  actionText: {
    fontSize: 16,
    color: Colors.light.text,
  },
  content: {
    flex: 1,
  },
  statusCard: {
    margin: 16,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  statusBadge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
  },
  statusBadgeText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  section: {
    backgroundColor: '#fff',
    padding: 16,
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.light.text,
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  infoIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.light.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    color: Colors.light.text,
    fontWeight: '500',
  },
  costRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  costLabel: {
    fontSize: 14,
    color: Colors.light.textSecondary,
  },
  costValue: {
    fontSize: 14,
    color: Colors.light.text,
    fontWeight: '500',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 16,
    marginTop: 8,
    borderTopWidth: 2,
    borderTopColor: Colors.light.primary,
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.light.text,
  },
  totalValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.light.primary,
  },
  notesText: {
    fontSize: 14,
    color: Colors.light.text,
    lineHeight: 20,
  },
  metaSection: {
    padding: 16,
    marginTop: 16,
    marginBottom: 32,
  },
  metaText: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    marginBottom: 4,
  },
  errorText: {
    fontSize: 18,
    color: Colors.light.text,
    fontWeight: '600',
    marginTop: 16,
    textAlign: 'center',
  },
  errorSubtext: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 24,
    paddingHorizontal: 32,
  },
  backButtonError: {
    backgroundColor: Colors.light.primary,
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
