import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
} from 'react-native';

import { Text, ActivityIndicator } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import api from '@/services/api';
import { formatCurrency } from '@/utils/format';
import { Colors, theme } from '@/constants/Colors';

interface Sale {
  id: number;
  sale_number: string;
  total_amount: number;
  created_at: string;
  customer_id?: number;
  seller_id: number;
  discount_amount: number;
  status: string;
}

interface SalesByPeriodResponse {
  sales: Sale[];
  summary: {
    period: string;
    total_sales: number;
    total_count: number;
    average_ticket: number;
  };
  pagination: {
    skip: number;
    limit: number;
    total: number;
  };
}

const getSalesByPeriod = async (year: number, month: number): Promise<SalesByPeriodResponse> => {
  const { data } = await api.get<SalesByPeriodResponse>('/sales/reports/by-period', {
    params: { year, month },
  });
  return data;
};

export default function SalesPeriodScreen() {
  const router = useRouter();
  const today = new Date();
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth() + 1);

  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['sales-by-period', selectedYear, selectedMonth],
    queryFn: () => getSalesByPeriod(selectedYear, selectedMonth),
  });

  const months = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  const goToPreviousMonth = () => {
    if (selectedMonth === 1) {
      setSelectedMonth(12);
      setSelectedYear(selectedYear - 1);
    } else {
      setSelectedMonth(selectedMonth - 1);
    }
  };

  const goToNextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedMonth(1);
      setSelectedYear(selectedYear + 1);
    } else {
      setSelectedMonth(selectedMonth + 1);
    }
  };

  const isCurrentMonth = () => {
    const now = new Date();
    return selectedYear === now.getFullYear() && selectedMonth === (now.getMonth() + 1);
  };

  const getMonthName = (month: number) => months[month - 1];

  const renderSaleItem = ({ item }: { item: Sale }) => (
    <TouchableOpacity
      onPress={() => router.push(`/sales/${item.id}` as any)}
      style={styles.saleCard}
    >
      <View style={styles.saleRow}>
        <View style={styles.saleInfo}>
          <Text style={styles.saleNumber}>{item.sale_number}</Text>
          <Text style={styles.saleDate}>
            {new Date(item.created_at).toLocaleDateString('pt-BR', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        </View>
        <View style={styles.salePrice}>
          <Text style={styles.saleAmount}>{formatCurrency(item.total_amount)}</Text>
          <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} />
        </View>
      </View>
    </TouchableOpacity>
  );

  const ListHeader = () => (
    <>
      {/* Cards de Resumo */}
      {data && (
        <View style={styles.summaryContainer}>
          {/* Card Total de Vendas */}
          <View style={styles.summaryCardWrapper}>
            <LinearGradient
              colors={[Colors.light.primary, Colors.light.secondary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.summaryCard}
            >
              <Ionicons name="cash-outline" size={32} color="#fff" />
              <Text style={styles.summaryValue}>
                {formatCurrency(data.summary.total_sales)}
              </Text>
              <Text style={styles.summaryLabel}>Total de Vendas</Text>
            </LinearGradient>
          </View>

          {/* Card Vendas Realizadas */}
          <View style={styles.summaryCardWrapper}>
            <LinearGradient
              colors={['#11998e', '#38ef7d']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.summaryCard}
            >
              <Ionicons name="cart-outline" size={32} color="#fff" />
              <Text style={styles.summaryValue}>{data.summary.total_count}</Text>
              <Text style={styles.summaryLabel}>Vendas Realizadas</Text>
            </LinearGradient>
          </View>

          {/* Card Ticket Médio */}
          <View style={styles.summaryCardWrapper}>
            <LinearGradient
              colors={['#fa709a', '#fee140']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.summaryCard}
            >
              <Ionicons name="stats-chart-outline" size={32} color="#fff" />
              <Text style={styles.summaryValue}>
                {formatCurrency(data.summary.average_ticket)}
              </Text>
              <Text style={styles.summaryLabel}>Ticket Médio</Text>
            </LinearGradient>
          </View>
        </View>
      )}

      {/* Título da Lista - REMOVIDO, já está no header */}
    </>
  );

  const ListEmpty = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="cart-outline" size={64} color={theme.colors.textSecondary} />
      <Text style={styles.emptyText}>Nenhuma venda neste período</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header com Gradiente */}
      <View style={styles.headerContainer}>
        <LinearGradient
          colors={[Colors.light.primary, Colors.light.secondary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerGradient}
        >
          <View style={styles.headerContent}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
            <View style={styles.headerInfo}>
              <Text style={styles.greeting}>Vendas por Período</Text>
              <Text style={styles.headerSubtitle}>
                {data?.pagination.total || 0} {data?.pagination.total === 1 ? 'venda' : 'vendas'}
              </Text>
            </View>
          </View>

          {/* Seletor de Mês no Header */}
          <View style={styles.monthSelector}>
            <TouchableOpacity 
              onPress={goToPreviousMonth}
              style={styles.monthButton}
            >
              <Ionicons name="chevron-back" size={28} color="#fff" />
            </TouchableOpacity>
            
            <Text style={styles.monthText}>
              {getMonthName(selectedMonth)} {selectedYear}
            </Text>
            
            <TouchableOpacity 
              onPress={goToNextMonth}
              style={styles.monthButton}
              disabled={isCurrentMonth()}
            >
              <Ionicons 
                name="chevron-forward" 
                size={28} 
                color={isCurrentMonth() ? 'rgba(255,255,255,0.3)' : '#fff'} 
              />
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </View>

      {/* Lista de Vendas */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={48} color={theme.colors.error} />
          <Text style={styles.errorText}>Erro ao carregar vendas</Text>
          <TouchableOpacity onPress={() => refetch()} style={styles.retryButton}>
            <Text style={styles.retryText}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={data?.sales || []}
          renderItem={renderSaleItem}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={ListEmpty}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              colors={[theme.colors.primary]}
              tintColor={theme.colors.primary}
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  headerContainer: {
    marginBottom: 0,
  },
  headerGradient: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.xl + 32,
    paddingBottom: theme.spacing.lg,
    borderBottomLeftRadius: theme.borderRadius.xl,
    borderBottomRightRadius: theme.borderRadius.xl,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.md,
  },
  backButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.md,
  },
  headerInfo: {
    flex: 1,
  },
  greeting: {
    fontSize: theme.fontSize.xxl,
    fontWeight: '700',
    color: '#fff',
    marginBottom: theme.spacing.xs,
  },
  headerSubtitle: {
    fontSize: theme.fontSize.md,
    color: '#fff',
    opacity: 0.9,
  },
  monthSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: theme.borderRadius.lg,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    marginTop: theme.spacing.xs,
  },
  monthButton: {
    padding: 4,
  },
  monthText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  summaryContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.xl,
  },
  summaryCardWrapper: {
    width: '48%',
    marginBottom: theme.spacing.md,
  },
  summaryCard: {
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 140,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginTop: theme.spacing.sm,
  },
  summaryLabel: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: theme.spacing.xs,
    textAlign: 'center',
  },
  listContent: {
    paddingBottom: theme.spacing.xl,
  },
  saleCard: {
    backgroundColor: '#fff',
    marginHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  saleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  saleInfo: {
    flex: 1,
  },
  saleNumber: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  saleDate: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  salePrice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  saleAmount: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.xl,
  },
  errorText: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.md,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xl,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
  },
  retryText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.xxl * 2,
  },
  emptyText: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.lg,
  },
});
