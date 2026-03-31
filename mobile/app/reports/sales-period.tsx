import React, { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
} from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import { useQuery } from '@tanstack/react-query';
import api from '@/services/api';
import { formatCurrency } from '@/utils/format';
import { Colors, theme, VALUE_COLORS } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import PageHeader from '@/components/layout/PageHeader';
import useBackToList from '@/hooks/useBackToList';

// ─── Tipos ────────────────────────────────────────────────────────────────────

type SaleStatus = 'pending' | 'completed' | 'cancelled' | 'refunded' | 'partially_refunded';

const ESTORNO_STATUSES: SaleStatus[] = ['cancelled', 'refunded', 'partially_refunded'];

interface Sale {
  id: number;
  sale_number: string;
  total_amount: number;
  created_at: string;
  status: SaleStatus;
  customer_name?: string;
  payment_method?: string;
}

interface SalesByPeriodResponse {
  sales: Sale[];
  summary: {
    period: string;
    total_sales: number;
    total_count: number;
    average_ticket: number;
    estorno_count: number;
    estorno_amount: number;
    net_sales: number;
  };
  pagination: { skip: number; limit: number; total: number };
}

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const getSalesByPeriod = async (year: number, month: number) => {
  const { data } = await api.get<SalesByPeriodResponse>('/sales/reports/by-period', {
    params: { year, month },
  });
  return data;
};

function isEstorno(status: SaleStatus) {
  return ESTORNO_STATUSES.includes(status);
}

function statusLabel(status: SaleStatus): string {
  switch (status) {
    case 'cancelled':          return 'Cancelada';
    case 'refunded':           return 'Estornada';
    case 'partially_refunded': return 'Est. Parcial';
    case 'pending':            return 'Pendente';
    default:                   return '';
  }
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function SalesPeriodScreen() {
  const router = useRouter();
  const { goBack } = useBackToList('/(tabs)');
  const brandingColors = useBrandingColors();
  const today = new Date();

  const [selectedYear, setSelectedYear]   = useState(today.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth() + 1);

  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['sales-by-period', selectedYear, selectedMonth],
    queryFn: () => getSalesByPeriod(selectedYear, selectedMonth),
  });

  // Animação de entrada
  const headerOpacity     = useSharedValue(0);
  const headerScale       = useSharedValue(0.92);
  const contentOpacity    = useSharedValue(0);
  const contentTranslateY = useSharedValue(24);

  const playAnimation = useCallback(() => {
    headerOpacity.value     = 0;
    headerScale.value       = 0.92;
    contentOpacity.value    = 0;
    contentTranslateY.value = 24;

    headerOpacity.value = withTiming(1, { duration: 450, easing: Easing.out(Easing.quad) });
    headerScale.value   = withSpring(1, { damping: 14, stiffness: 180 });
    const t = setTimeout(() => {
      contentOpacity.value    = withTiming(1, { duration: 380 });
      contentTranslateY.value = withSpring(0, { damping: 18, stiffness: 200 });
    }, 160);
    return t;
  }, []);

  useFocusEffect(useCallback(() => {
    const t = playAnimation();
    return () => clearTimeout(t);
  }, [playAnimation]));

  const headerAnimStyle = useAnimatedStyle(() => ({
    opacity: headerOpacity.value,
    transform: [{ scale: headerScale.value }],
  }));
  const contentAnimStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ translateY: contentTranslateY.value }],
  }));

  // Navegação de meses
  const isCurrentMonth = () =>
    selectedYear === today.getFullYear() && selectedMonth === (today.getMonth() + 1);

  const goToPrev = () => {
    if (selectedMonth === 1) { setSelectedMonth(12); setSelectedYear(y => y - 1); }
    else setSelectedMonth(m => m - 1);
  };
  const goToNext = () => {
    if (selectedMonth === 12) { setSelectedMonth(1); setSelectedYear(y => y + 1); }
    else setSelectedMonth(m => m + 1);
  };

  // ─── Item da lista ───────────────────────────────────────────────────────────
  const renderSaleItem = ({ item }: { item: Sale }) => {
    const estorno = isEstorno(item.status);
    return (
      <TouchableOpacity
        onPress={() => router.push(`/sales/${item.id}` as any)}
        style={[styles.saleCard, estorno && styles.saleCardEstorno]}
        activeOpacity={0.75}
      >
        <View style={styles.saleRow}>
          {/* Ícone */}
          <View style={[
            styles.saleIconBox,
            { backgroundColor: estorno ? Colors.light.errorLight : brandingColors.primary + '15' },
          ]}>
            <Ionicons
              name={estorno ? 'arrow-undo' : 'receipt-outline'}
              size={18}
              color={estorno ? VALUE_COLORS.negative : brandingColors.primary}
            />
          </View>

          {/* Info — ocupa o espaço disponível */}
          <View style={styles.saleInfo}>
            <Text style={styles.saleNumber} numberOfLines={1}>{item.sale_number}</Text>
            <Text style={styles.saleDate}>
              {new Date(item.created_at).toLocaleDateString('pt-BR', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
              })}
            </Text>
            {item.customer_name ? (
              <Text style={styles.saleCustomer} numberOfLines={1}>{item.customer_name}</Text>
            ) : null}
          </View>

          {/* Coluna direita: valor + badge + chevron — sem sobreposição */}
          <View style={styles.salePriceCol}>
            <Text style={[styles.saleAmount, estorno && styles.saleAmountEstorno]}>
              {estorno ? '−' : ''}{formatCurrency(item.total_amount)}
            </Text>
            {estorno ? (
              <View style={styles.estornoBadge}>
                <Text style={styles.estornoBadgeText}>{statusLabel(item.status)}</Text>
              </View>
            ) : (
              <Ionicons name="chevron-forward" size={14} color={Colors.light.textTertiary} />
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  // ─── Cabeçalho da lista ───────────────────────────────────────────────────────
  const ListHeader = () => {
    const s = data?.summary;

    return (
      <View style={styles.listHeaderContainer}>
        {/* ── Seletor de mês no corpo da página ── */}
        <View style={styles.monthSelector}>
          <TouchableOpacity
            onPress={goToPrev}
            style={styles.monthBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="chevron-back" size={22} color={Colors.light.text} />
          </TouchableOpacity>

          <View style={styles.monthLabelContainer}>
            <Text style={styles.monthText}>{MONTHS[selectedMonth - 1]} {selectedYear}</Text>
            {s && (
              <Text style={styles.monthSubtext}>
                {s.total_count} venda{s.total_count !== 1 ? 's' : ''} efetivada{s.total_count !== 1 ? 's' : ''}
              </Text>
            )}
          </View>

          <TouchableOpacity
            onPress={goToNext}
            style={styles.monthBtn}
            disabled={isCurrentMonth()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons
              name="chevron-forward"
              size={22}
              color={isCurrentMonth() ? Colors.light.textTertiary : Colors.light.text}
            />
          </TouchableOpacity>
        </View>

        {/* ── Cards de resumo — grade 2×2 uniforme ── */}
        {s && (
          <View style={styles.summaryGrid}>
            {/* Receita Líquida */}
            <SummaryCard
              icon="trending-up"
              iconBg={brandingColors.primary + '18'}
              iconColor={brandingColors.primary}
              label="Receita Líquida"
              value={formatCurrency(s.net_sales)}
              valueColor={VALUE_COLORS.positive}
              note={s.estorno_count > 0 ? `bruto ${formatCurrency(s.total_sales)}` : undefined}
            />

            {/* Ticket Médio */}
            <SummaryCard
              icon="stats-chart-outline"
              iconBg={Colors.light.infoLight}
              iconColor={Colors.light.info}
              label="Ticket Médio"
              value={formatCurrency(s.average_ticket)}
              valueColor={Colors.light.info}
            />

            {/* Vendas */}
            <SummaryCard
              icon="cart-outline"
              iconBg={VALUE_COLORS.positive + '18'}
              iconColor={VALUE_COLORS.positive}
              label="Vendas"
              value={String(s.total_count)}
              valueColor={VALUE_COLORS.positive}
            />

            {/* Estornos */}
            <SummaryCard
              icon="arrow-undo"
              iconBg={VALUE_COLORS.negative + '18'}
              iconColor={VALUE_COLORS.negative}
              label="Estornos"
              value={String(s.estorno_count)}
              valueColor={s.estorno_count > 0 ? VALUE_COLORS.negative : Colors.light.textSecondary}
              note={s.estorno_count > 0 ? `−${formatCurrency(s.estorno_amount)}` : undefined}
              noteColor={VALUE_COLORS.negative}
              danger={s.estorno_count > 0}
            />
          </View>
        )}

        <Text style={styles.listSectionTitle}>Movimentações</Text>
      </View>
    );
  };

  const ListEmpty = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="cart-outline" size={56} color={Colors.light.textTertiary} />
      <Text style={styles.emptyText}>Nenhuma venda neste período</Text>
    </View>
  );

  const totalLabel = data
    ? `${data.pagination.total} movimentaç${data.pagination.total === 1 ? 'ão' : 'ões'}`
    : '';

  return (
    <View style={styles.container}>
      <Animated.View style={headerAnimStyle}>
        <PageHeader
          title="Vendas por Período"
          subtitle={totalLabel}
          showBackButton
          onBack={goBack}
        />
      </Animated.View>

      <Animated.View style={[{ flex: 1 }, contentAnimStyle]}>
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <Ionicons name="hourglass-outline" size={40} color={brandingColors.primary} />
            <Text style={styles.loadingText}>Carregando...</Text>
          </View>
        ) : error ? (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle-outline" size={48} color={VALUE_COLORS.negative} />
            <Text style={styles.errorText}>Erro ao carregar vendas</Text>
            <TouchableOpacity
              onPress={() => refetch()}
              style={[styles.retryButton, { backgroundColor: brandingColors.primary }]}
            >
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
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={isRefetching}
                onRefresh={refetch}
                colors={[brandingColors.primary]}
                tintColor={brandingColors.primary}
              />
            }
          />
        )}
      </Animated.View>
    </View>
  );
}

// ─── Card de resumo reutilizável ──────────────────────────────────────────────

interface SummaryCardProps {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
  valueColor: string;
  note?: string;
  noteColor?: string;
  danger?: boolean;
}

function SummaryCard({ icon, iconBg, iconColor, label, value, valueColor, note, noteColor, danger }: SummaryCardProps) {
  return (
    <View style={[styles.summaryCard, danger && styles.summaryCardDanger]}>
      <View style={[styles.summaryCardIcon, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>
      <Text style={styles.summaryCardLabel} numberOfLines={1}>{label}</Text>
      <Text style={[styles.summaryCardValue, { color: valueColor }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {note ? (
        <Text style={[styles.summaryCardNote, noteColor ? { color: noteColor } : undefined]} numberOfLines={1}>
          {note}
        </Text>
      ) : null}
    </View>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.backgroundSecondary,
  },

  // ── Cabeçalho da lista ──
  listHeaderContainer: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.lg,
    gap: theme.spacing.md,
  },

  // Seletor de mês no corpo
  monthSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    paddingVertical: theme.spacing.sm + 4,
    paddingHorizontal: theme.spacing.md,
    ...theme.shadows.sm,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  monthBtn: { padding: 4 },
  monthLabelContainer: { alignItems: 'center', gap: 2 },
  monthText: {
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.bold,
    color: Colors.light.text,
  },
  monthSubtext: {
    fontSize: theme.fontSize.xs,
    color: Colors.light.textSecondary,
  },

  // Grade 2×2 — todos os cards com mesma flex basis
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  summaryCard: {
    // Cada card ocupa ~50% - gap
    width: '47.5%',
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.md,
    ...theme.shadows.sm,
    borderWidth: 1,
    borderColor: Colors.light.border,
    gap: 4,
  },
  summaryCardDanger: {
    borderColor: VALUE_COLORS.negative + '40',
    backgroundColor: '#FFF5F5',
  },
  summaryCardIcon: {
    width: 34,
    height: 34,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  summaryCardLabel: {
    fontSize: theme.fontSize.xxs,
    fontWeight: theme.fontWeight.semibold,
    color: Colors.light.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  summaryCardValue: {
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.extrabold,
    letterSpacing: -0.5,
  },
  summaryCardNote: {
    fontSize: theme.fontSize.xxs,
    color: Colors.light.textTertiary,
  },

  listSectionTitle: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.semibold,
    color: Colors.light.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: theme.spacing.xs,
  },

  // ── Item de venda ──
  listContent: {
    paddingBottom: theme.spacing.xxl,
  },
  saleCard: {
    backgroundColor: Colors.light.card,
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.md,
    ...theme.shadows.sm,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  saleCardEstorno: {
    borderColor: VALUE_COLORS.negative + '30',
    backgroundColor: '#FFF8F8',
  },
  saleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  saleIconBox: {
    width: 40,
    height: 40,
    borderRadius: theme.borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  saleInfo: {
    flex: 1,
    gap: 2,
    minWidth: 0, // garante que o texto trunca e não empurra o valor
  },
  saleNumber: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold,
    color: Colors.light.text,
  },
  saleDate: {
    fontSize: theme.fontSize.xs,
    color: Colors.light.textSecondary,
  },
  saleCustomer: {
    fontSize: theme.fontSize.xs,
    color: Colors.light.textTertiary,
  },

  // Coluna direita — valor + badge OU chevron, empilhados
  salePriceCol: {
    alignItems: 'flex-end',
    gap: 6,
    flexShrink: 0,
  },
  saleAmount: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.extrabold,
    color: VALUE_COLORS.positive,
  },
  saleAmountEstorno: {
    color: VALUE_COLORS.negative,
  },
  estornoBadge: {
    backgroundColor: VALUE_COLORS.negative + '18',
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  estornoBadgeText: {
    fontSize: theme.fontSize.xxs,
    fontWeight: theme.fontWeight.bold,
    color: VALUE_COLORS.negative,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },

  // ── Loading / Error / Empty ──
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.md,
  },
  loadingText: {
    color: Colors.light.textSecondary,
    fontSize: theme.fontSize.md,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  errorText: {
    fontSize: theme.fontSize.base,
    color: Colors.light.textSecondary,
    textAlign: 'center',
  },
  retryButton: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xl,
    borderRadius: theme.borderRadius.lg,
  },
  retryText: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.semibold,
    color: '#fff',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.xxl * 2,
    gap: theme.spacing.md,
  },
  emptyText: {
    fontSize: theme.fontSize.base,
    color: Colors.light.textSecondary,
  },
});
