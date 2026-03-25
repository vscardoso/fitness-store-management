import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import { Text, Card, ActivityIndicator } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import PageHeader from '@/components/layout/PageHeader';
import { getMonthlyResult } from '@/services/expenseService';
import { formatCurrency } from '@/utils/format';
import { Colors, theme } from '@/constants/Colors';
import type { MonthlyResult, ExpenseByCategoryItem } from '@/types/expense';

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export default function MonthlyResultScreen() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['monthly-result', year, month],
    queryFn: () => getMonthlyResult(year, month),
  });

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    const ny = month === 12 ? year + 1 : year;
    const nm = month === 12 ? 1 : month + 1;
    if (ny > now.getFullYear() || (ny === now.getFullYear() && nm > now.getMonth() + 1)) return;
    setYear(ny); setMonth(nm);
  };

  const canGoNext = !(year === now.getFullYear() && month === now.getMonth() + 1);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <PageHeader title="Resultado do Mês" showBackButton />

      {/* Navegação de mês */}
      <View style={styles.monthNav}>
        <TouchableOpacity onPress={prevMonth} style={styles.navBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.light.primary} />
        </TouchableOpacity>
        <Text variant="titleLarge" style={styles.monthLabel}>
          {MONTHS[month - 1]} {year}
        </Text>
        <TouchableOpacity onPress={nextMonth} style={styles.navBtn} disabled={!canGoNext}>
          <Ionicons name="chevron-forward" size={24} color={canGoNext ? Colors.light.primary : Colors.light.border} />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={Colors.light.primary} />
        </View>
      ) : data ? (
        <ScrollView contentContainerStyle={styles.content}>
          <PLCard data={data} />
          <ExpenseBreakdown items={data.expenses_by_category} total={data.total_expenses} />
        </ScrollView>
      ) : null}
    </View>
  );
}

function PLCard({ data }: { data: MonthlyResult }) {
  const netPositive = data.net_profit >= 0;
  return (
    <Card style={styles.plCard}>
      <View style={styles.plContent}>
        <PLRow label="Receita Bruta" value={data.revenue} color={Colors.light.success} icon="trending-up" />
        <PLRow label={`CMV (custo mercadoria)`} value={-data.cmv} color={Colors.light.warning} icon="cube-outline" isNegative />
        <View style={styles.divider} />
        <PLRow label="Lucro Bruto" value={data.gross_profit} color={Colors.light.primary} icon="analytics-outline" bold />
        <Text style={styles.marginLabel}>{Number(data.gross_margin_pct).toFixed(1)}% de margem bruta</Text>
        <PLRow label="Despesas Operacionais" value={-data.total_expenses} color={Colors.light.error} icon="receipt-outline" isNegative />
        <View style={styles.divider} />
        <View style={[styles.netRow, { backgroundColor: netPositive ? Colors.light.successLight ?? '#E8F5E9' : '#FFEBEE' }]}>
          <Ionicons
            name={netPositive ? 'checkmark-circle' : 'warning'}
            size={24}
            color={netPositive ? Colors.light.success : Colors.light.error}
          />
          <View style={{ flex: 1 }}>
            <Text style={[styles.netLabel, { color: netPositive ? Colors.light.success : Colors.light.error }]}>
              Lucro Líquido
            </Text>
            <Text style={[styles.netMargin, { color: netPositive ? Colors.light.success : Colors.light.error }]}>
              {Number(data.net_margin_pct).toFixed(1)}% sobre receita
            </Text>
          </View>
          <Text style={[styles.netValue, { color: netPositive ? Colors.light.success : Colors.light.error }]}>
            {formatCurrency(data.net_profit)}
          </Text>
        </View>
      </View>
    </Card>
  );
}

function PLRow({
  label, value, color, icon, bold, isNegative,
}: {
  label: string;
  value: number;
  color: string;
  icon: string;
  bold?: boolean;
  isNegative?: boolean;
}) {
  return (
    <View style={styles.plRow}>
      <Ionicons name={icon as any} size={18} color={color} />
      <Text style={[styles.plRowLabel, bold && styles.plRowBold]}>{label}</Text>
      <Text style={[styles.plRowValue, bold && styles.plRowBold, { color }]}>
        {isNegative ? '-' : ''}{formatCurrency(Math.abs(value))}
      </Text>
    </View>
  );
}

function ExpenseBreakdown({ items, total }: { items: ExpenseByCategoryItem[]; total: number }) {
  if (items.length === 0) return null;
  return (
    <Card style={[styles.plCard, { marginTop: 12 }]}>
      <View style={styles.plContent}>
        <Text variant="titleSmall" style={styles.breakdownTitle}>Despesas por Categoria</Text>
        {items.map((item) => {
          const pct = total > 0 ? (item.total / total) * 100 : 0;
          return (
            <View key={item.category_id} style={styles.catRow}>
              <View style={[styles.catDot, { backgroundColor: item.color }]}>
                <Ionicons name={item.icon as any} size={14} color="#fff" />
              </View>
              <Text style={styles.catName}>{item.category}</Text>
              <View style={styles.catRight}>
                <Text style={styles.catPct}>{pct.toFixed(0)}%</Text>
                <Text style={styles.catValue}>{formatCurrency(item.total)}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.backgroundSecondary },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  navBtn: { padding: 8 },
  monthLabel: { fontWeight: '700', color: Colors.light.text, minWidth: 180, textAlign: 'center' },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 16, paddingBottom: 40 },
  plCard: { borderRadius: theme.borderRadius.lg, elevation: 2, borderWidth: 1, borderColor: Colors.light.border },
  plContent: { padding: 16, gap: 12 },
  plRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  plRowLabel: { flex: 1, fontSize: 14, color: Colors.light.text },
  plRowValue: { fontSize: 14, fontWeight: '600' },
  plRowBold: { fontWeight: '700', fontSize: 15 },
  divider: { height: 1, backgroundColor: Colors.light.border, marginVertical: 4 },
  marginLabel: { fontSize: 11, color: Colors.light.textSecondary, marginTop: -8, marginLeft: 28 },
  netRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: theme.borderRadius.lg,
    marginTop: 4,
  },
  netLabel: { fontWeight: '700', fontSize: 15 },
  netMargin: { fontSize: 11, marginTop: 2 },
  netValue: { fontWeight: 'bold', fontSize: 20 },
  breakdownTitle: { fontWeight: '700', color: Colors.light.text, marginBottom: 4 },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  catDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  catName: { flex: 1, fontSize: 13, color: Colors.light.text },
  catRight: { alignItems: 'flex-end' },
  catPct: { fontSize: 11, color: Colors.light.textSecondary },
  catValue: { fontSize: 13, fontWeight: '600', color: Colors.light.text },
});
