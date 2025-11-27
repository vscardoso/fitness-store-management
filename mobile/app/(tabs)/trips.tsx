import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import FAB from '@/components/FAB';

import { getTrips } from '@/services/tripService';
import { Trip, TripStatus } from '@/types';
import { Colors } from '@/constants/Colors';
import { formatCurrency, formatDate } from '@/utils/format';

export default function TripsScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const { data: trips = [], isLoading, refetch } = useQuery({
    queryKey: ['trips'],
    queryFn: () => getTrips({ limit: 100 }),
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
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

  const renderTripCard = ({ item }: { item: Trip }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/trips/${item.id}`)}
      activeOpacity={0.7}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <Text style={styles.cardCode}>{item.trip_code}</Text>
          <Text style={styles.cardDestination}>{item.destination}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
          <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
            {getStatusText(item.status)}
          </Text>
        </View>
      </View>

      <View style={styles.cardBody}>
        <View style={styles.infoRow}>
          <Ionicons name="calendar-outline" size={16} color={Colors.light.textSecondary} />
          <Text style={styles.infoText}>{formatDate(item.trip_date)}</Text>
        </View>

        <View style={styles.infoRow}>
          <Ionicons name="cash-outline" size={16} color={Colors.light.textSecondary} />
          <Text style={styles.infoText}>
            Custo: {formatCurrency(item.travel_cost_total)}
          </Text>
        </View>
      </View>

      {item.notes && (
        <View style={styles.cardFooter}>
          <Text style={styles.notesText} numberOfLines={2}>
            {item.notes}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );

  // KPIs
  const totalTrips = trips.length;
  const completedTrips = trips.filter(t => t.status === TripStatus.COMPLETED).length;
  const totalCost = trips.reduce((sum, t) => sum + t.travel_cost_total, 0);
  const avgCost = totalTrips > 0 ? totalCost / totalTrips : 0;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Viagens</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* KPIs */}
        <View style={styles.kpisContainer}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiValue}>{totalTrips}</Text>
            <Text style={styles.kpiLabel}>Total</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiValue}>{completedTrips}</Text>
            <Text style={styles.kpiLabel}>Concluídas</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiValue}>{formatCurrency(avgCost)}</Text>
            <Text style={styles.kpiLabel}>Custo Médio</Text>
          </View>
        </View>

        {/* Lista */}
        <FlatList
          data={trips}
          renderItem={renderTripCard}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[Colors.light.primary]}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="car-outline" size={64} color={Colors.light.textSecondary} />
              <Text style={styles.emptyText}>Nenhuma viagem cadastrada</Text>
              <Text style={styles.emptySubtext}>
                Toque no botão + para adicionar uma nova viagem
              </Text>
            </View>
          }
        />

        {/* FAB - Botão Adicionar */}
        <FAB directRoute="/trips/add" />
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: Colors.light.primary,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  kpisContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 12,
    marginTop: 16,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  kpiValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.light.primary,
    marginBottom: 4,
  },
  kpiLabel: {
    fontSize: 12,
    color: Colors.light.textSecondary,
  },
  listContainer: {
    padding: 16,
    paddingTop: 8,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  cardHeaderLeft: {
    flex: 1,
  },
  cardCode: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.light.text,
    marginBottom: 4,
  },
  cardDestination: {
    fontSize: 14,
    color: Colors.light.textSecondary,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  cardBody: {
    gap: 8,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoText: {
    fontSize: 14,
    color: Colors.light.textSecondary,
  },
  cardFooter: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  notesText: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    fontStyle: 'italic',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.light.text,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    marginTop: 8,
    textAlign: 'center',
  },
});
