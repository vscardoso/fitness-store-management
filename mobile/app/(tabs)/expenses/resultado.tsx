/**
 * Resultado do mês. Pergunta do lojista: "Quanto sobrou das vendas este mês?"
 * Topo: UM número (lucro do mês = vendeu - custo das peças - gastos - brindes) e de quê é.
 * Abaixo, a conta que fecha nele (soma das linhas = o número do topo), na ordem em que o dinheiro anda.
 * É resultado das vendas, NÃO o dinheiro em mão (fiado e cartão a receber entram): o dinheiro das contas está no Financeiro.
 * Todo valor vem do servidor (ExpenseService._build_period_result). Mês em andamento diz "até hoje".
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import PageHeader from '@/components/layout/PageHeader';
import AppButton from '@/components/ui/AppButton';
import AppCard from '@/components/ui/AppCard';
import { Money } from '@/components/ui/PriceDisplay';
import { getMonthlyResult } from '@/services/expenseService';
import { formatCurrency, formatPercent } from '@/utils/format';
import { resultLines, type ResultLine } from '@/utils/resultMonth';
import { Colors, theme } from '@/constants/Colors';
import type { MonthlyResult, ExpenseByCategoryItem } from '@/types/expense';
import { useDesktopContentStyle, useIsDesktop } from '@/hooks/useLayout';
import ProductMonthList from '@/components/expenses/ProductMonthList';
import ScreenLoader from '@/components/ui/ScreenLoader';

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

/** Cores de texto com contraste mínimo de 4,5:1 sobre branco (as cores "claras" do tema não passam). */
const POS = Colors.light.successDark;
const NEG = Colors.light.errorDark;
const COST = Colors.light.warningDarker;
const ZERO = Colors.light.textSecondary;

export default function MonthlyResultScreen() {
  const desktopContent = useDesktopContentStyle();
  const isDesktop = useIsDesktop();
  const router = useRouter();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const { data, isLoading, isError, refetch } = useQuery({
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

  const isCurrent = year === now.getFullYear() && month === now.getMonth() + 1;
  const canGoNext = !isCurrent;
  const isEmpty = !!data && data.sales_count === 0 && Number(data.total_expenses) === 0 && Number(data.gifts_total ?? 0) === 0;
  const goFinance = () => router.push('/finance');
  const goAddExpense = () => router.push('/(tabs)/expenses/create');

  return (
    <View style={styles.container}>
      <PageHeader title="Resultado do Mês" showBackButton backFallback="/(tabs)/expenses" />

      {/* Seletor de mês: a seta de avançar apaga no mês atual */}
      <View style={styles.monthNav}>
        <AppButton variant="ghost" size="md" icon="chevron-back" iconOnly label="Mês anterior" onPress={prevMonth} />
        <View style={styles.monthCenter}>
          <Text style={styles.monthLabel}>{MONTHS[month - 1]} {year}</Text>
          {isCurrent && <Text style={styles.monthSub}>Mês em andamento: valores até hoje, dia {now.getDate()}</Text>}
        </View>
        <AppButton variant="ghost" size="md" icon="chevron-forward" iconOnly label="Próximo mês" onPress={nextMonth} disabled={!canGoNext} />
      </View>

      {isLoading ? (
        <ScreenLoader message="Carregando o resultado..." />
      ) : isError || !data ? (
        <View style={[styles.content, desktopContent]}>
          <AppCard tone="error" title="Não consegui carregar o resultado">
            <Text style={styles.stateText}>Confira a conexão e tente de novo. Nenhum número foi alterado.</Text>
            <AppButton variant="primary" label="Tentar de novo" onPress={() => refetch()} />
          </AppCard>
        </View>
      ) : isEmpty ? (
        <View style={[styles.content, desktopContent]}>
          <AppCard title={`Nenhuma venda em ${MONTHS[month - 1]}`}>
            <Text style={styles.stateText}>
              {isCurrent
                ? 'Quando você registrar a primeira venda do mês, o lucro aparece aqui.'
                : 'Neste mês não houve venda nem gasto lançado.'}
            </Text>
            {isCurrent && <AppButton variant="outlined" label="Ver o mês anterior" onPress={prevMonth} />}
          </AppCard>
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.content, desktopContent]}>
          {isDesktop ? (
            <View style={styles.columns}>
              <View style={styles.leftCol}>
                <Answer data={data} onFinance={goFinance} />
                <Account data={data} />
                <Attention data={data} onAddExpense={goAddExpense} isCurrent={isCurrent} />
              </View>
              <View style={styles.rightCol}>
                <ExpenseBreakdown items={data.expenses_by_category} total={data.total_expenses} />
                <ProductMonthList year={year} month={month} />
              </View>
            </View>
          ) : (
            <View style={styles.stack}>
              <Answer data={data} onFinance={goFinance} />
              <Account data={data} />
              <Attention data={data} onAddExpense={goAddExpense} isCurrent={isCurrent} />
              <ExpenseBreakdown items={data.expenses_by_category} total={data.total_expenses} />
              <ProductMonthList year={year} month={month} />
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

/** A resposta da tela: o lucro do mês, com de quê ele é. Não promete dinheiro em mão. */
function Answer({ data, onFinance }: { data: MonthlyResult; onFinance: () => void }) {
  const net = Number(data.net_profit);
  const positive = net >= 0;
  const tone = positive ? POS : NEG;
  return (
    <AppCard tone={positive ? 'success' : 'error'}>
      <View style={styles.answerHead}>
        <Ionicons name={positive ? 'checkmark-circle' : 'warning'} size={22} color={tone} />
        <Text style={[styles.answerTitle, { color: tone }]}>Lucro do mês</Text>
      </View>
      <Money value={net} size={38} minSize={22} color={tone} style={styles.answerValue} testID="resultado-lucro" />
      {positive ? (
        Number(data.revenue) > 0 && (
          <Text style={[styles.answerNote, { color: tone }]}>{formatPercent(Number(data.net_margin_pct))} do que você vendeu</Text>
        )
      ) : (
        <Text style={[styles.answerNote, { color: tone }]}>Você gastou mais do que vendeu neste mês.</Text>
      )}
      <Text style={styles.answerWhat}>Vendas menos o custo das peças e os gastos. É o resultado das vendas, não o dinheiro que está na conta.</Text>
      <AppButton variant="ghost" size="sm" label="Ver o dinheiro das contas" icon="wallet-outline" onPress={onFinance} />
    </AppCard>
  );
}

/** A conta que chega no lucro: vendeu, - custo das peças, - gastos, - brindes (só admin). Soma das linhas = o número do topo. */
function Account({ data }: { data: MonthlyResult }) {
  const n = (v: number) => v.toLocaleString('pt-BR');
  const salesLine = `${n(data.sales_count)} ${data.sales_count === 1 ? 'venda' : 'vendas'} · ${n(data.units_sold)} ${data.units_sold === 1 ? 'peça' : 'peças'}`;
  const TEXT: Record<ResultLine['key'], { label: string; hint: string; sub?: string }> = {
    revenue: { label: 'Quanto você vendeu', sub: salesLine, hint: 'Tudo que as clientes pagaram neste mês, já sem as devoluções. Inclui o que ainda vai receber (fiado e cartão).' },
    cmv: { label: 'Custo das peças vendidas', hint: 'O que você pagou pelas peças que saíram, com a parte das despesas de cada compra (frete, embalagem, taxa...).' },
    expenses: { label: 'Gastos da loja', hint: 'Aluguel, luz, salários, peças perdidas e outros gastos do mês. As despesas de uma compra já estão no custo das peças.' },
    gifts: { label: 'Brindes dados', hint: 'O que você pagou pelas peças que deu sem cobrar.' },
  };
  return (
    <AppCard title="Como chegamos nesse lucro">
      {resultLines(data).map((l) => (
        <PLRow key={l.key} label={TEXT[l.key].label} sub={TEXT[l.key].sub} hint={TEXT[l.key].hint} value={l.value} sign={l.sign} />
      ))}
    </AppCard>
  );
}

/** Só aparece quando há problema real: mês com venda e nenhum gasto lançado deixa o lucro maior do que é. */
function Attention({ data, onAddExpense, isCurrent }: { data: MonthlyResult; onAddExpense: () => void; isCurrent: boolean }) {
  // Os gastos da loja são lançados sempre no primeiro dia do mês: o aviso só vale a partir do dia 2 (mês fechado sempre vale).
  if (isCurrent && new Date().getDate() < 2) return null;
  if (!(data.sales_count > 0 && Number(data.total_expenses) === 0)) return null;
  return (
    <AppCard tone="warning" title="Nenhum gasto lançado neste mês">
      <Text style={styles.stateText}>Sem os gastos da loja (aluguel, luz, salários), o lucro fica maior do que é de verdade.</Text>
      <AppButton variant="outlined" size="sm" label="Lançar gasto" icon="add" onPress={onAddExpense} />
    </AppCard>
  );
}

function PLRow({
  label, value, sign, hint, sub,
}: {
  label: string;
  hint?: string;
  sub?: string;
  value: number;
  /** "+" entra no lucro, "-" sai dele. Zero é neutro e sem sinal. */
  sign: '+' | '-';
}) {
  // a explicação fica recolhida: quem já leu não precisa lê-la de novo toda vez
  const [open, setOpen] = useState(false);
  const zero = Math.abs(value) < 0.005;
  const color = zero ? ZERO : sign === '+' ? POS : COST;
  return (
    <View>
      <TouchableOpacity
        style={styles.plRow}
        onPress={hint ? () => setOpen((v) => !v) : undefined}
        activeOpacity={hint ? 0.7 : 1}
        accessibilityRole={hint ? 'button' : undefined}
        accessibilityState={hint ? { expanded: open } : undefined}
        accessibilityLabel={`${label}, ${zero ? '' : sign === '-' ? 'menos ' : ''}${formatCurrency(Math.abs(value))}`}
      >
        <View style={styles.plTexts}>
          <Text style={styles.plRowLabel}>{label}</Text>
          {!!sub && <Text style={styles.plRowSub}>{sub}</Text>}
        </View>
        <View style={styles.plValue}>
          {!zero && <Text style={[styles.plSign, { color }]}>{sign === '-' ? '−' : '+'}</Text>}
          <Money value={Math.abs(value)} size={16} minSize={11} color={color} style={styles.plMoney} />
        </View>
        {!!hint && <Ionicons name={open ? 'chevron-up' : 'information-circle-outline'} size={20} color={Colors.light.textSecondary} />}
      </TouchableOpacity>
      {!!hint && open && <Text style={styles.hint}>{hint}</Text>}
    </View>
  );
}

function ExpenseBreakdown({ items, total }: { items: ExpenseByCategoryItem[]; total: number }) {
  if (items.length === 0) return null;
  return (
    <AppCard title="Para onde foram os gastos da loja">
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
    </AppCard>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.backgroundSecondary },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: theme.spacing.xs, gap: theme.spacing.sm },
  monthCenter: { alignItems: 'center', minWidth: 200, flexShrink: 1 },
  monthLabel: { fontWeight: theme.fontWeight.bold, color: Colors.light.text, textAlign: 'center', fontSize: theme.fontSize.xl },
  monthSub: { fontSize: 12, color: Colors.light.textSecondary, textAlign: 'center' },
  // folga embaixo: a barra de navegação fixa (e a área segura do iPhone) não pode cobrir o último item
  content: { padding: theme.spacing.md, paddingBottom: 120 },
  stack: { gap: theme.spacing.md },
  columns: { flexDirection: 'row', gap: theme.spacing.lg, alignItems: 'flex-start' },
  leftCol: { width: 420, gap: theme.spacing.md },
  rightCol: { flex: 1, minWidth: 0, gap: theme.spacing.md },
  stateText: { fontSize: 14, lineHeight: 20, color: Colors.light.text },
  answerHead: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  answerTitle: { fontWeight: theme.fontWeight.bold, fontSize: theme.fontSize.md, flex: 1 },
  answerValue: { fontWeight: theme.fontWeight.extrabold, letterSpacing: -0.5 },
  answerNote: { fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.semibold },
  answerWhat: { fontSize: 12, lineHeight: 17, color: Colors.light.textSecondary },
  plRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, minHeight: 44 },
  plTexts: { flex: 1, minWidth: 0 },
  plRowLabel: { fontSize: 14, color: Colors.light.text },
  plRowSub: { fontSize: 12, color: Colors.light.textSecondary },
  plValue: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  plSign: { fontSize: 16, fontWeight: theme.fontWeight.bold },
  plMoney: { fontWeight: theme.fontWeight.semibold },
  hint: { fontSize: 12, lineHeight: 17, color: Colors.light.textSecondary, marginTop: 2 },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, paddingVertical: theme.spacing.xs },
  catDot: { width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  catName: { flex: 1, fontSize: 13, color: Colors.light.text },
  catRight: { alignItems: 'flex-end' },
  catPct: { fontSize: 12, color: Colors.light.textSecondary },
  catValue: { fontSize: 13, fontWeight: theme.fontWeight.semibold, color: Colors.light.text },
});
