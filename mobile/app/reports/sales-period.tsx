import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Card, Divider, ActivityIndicator } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import api from '@/services/api';
import { formatCurrency } from '@/utils/format';

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

  const { data, isLoading, error } = useQuery({
    queryKey: ['sales-by-period', selectedYear, selectedMonth],
    queryFn: () => getSalesByPeriod(selectedYear, selectedMonth),
  });

  const months = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  const handlePreviousMonth = () => {
    if (selectedMonth === 1) {
      setSelectedMonth(12);
      setSelectedYear(selectedYear - 1);
    } else {
      setSelectedMonth(selectedMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedMonth(1);
      setSelectedYear(selectedYear + 1);
    } else {
      setSelectedMonth(selectedMonth + 1);
    }
  };

  const renderSaleItem = ({ item }: { item: Sale }) => (
    <TouchableOpacity
      onPress={() => router.push(`/sales/${item.id}` as any)}
      style={styles.saleCard}
    >
      <View style={styles.saleHeader}>
        <Text style={styles.saleNumber}>{item.sale_number}</Text>
        <Text style={styles.saleAmount}>{formatCurrency(item.total_amount)}</Text>
      </View>
      <Text style={styles.saleDate}>
        {new Date(item.created_at).toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })}
      </Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Vendas por Período</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content}>
        {/* Seletor de Período */}
        <Card style={styles.periodSelector}>
          <View style={styles.periodHeader}>
            <TouchableOpacity onPress={handlePreviousMonth} style={styles.navButton}>
              <Ionicons name="chevron-back" size={24} color="#667eea" />
            </TouchableOpacity>
            
            <View style={styles.periodDisplay}>
              <Text style={styles.periodText}>
                {months[selectedMonth - 1]} {selectedYear}
              </Text>
            </View>

            <TouchableOpacity onPress={handleNextMonth} style={styles.navButton}>
              <Ionicons name="chevron-forward" size={24} color="#667eea" />
            </TouchableOpacity>
          </View>
        </Card>

        {/* Resumo do Período */}
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#667eea" />
          </View>
        ) : error ? (
          <Card style={styles.errorCard}>
            <Text style={styles.errorText}>Erro ao carregar dados</Text>
          </Card>
        ) : data ? (
          <>
            <View style={styles.summaryGrid}>
              <LinearGradient
                colors={['#667eea', '#764ba2']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.summaryCard}
              >
                <Ionicons name="cash-outline" size={28} color="#fff" />
                <Text style={styles.summaryValue}>
                  {formatCurrency(data.summary.total_sales)}
                </Text>
                <Text style={styles.summaryLabel}>Total de Vendas</Text>
              </LinearGradient>

              <LinearGradient
                colors={['#11998e', '#38ef7d']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.summaryCard}
              >
                <Ionicons name="cart-outline" size={28} color="#fff" />
                <Text style={styles.summaryValue}>{data.summary.total_count}</Text>
                <Text style={styles.summaryLabel}>Vendas Realizadas</Text>
              </LinearGradient>

              <LinearGradient
                colors={['#fa709a', '#fee140']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.summaryCard}
              >
                <Ionicons name="stats-chart-outline" size={28} color="#fff" />
                <Text style={styles.summaryValue}>
                  {formatCurrency(data.summary.average_ticket)}
                </Text>
                <Text style={styles.summaryLabel}>Ticket Médio</Text>
              </LinearGradient>
            </View>

            {/* Lista de Vendas */}
            <Card style={styles.salesListCard}>
              <Text style={styles.salesListTitle}>
                Vendas do Período ({data.sales.length})
              </Text>
              <Divider style={styles.divider} />
              {data.sales.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Ionicons name="document-outline" size={48} color="#ccc" />
                  <Text style={styles.emptyText}>Nenhuma venda neste período</Text>
                </View>
              ) : (
                <FlatList
                  data={data.sales}
                  renderItem={renderSaleItem}
                  keyExtractor={(item) => item.id.toString()}
                  scrollEnabled={false}
                />
              )}
            </Card>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f7fa',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  periodSelector: {
    marginBottom: 16,
    backgroundColor: '#fff',
    elevation: 2,
  },
  periodHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  navButton: {
    padding: 8,
  },
  periodDisplay: {
    flex: 1,
    alignItems: 'center',
  },
  periodText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  summaryCard: {
    width: '48%',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    alignItems: 'center',
    elevation: 3,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 8,
  },
  summaryLabel: {
    fontSize: 12,
    color: '#fff',
    marginTop: 4,
    textAlign: 'center',
  },
  salesListCard: {
    backgroundColor: '#fff',
    padding: 16,
    elevation: 2,
  },
  salesListTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  divider: {
    marginBottom: 12,
  },
  saleCard: {
    padding: 12,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#667eea',
  },
  saleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  saleNumber: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  saleAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#667eea',
  },
  saleDate: {
    fontSize: 12,
    color: '#666',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
  },
  loadingContainer: {
    paddingVertical: 48,
    alignItems: 'center',
  },
  errorCard: {
    padding: 16,
    backgroundColor: '#ffebee',
  },
  errorText: {
    color: '#c62828',
    textAlign: 'center',
  },
});
