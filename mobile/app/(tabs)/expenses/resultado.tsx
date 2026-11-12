/**
 * Resultado do mês. A resposta vem primeiro: o lucro do mês (o que sobrou no bolso) e quanto isso é do que foi vendido.
 * Logo abaixo, a conta que chega nele, na ordem em que o dinheiro anda: vendeu, custo das peças, gastos. Toque numa linha para ler o que ela inclui.
 * Depois, para onde foram os gastos e o resultado por produto. No notebook: a resposta e a conta à esquerda, os detalhes à direita.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import PageHeader from '@/components/layout/PageHeader';
import AppButton from '@/components/ui/AppButton';
import { getMonthlyResult } from '@/services/expenseService';
import { formatCurrency, formatPercent } from '@/utils/format';
import { Colors, theme } from '@/constants/Colors';
import type { MonthlyResult, ExpenseByCategoryItem } from '@/types/expense';
import { useDesktopContentStyle, useIsDesktop } from '@/hooks/useLayout';
import ProductMonthList from '@/components/expenses/ProductMonthList';
import ScreenLoader from '@/components/ui/ScreenLoader';

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export default function MonthlyResultScreen() {
  const desktopContent = useDesktopContentStyle();
  const isDesktop = useIsDesktop();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const { data, isLoading } = useQuery({
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
      <PageHeader title="Resultado do Mês" showBackButton backFallback="/(tabs)/expenses" />

      {/* Seletor de mês: a seta de avançar apaga no mês atual */}
      <View style={styles.monthNav}>
        <AppButton variant="ghost" size="md" icon="chevron-back" iconOnly label="Mês anterior" onPress={prevMonth} />
        <Text style={styles.monthLabel}>{MONTHS[month - 1]} {year}</Text>
        <AppButton variant="ghost" size="md" icon="chevron-forward" iconOnly label="Próximo mês" onPress={nextMonth} disabled={!canGoNext} />
      </View>

      {isLoading ? (
        <ScreenLoader />
      ) : data ? (
        <ScrollView contentContainerStyle={[styles.content, desktopContent]}>
          {isDesktop ? (
            <View style={styles.columns}>
              <View style={styles.leftCol}>
                <Answer data={data} />
                <Account data={data} />
              </View>
              <View style={styles.rightCol}>
                <ExpenseBreakdown items={data.expenses_by_category} total={data.total_expenses} />
                <ProductMonthList year={year} month={month} />
              </View>
            </View>
          ) : (
            <View style={styles.stack}>
              <Answer data={data} />
              <Account data={data} />
              <ExpenseBreakdown items={data.expenses_by_category} total={data.total_expenses} />
              <ProductMonthList year={year} month={month} />
            </View>
          )}
        </ScrollView>
      ) : null}
    </View>
  );
}

/** A resposta da tela: quanto sobrou no bolso no mês. */
function Answer({ data }: { data: MonthlyResult }) {
  const positive = data.net_profit >= 0;
  const tone = positive ? Colors.light.success : Colors.light.error;
  return (
    <View style={[styles.answer, { backgroundColor: positive ? Colors.light.successLight : Colors.light.errorLight, borderColor: tone }]}>
      <View style={styles.answerHead}>
        <Ionicons name={positive ? 'checkmark-circle' : 'warning'} size={22} color={tone} />
        <Text style={[styles.answerTitle, { color: tone }]}>Lucro do mês (o que sobrou no bolso)</Text>
      </View>
      <Text style={[styles.answerValue, { color: tone }]}>{formatCurrency(data.net_profit)}</Text>
      <Text style={[styles.answerNote, { color: tone }]}>{formatPercent(Number(data.net_margin_pct))} do que você vendeu</Text>
    </View>
  );
}

/** A conta que chega no lucro: vendeu, custo das peças, sobrou das vendas, gastos, brindes. */
function Account({ data }: { data: MonthlyResult }) {
  const hasGifts = Number(data.gifts_total ?? 0) !== 0;
  return (
    <View style={styles.plCard}>
      <PLRow label="Quanto você vendeu" hint="Tudo que os clientes pagaram neste mês, já sem as devoluções." value={data.revenue} color={Colors.light.success} icon="trending-up" />
      <PLRow label="Quanto custaram as peças vendidas" hint="O que você pagou por elas, já com a parte das despesas de cada compra (frete, embalagem, taxa...)." value={-data.cmv} color={Colors.light.warning} icon="cube-outline" isNegative />
      <View style={styles.divider} />
      <PLRow label="Sobrou das vendas" hint="Vendas menos o custo das peças." value={data.gross_profit} color={data.gross_profit >= 0 ? Colors.light.success : Colors.light.error} icon="analytics-outline" bold />
      <Text style={styles.marginLabel}>De cada R$ 100 vendidos, R$ {Number(data.gross_margin_pct).toFixed(0)} sobraram depois de pagar as peças.</Text>
      <PLRow label="Gastos da loja" hint="Aluguel, luz, salários, peças perdidas e outros gastos do mês. As despesas de uma compra (frete, embalagem, taxa...) não entram aqui: já estão no custo das peças." value={-data.total_expenses} color={Colors.light.error} icon="receipt-outline" isNegative />
      {hasGifts && (
        <PLRow label="Brindes dados" hint="O que você pagou pelas peças que deu sem cobrar. Não entra no custo das peças vendidas, para a margem das vendas não mudar." value={-Number(data.gifts_total)} color={Colors.light.error} icon="gift-outline" isNegative />
      )}
    </View>
  );
}

function PLRow({
  label, value, color, icon, bold, isNegative, hint,
}: {
  label: string;
  hint?: string;
  value: number;
  color: string;
  icon: string;
  bold?: boolean;
  isNegative?: boolean;
}) {
  // a explicação fica recolhida: quem já leu não precisa lê-la de novo toda vez
  const [open, setOpen] = useState(false);
  return (
    <View>
      <TouchableOpacity
        style={styles.plRow}
        onPress={hint ? () => setOpen((v) => !v) : undefined}
        activeOpacity={hint ? 0.7 : 1}
        accessibilityRole={hint ? 'button' : undefined}
        accessibilityState={hint ? { expanded: open } : undefined}
        accessibilityLabel={`${label}, ${isNegative ? 'menos ' : ''}${formatCurrency(Math.abs(value))}`}
      >
        <Ionicons name={icon as any} size={18} color={color} />
        <Text style={[styles.plRowLabel, bold && styles.plRowBold]}>{label}</Text>
        <Text style={[styles.plRowValue, bold && styles.plRowBold, { color }]}>
          {isNegative ? '-' : ''}{formatCurrency(Math.abs(value))}
        </Text>
        {!!hint && <Ionicons name={open ? 'chevron-up' : 'information-circle-outline'} size={16} color={Colors.light.textTertiary} />}
      </TouchableOpacity>
      {!!hint && open && <Text style={styles.hint}>{hint}</Text>}
    </View>
  );
}

function ExpenseBreakdown({ items, total }: { items: ExpenseByCategoryItem[]; total: number }) {
  if (items.length === 0) return null;
  return (
    <View style={styles.plCard}>
      <Text style={styles.breakdownTitle}>Para onde foram os gastos da loja</Text>
      {items.map((item) => {
        const pct = total > 0 ? (item.total / total) * 100 : 0;
        return (
          <View key={item.category_id} style={styles.catRow}>
            <View style={[styles.catDot, { backgroundColor: item.color }]}>
              <Ionicons name={item.icon as any} size={14} color={Colors.light.white} />
            </View>
            <Text style={styles.catName}>{item.category}</Text>
            <View style={styles.catRight}>
              <Text style={styles.catValue}>{formatCurrency(item.total)}</Text>
              <Text style={styles.catPct}>{`${formatPercent(pct, 0)} dos gastos`}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.backgroundSecondary },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: theme.spacing.xs, gap: theme.spacing.sm },
  monthLabel: { fontWeight: theme.fontWeight.bold, color: Colors.light.text, minWidth: 180, textAlign: 'center', fontSize: theme.fontSize.xl },
  content: { padding: theme.spacing.md, paddingBottom: theme.spacing.xl },
  stack: { gap: theme.spacing.md },
  columns: { flexDirection: 'row', gap: theme.spacing.lg, alignItems: 'flex-start' },
  leftCol: { width: 420, gap: theme.spacing.md },
  rightCol: { flex: 1, minWidth: 0, gap: theme.spacing.md },
  answer: { borderRadius: theme.borderRadius.xl, borderWidth: 1, padding: theme.spacing.md, gap: 4 },
  answerHead: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  answerTitle: { fontWeight: theme.fontWeight.bold, fontSize: theme.fontSize.md, flex: 1 },
  answerValue: { fontSize: theme.fontSize.xxxl, fontWeight: theme.fontWeight.extrabold, letterSpacing: -0.5 },
  answerNote: { fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.semibold },
  plCard: {
    backgroundColor: Colors.light.card, borderRadius: theme.borderRadius.lg, borderWidth: 1, borderColor: Colors.light.border,
    padding: theme.spacing.md, gap: theme.spacing.md, ...theme.shadows.sm,
  },
  plRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  plRowLabel: { flex: 1, fontSize: 14, color: Colors.light.text },
  plRowValue: { fontSize: 14, fontWeight: theme.fontWeight.semibold },
  plRowBold: { fontWeight: theme.fontWeight.bold, fontSize: 15 },
  hint: { fontSize: 12, lineHeight: 17, color: Colors.light.textSecondary, marginLeft: 30, marginTop: 4 },
  divider: { height: 1, backgroundColor: Colors.light.border },
  marginLabel: { fontSize: 12, color: Colors.light.textSecondary, marginTop: -8, marginLeft: 30 },
  breakdownTitle: { fontWeight: theme.fontWeight.bold, color: Colors.light.text, fontSize: theme.fontSize.md },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, paddingVertical: theme.spacing.xs },
  catDot: { width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  catName: { flex: 1, fontSize: 13, color: Colors.light.text },
  catRight: { alignItems: 'flex-end' },
  catPct: { fontSize: 11, color: Colors.light.textSecondary },
  catValue: { fontSize: 13, fontWeight: theme.fontWeight.semibold, color: Colors.light.text },
});
