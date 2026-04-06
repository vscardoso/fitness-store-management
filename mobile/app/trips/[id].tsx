import React, { useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Animated } from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import useBackToList from '@/hooks/useBackToList';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { getTripById, deleteTrip, updateTripStatus, getTripAnalytics } from '@/services/tripService';
import { TripStatus } from '@/types';
import type { TripAnalytics } from '@/types';
import { Colors, VALUE_COLORS, theme } from '@/constants/Colors';
import { formatCurrency, formatDate, formatDateTime } from '@/utils/format';
import { useBrandingColors } from '@/store/brandingStore';
import PageHeader from '@/components/layout/PageHeader';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

export default function TripDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const brandingColors = useBrandingColors();
    const { goBack } = useBackToList('/(tabs)/trips');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<TripStatus | null>(null);

  // Animações de entrada
  const headerScale = useRef(new Animated.Value(0.94)).current;
  const headerOpacity = useRef(new Animated.Value(0)).current;
  const contentTranslate = useRef(new Animated.Value(24)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;

  useFocusEffect(
    useCallback(() => {
      headerScale.setValue(0.94);
      headerOpacity.setValue(0);
      contentTranslate.setValue(24);
      contentOpacity.setValue(0);

      Animated.parallel([
        Animated.spring(headerScale, { toValue: 1, useNativeDriver: true }),
        Animated.timing(headerOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.sequence([
          Animated.delay(140),
          Animated.parallel([
            Animated.spring(contentTranslate, { toValue: 0, useNativeDriver: true }),
            Animated.timing(contentOpacity, { toValue: 1, duration: 280, useNativeDriver: true }),
          ]),
        ]),
      ]).start();
    }, [])
  );

  const { data: trip, isLoading } = useQuery({
    queryKey: ['trip', id],
    queryFn: () => getTripById(Number(id)),
    enabled: !!id,
    retry: false,
  });

  const { data: analytics, isLoading: isLoadingAnalytics } = useQuery<TripAnalytics>({
    queryKey: ['trip-analytics', id],
    queryFn: () => getTripAnalytics(Number(id)),
    enabled: !!id,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTrip,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      goBack();
    },
    onError: (error: any) => {
      console.error('Erro ao excluir viagem:', error);
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: TripStatus }) =>
      updateTripStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trip', id] });
      queryClient.invalidateQueries({ queryKey: ['trips'] });
    },
    onError: (error: any) => {
      console.error('Erro ao atualizar status:', error);
    },
  });

  const handleDelete = () => {
    if (!canDeleteTrip) return;
    setShowDeleteDialog(true);
  };

  const confirmDelete = () => {
    setShowDeleteDialog(false);
    deleteMutation.mutate(Number(id));
  };

  const handleStatusChange = (status: TripStatus) => {
    setPendingStatus(status);
    setShowStatusDialog(true);
  };

  const confirmStatusChange = () => {
    if (pendingStatus) {
      statusMutation.mutate({ id: Number(id), status: pendingStatus });
    }
    setShowStatusDialog(false);
    setPendingStatus(null);
  };

  const getStatusColor = (status: TripStatus) => {
    switch (status) {
      case TripStatus.COMPLETED:   return Colors.light.success;
      case TripStatus.IN_PROGRESS: return Colors.light.warning;
      case TripStatus.PLANNED:     return Colors.light.info;
      default:                     return Colors.light.textSecondary;
    }
  };

  const getStatusLabel = (status: TripStatus) => {
    switch (status) {
      case TripStatus.COMPLETED:   return 'CONCLUÍDA';
      case TripStatus.IN_PROGRESS: return 'EM ANDAMENTO';
      case TripStatus.PLANNED:     return 'PLANEJADA';
      default:                     return String(status).toUpperCase();
    }
  };

  const getStatusIcon = (status: TripStatus) => {
    switch (status) {
      case TripStatus.COMPLETED:   return 'checkmark-circle';
      case TripStatus.IN_PROGRESS: return 'play-circle';
      case TripStatus.PLANNED:     return 'time';
      default:                     return 'ellipse';
    }
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <PageHeader
          title="Detalhes da Viagem"
          showBackButton
          onBack={goBack}
        />
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={brandingColors.primary} />
        </View>
      </View>
    );
  }

  if (!trip) {
    return (
      <View style={styles.container}>
        <PageHeader
          title="Viagem"
          showBackButton
          onBack={goBack}
        />
        <View style={styles.centerContent}>
          <View style={styles.errorIconWrapper}>
            <Ionicons name="alert-circle-outline" size={40} color={Colors.light.error} />
          </View>
          <Text style={styles.errorText}>Viagem não encontrada</Text>
          <Text style={styles.errorSubtext}>
            A viagem pode ter sido excluída ou o link está incorreto.
          </Text>
          <TouchableOpacity onPress={goBack} style={styles.errorButton} activeOpacity={0.7}>
            <Text style={styles.errorButtonText}>Voltar</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const statusColor = getStatusColor(trip.status);
  const hasSales = (analytics?.total_quantity_sold ?? 0) > 0;
  const hasLinkedEntries = (analytics?.total_entries ?? 0) > 0;
  const canDeleteTrip = !isLoadingAnalytics && !hasSales && !hasLinkedEntries;

  return (
    <View style={styles.container}>
      {/* Header animado */}
      <Animated.View style={{ transform: [{ scale: headerScale }], opacity: headerOpacity }}>
        <PageHeader
          title={trip.trip_code}
          subtitle={getStatusLabel(trip.status)}
          showBackButton
          onBack={goBack}
        />
      </Animated.View>

      <Animated.View style={{ flex: 1, transform: [{ translateY: contentTranslate }], opacity: contentOpacity }}>
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>

          {/* Status + Ações */}
          <View style={styles.statusBlock}>
            <View style={styles.statusRow}>
              <View style={[styles.statusBadge, { backgroundColor: statusColor + '18' }]}>
                <Ionicons name={getStatusIcon(trip.status) as any} size={14} color={statusColor} />
                <Text style={[styles.statusText, { color: statusColor }]}>
                  {getStatusLabel(trip.status)}
                </Text>
              </View>
              <View style={styles.statusActions}>
                {trip.status !== TripStatus.IN_PROGRESS && trip.status !== TripStatus.COMPLETED && (
                  <TouchableOpacity
                    style={[styles.statusActionBtn, { borderColor: Colors.light.warning + '60', backgroundColor: Colors.light.warning + '10' }]}
                    onPress={() => handleStatusChange(TripStatus.IN_PROGRESS)}
                    activeOpacity={0.7}
                    disabled={statusMutation.isPending}
                  >
                    <Ionicons name="play-circle-outline" size={16} color={Colors.light.warning} />
                    <Text style={[styles.statusActionText, { color: Colors.light.warning }]}>Iniciar</Text>
                  </TouchableOpacity>
                )}
                {canDeleteTrip && (
                  <TouchableOpacity
                    style={[styles.statusActionBtn, { borderColor: Colors.light.error + '60', backgroundColor: Colors.light.error + '10' }]}
                    onPress={handleDelete}
                    activeOpacity={0.7}
                    disabled={deleteMutation.isPending}
                  >
                    <Ionicons name="trash-outline" size={16} color={Colors.light.error} />
                    <Text style={[styles.statusActionText, { color: Colors.light.error }]}>Excluir</Text>
                  </TouchableOpacity>
                )}
                {trip.status !== TripStatus.COMPLETED && (
                  <TouchableOpacity
                    style={[styles.statusActionBtn, { borderColor: Colors.light.success + '60', backgroundColor: Colors.light.success + '10' }]}
                    onPress={() => handleStatusChange(TripStatus.COMPLETED)}
                    activeOpacity={0.7}
                    disabled={statusMutation.isPending}
                  >
                    <Ionicons name="checkmark-circle-outline" size={16} color={Colors.light.success} />
                    <Text style={[styles.statusActionText, { color: Colors.light.success }]}>Concluir</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
            <Text style={styles.statusHint}>
              {trip.status === TripStatus.PLANNED && 'Toque em "Iniciar" quando sair para a viagem.'}
              {trip.status === TripStatus.IN_PROGRESS && 'Viagem em curso. Registre as compras e toque em "Concluir" ao voltar.'}
              {trip.status === TripStatus.COMPLETED && 'Viagem encerrada. Custos incluídos no CMV das vendas realizadas.'}
            </Text>
          </View>

          {/* Informações da Viagem */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>INFORMAÇÕES DA VIAGEM</Text>

            <View style={styles.infoRow}>
              <View style={[styles.infoIconWrapper, { backgroundColor: brandingColors.primary + '18' }]}>
                <Ionicons name="location-outline" size={18} color={brandingColors.primary} />
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>DESTINO</Text>
                <Text style={styles.infoValue}>{trip.destination}</Text>
              </View>
            </View>

            <View style={[styles.infoRow, { marginBottom: 0 }]}>
              <View style={[styles.infoIconWrapper, { backgroundColor: brandingColors.primary + '18' }]}>
                <Ionicons name="calendar-outline" size={18} color={brandingColors.primary} />
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>DATA</Text>
                <Text style={styles.infoValue}>{formatDate(trip.trip_date)}</Text>
              </View>
            </View>

            {(trip.departure_time || trip.return_time) && (
              <View style={styles.timesRow}>
                {trip.departure_time && (
                  <View style={styles.timeBlock}>
                    <View style={[styles.infoIconWrapper, { backgroundColor: Colors.light.info + '18' }]}>
                      <Ionicons name="airplane-outline" size={18} color={Colors.light.info} />
                    </View>
                    <Text style={styles.infoLabel}>SAÍDA</Text>
                    <Text style={styles.infoValue}>{formatDateTime(trip.departure_time)}</Text>
                  </View>
                )}
                {trip.return_time && (
                  <View style={styles.timeBlock}>
                    <View style={[styles.infoIconWrapper, { backgroundColor: Colors.light.success + '18' }]}>
                      <Ionicons name="airplane-outline" size={18} color={Colors.light.success} style={{ transform: [{ rotate: '180deg' }] }} />
                    </View>
                    <Text style={styles.infoLabel}>RETORNO</Text>
                    <Text style={styles.infoValue}>{formatDateTime(trip.return_time)}</Text>
                  </View>
                )}
              </View>
            )}
          </View>

          {/* Custos da Viagem */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>CUSTOS DA VIAGEM</Text>

            {[
              { label: 'Combustível', icon: 'car-outline', value: trip.travel_cost_fuel },
              { label: 'Alimentação', icon: 'restaurant-outline', value: trip.travel_cost_food },
              { label: 'Pedágios', icon: 'navigate-outline', value: trip.travel_cost_toll },
              { label: 'Hospedagem', icon: 'bed-outline', value: trip.travel_cost_hotel },
              { label: 'Outros', icon: 'ellipsis-horizontal-outline', value: trip.travel_cost_other },
            ].map((item, idx, arr) => (
              <View key={item.label} style={[styles.costRow, idx === arr.length - 1 && { borderBottomWidth: 0 }]}>
                <View style={styles.costLeft}>
                  <Ionicons name={item.icon as any} size={16} color={Colors.light.textSecondary} />
                  <Text style={styles.costLabel}>{item.label}</Text>
                </View>
                <Text style={styles.costValue}>{formatCurrency(item.value)}</Text>
              </View>
            ))}

            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>TOTAL</Text>
              <Text style={[styles.totalValue, { color: VALUE_COLORS.negative }]}>
                {formatCurrency(trip.travel_cost_total)}
              </Text>
            </View>
          </View>

          {/* Analytics da Viagem */}
          {analytics && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>DESEMPENHO DA VIAGEM</Text>

              <View style={styles.analyticsGrid}>
                <View style={styles.analyticsCell}>
                  <Text style={styles.analyticsCellLabel}>Investido</Text>
                  <Text style={styles.analyticsCellValue}>{formatCurrency(analytics.total_cost)}</Text>
                </View>
                <View style={styles.analyticsCell}>
                  <Text style={styles.analyticsCellLabel}>Receita Gerada</Text>
                  <Text style={[styles.analyticsCellValue, { color: Colors.light.success }]}>
                    {formatCurrency(analytics.trip_revenue ?? 0)}
                  </Text>
                </View>
                <View style={styles.analyticsCell}>
                  <Text style={styles.analyticsCellLabel}>Sell-through</Text>
                  <Text style={[styles.analyticsCellValue, { color: Colors.light.primary }]}>
                    {(analytics.sell_through_rate ?? 0).toFixed(1)}%
                  </Text>
                </View>
                <View style={styles.analyticsCell}>
                  <Text style={styles.analyticsCellLabel}>ROI</Text>
                  <Text style={[
                    styles.analyticsCellValue,
                    { color: (analytics.roi ?? 0) >= 0 ? Colors.light.success : Colors.light.error },
                  ]}>
                    {(analytics.roi ?? 0) >= 0 ? '+' : ''}{(analytics.roi ?? 0).toFixed(1)}%
                  </Text>
                </View>
              </View>

              <View style={styles.analyticsRow}>
                <Ionicons name="cube-outline" size={16} color={Colors.light.textSecondary} />
                <Text style={styles.analyticsRowText}>
                  {analytics.total_quantity_purchased ?? 0} comprados · {analytics.total_quantity_sold ?? 0} vendidos · {analytics.quantity_remaining ?? 0} em estoque
                </Text>
              </View>
            </View>
          )}

          {/* Observações */}
          {trip.notes && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>OBSERVAÇÕES</Text>
              <Text style={styles.notesText}>{trip.notes}</Text>
            </View>
          )}

          {/* Metadados */}
          <View style={styles.metaSection}>
            <Text style={styles.metaText}>Criado em {formatDateTime(trip.created_at)}</Text>
            <Text style={styles.metaText}>Atualizado em {formatDateTime(trip.updated_at)}</Text>
          </View>
        </ScrollView>
      </Animated.View>

      {/* Confirmação de exclusão */}
      <ConfirmDialog
        visible={showDeleteDialog}
        title="Excluir viagem"
        message={`Deseja excluir a viagem ${trip.trip_code}? Esta ação não pode ser desfeita.`}
        confirmText="Excluir"
        cancelText="Cancelar"
        onConfirm={confirmDelete}
        onCancel={() => setShowDeleteDialog(false)}
        type="danger"
        icon="trash"
        loading={deleteMutation.isPending}
      />

      {/* Confirmação de mudança de status */}
      <ConfirmDialog
        visible={showStatusDialog}
        title="Atualizar status"
        message={`Deseja marcar a viagem como "${pendingStatus ? getStatusLabel(pendingStatus) : ''}"?`}
        confirmText="Confirmar"
        cancelText="Cancelar"
        onConfirm={confirmStatusChange}
        onCancel={() => { setShowStatusDialog(false); setPendingStatus(null); }}
        type="info"
        icon="refresh-circle"
        loading={statusMutation.isPending}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.backgroundSecondary,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.lg,
  },
  errorIconWrapper: {
    width: 72,
    height: 72,
    borderRadius: theme.borderRadius.full,
    backgroundColor: Colors.light.error + '18',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.md,
  },
  errorText: {
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    color: Colors.light.text,
    textAlign: 'center',
    marginBottom: theme.spacing.xs,
  },
  errorSubtext: {
    fontSize: theme.fontSize.sm,
    color: Colors.light.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
    paddingHorizontal: theme.spacing.xl,
  },
  errorButton: {
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.sm + 4,
    borderRadius: theme.borderRadius.xl,
    backgroundColor: Colors.light.error + '18',
    borderWidth: 1,
    borderColor: Colors.light.error + '40',
  },
  errorButtonText: {
    color: Colors.light.error,
    fontSize: theme.fontSize.base,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  // Status
  statusBlock: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm + 4,
    gap: theme.spacing.xs,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  statusHint: {
    fontSize: theme.fontSize.xs,
    color: Colors.light.textSecondary,
    lineHeight: 18,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 5,
    borderRadius: theme.borderRadius.sm,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  statusActions: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  statusActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
  },
  statusActionText: {
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
  },
  // Cards
  card: {
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    padding: theme.spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTitle: {
    fontSize: theme.fontSize.xxs,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: Colors.light.textTertiary,
    marginBottom: theme.spacing.md,
  },
  // Info rows
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  infoIconWrapper: {
    width: 40,
    height: 40,
    borderRadius: theme.borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.spacing.sm,
    flexShrink: 0,
  },
  infoContent: {
    flex: 1,
    minWidth: 0,
  },
  infoLabel: {
    fontSize: theme.fontSize.xxs,
    fontWeight: '600',
    letterSpacing: 0.4,
    color: Colors.light.textTertiary,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: theme.fontSize.base,
    fontWeight: '600',
    color: Colors.light.text,
  },
  timesRow: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    marginTop: theme.spacing.md,
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
  },
  timeBlock: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  // Custos
  costRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  costLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    minWidth: 0,
    flex: 1,
  },
  costLabel: {
    fontSize: theme.fontSize.sm,
    color: Colors.light.textSecondary,
    flexShrink: 1,
  },
  costValue: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    color: Colors.light.text,
    flexShrink: 0,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: theme.spacing.sm + 4,
    marginTop: theme.spacing.xs,
  },
  totalLabel: {
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: Colors.light.textSecondary,
  },
  totalValue: {
    fontSize: theme.fontSize.xl,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  // Observações
  notesText: {
    fontSize: theme.fontSize.sm,
    color: Colors.light.text,
    lineHeight: 22,
  },
  // Analytics
  analyticsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  analyticsCell: {
    flex: 1,
    minWidth: '40%',
    backgroundColor: Colors.light.backgroundSecondary,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.sm + 2,
    alignItems: 'center',
    gap: 4,
  },
  analyticsCellLabel: {
    fontSize: theme.fontSize.xxs,
    fontWeight: '600',
    letterSpacing: 0.3,
    color: Colors.light.textTertiary,
    textTransform: 'uppercase',
  },
  analyticsCellValue: {
    fontSize: theme.fontSize.lg,
    fontWeight: '800',
    color: Colors.light.text,
    letterSpacing: -0.5,
  },
  analyticsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
  },
  analyticsRowText: {
    fontSize: theme.fontSize.xs,
    color: Colors.light.textSecondary,
    flex: 1,
  },
  // Metadados
  metaSection: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    marginBottom: theme.spacing.xxl,
    gap: 4,
  },
  metaText: {
    fontSize: theme.fontSize.xxs,
    color: Colors.light.textTertiary,
  },
});
