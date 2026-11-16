/**
 * Início: "Como está o mês". Um bloco só para o resultado do mês, com o que sobrou em destaque e a conta embaixo
 * (vendeu, custo das peças, gastos). Antes o mesmo faturamento e o mesmo lucro apareciam em quatro blocos de períodos
 * diferentes; agora há um número do mês e ele é este.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Colors, theme, VALUE_COLORS } from '@/constants/Colors';
import { formatCurrency, formatInt, formatPercent } from '@/utils/format';
import { monthLines, type MonthLine } from '@/utils/homeLogic';
import { Money } from '@/components/ui/PriceDisplay';

interface Props {
  /** "novembro", já em minúsculas. */
  monthName: string;
  result: {
    revenue: number; cmv: number; total_expenses: number; net_profit: number; net_margin_pct: number;
    sales_count: number; gifts_total?: number | null; stock_losses_total?: number | null;
  };
  /** Abre a explicação do cálculo (ⓘ). */
  onInfo: () => void;
  onPress: () => void;
}

export default function MonthCard({ monthName, result, onInfo, onPress }: Props) {
  const net = Number(result.net_profit) || 0;
  const positive = net >= 0;
  const lines: MonthLine[] = monthLines(result);
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} accessibilityRole="button" accessibilityLabel="Ver o resultado do mês" testID="home-month-card">
      <View style={styles.card}>
        <View style={styles.head}>
          <Text style={styles.title}>Como está o mês</Text>
          <Text style={styles.monthName} testID="home-month-name">{monthName}</Text>
          <View style={{ flex: 1 }} />
          <Ionicons name="chevron-forward" size={18} color={Colors.light.textTertiary} />
        </View>

        <View style={styles.net}>
          <View style={styles.netLabelRow}>
            <Text style={styles.netLabel}>Sobrou no mês</Text>
            <TouchableOpacity onPress={onInfo} hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel="Como o resultado é calculado" testID="home-month-info">
              <Ionicons name="information-circle-outline" size={14} color={Colors.light.textTertiary} />
            </TouchableOpacity>
          </View>
          <Money style={styles.netValue} value={net} color={positive ? VALUE_COLORS.positive : VALUE_COLORS.negative} testID="home-month-net" />
          <Text style={[styles.netSub, { color: positive ? VALUE_COLORS.positive : VALUE_COLORS.negative }]} testID="home-month-margin">
            {formatPercent(Number(result.net_margin_pct) || 0)} do que vendeu
          </Text>
        </View>

        <View style={styles.rows}>
          {lines.map((l) => (
            <View key={l.id} style={styles.row} testID={`home-month-${l.id}`}>
              <Text style={styles.rowLabel} numberOfLines={1}>
                {l.label}
                {l.id === 'revenue' ? ` · ${formatInt(Number(result.sales_count) || 0)} ${Number(result.sales_count) === 1 ? 'venda' : 'vendas'}` : ''}
              </Text>
              <Text style={[styles.rowValue, { color: l.value === 0 ? Colors.light.textSecondary : l.sign < 0 ? VALUE_COLORS.negative : VALUE_COLORS.positive }]}>
                {l.sign < 0 && l.value !== 0 ? '-' : ''}{formatCurrency(Math.abs(l.value))}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: Colors.light.card, borderRadius: theme.borderRadius.xl, borderWidth: 1, borderColor: Colors.light.border, padding: 16, gap: 14 },
  head: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  title: { fontSize: theme.fontSize.lg, fontWeight: theme.fontWeight.bold, color: Colors.light.text },
  monthName: { fontSize: theme.fontSize.md, color: Colors.light.textSecondary },
  net: { gap: 2 },
  netLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  netLabel: { fontSize: theme.fontSize.md, color: Colors.light.textSecondary },
  netValue: { fontSize: theme.fontSize.xxxl, fontWeight: theme.fontWeight.extrabold },
  netSub: { fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.semibold },
  rows: { gap: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  rowLabel: { flex: 1, minWidth: 0, fontSize: theme.fontSize.md, color: Colors.light.textSecondary },
  rowValue: { fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.semibold },
});
