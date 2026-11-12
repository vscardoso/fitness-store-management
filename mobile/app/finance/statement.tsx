/**
 * Extrato: toda a vida financeira, dia a dia. Para cada dia mostra quanto a conta tinha ao começar, o que entrou e saiu (cada
 * linha com a palavra que a explica; tocar abre os movimentos um a um) e quanto tinha ao terminar. No topo, a CONFERÊNCIA:
 * o extrato usa as mesmas contas do saldo, então tem que fechar com o saldo de agora; se não fechar, a tela diz a diferença.
 * Dados do servidor: `GET /finance/statement` (7 dias por vez, "Ver dias anteriores" anda para trás).
 */
import React, { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import PageHeader from '@/components/layout/PageHeader';
import AppButton from '@/components/ui/AppButton';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';
import ScreenLoader from '@/components/ui/ScreenLoader';
import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { useIsDesktop } from '@/hooks/useLayout';
import { useAuth } from '@/hooks/useAuth';
import { isAdminRole } from '@/utils/roles';
import { formatCurrency, formatDate } from '@/utils/format';
import { parseApiError } from '@/utils/apiError';
import PdfActions from '@/components/ui/PdfActions';
import { getFinanceOverview, getStatement, getStatementPdf, type StatementDay, type StatementLine } from '@/services/financeService';

const WEEKDAY = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/** "2026-11-12" vira "Hoje, quinta 12/11" ou "quarta 11/11/2026", sem trocar de dia por causa do fuso. */
function dayTitle(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const now = new Date();
  const same = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const dd = String(d).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  const base = `${WEEKDAY[date.getDay()]} ${dd}/${mm}${y === now.getFullYear() ? '' : `/${y}`}`;
  if (same(date, now)) return `Hoje, ${base}`;
  if (same(date, yesterday)) return `Ontem, ${base}`;
  return base;
}

/** Valor com sinal e cor: entrou (+, verde) e saiu (-, vermelho). */
function signed(value: number): string {
  if (Math.abs(value) < 0.005) return formatCurrency(0);
  return `${value > 0 ? '+' : '-'} ${formatCurrency(Math.abs(value))}`;
}
const tone = (value: number) => (value > 0.004 ? Colors.light.success : value < -0.004 ? Colors.light.error : Colors.light.textSecondary);

function FilterChip({ text, on, color, onPress }: { text: string; on: boolean; color: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.chip, on && { borderColor: color, backgroundColor: color + '14' }]}
      accessibilityRole="radio" accessibilityState={{ selected: on }}>
      <Text style={[styles.chipText, on && { color }]}>{text}</Text>
    </TouchableOpacity>
  );
}

function LineRow({ line, open, onToggle }: { line: StatementLine; open: boolean; onToggle: () => void }) {
  const expandable = line.items.length > 0;
  return (
    <View>
      <TouchableOpacity style={styles.line} onPress={onToggle} disabled={!expandable} activeOpacity={0.7}
        accessibilityRole={expandable ? 'button' : undefined} accessibilityState={expandable ? { expanded: open } : undefined}
        accessibilityLabel={`${line.label}, ${signed(line.amount)}${expandable ? ', toque para ver os movimentos' : ''}`}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.lineLabel}>{line.label}</Text>
          {expandable && <Text style={styles.lineHint}>{open ? 'Esconder movimentos' : `Ver ${line.items.length} movimento${line.items.length > 1 ? 's' : ''}`}</Text>}
        </View>
        <Text style={[styles.lineValue, { color: tone(line.amount) }]} numberOfLines={1}>{signed(line.amount)}</Text>
        {expandable && <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.light.textSecondary} />}
      </TouchableOpacity>
      {open && line.items.map((it, i) => (
        <View key={`${it.ref ?? 'x'}-${i}`} style={styles.item}>
          <Text style={styles.itemLabel}>{it.label}</Text>
          <Text style={[styles.itemValue, { color: tone(it.amount) }]}>{signed(it.amount)}</Text>
        </View>
      ))}
    </View>
  );
}

function DayCard({ day, expanded, toggle }: { day: StatementDay; expanded: Set<string>; toggle: (key: string) => void }) {
  return (
    <View style={styles.day} testID={`statement-day-${day.date}`}>
      <Text style={styles.dayTitle}>{dayTitle(day.date)}</Text>
      <View style={styles.dayBalances}>
        <View style={styles.balanceBox}>
          <Text style={styles.balanceLabel}>Começou com</Text>
          <Text style={styles.balanceValue}>{formatCurrency(day.opening)}</Text>
        </View>
        <View style={styles.balanceBox}>
          <Text style={styles.balanceLabel}>Resultado do dia</Text>
          <Text style={[styles.balanceValue, { color: tone(day.net) }]}>{signed(day.net)}</Text>
        </View>
        <View style={styles.balanceBox}>
          <Text style={styles.balanceLabel}>Terminou com</Text>
          <Text style={styles.balanceValue}>{formatCurrency(day.closing)}</Text>
        </View>
      </View>
      {(day.accounts ?? []).some((a) => a.kind === 'card') && (
        <Text style={styles.balanceLabel}>
          {`No fim do dia: disponível (gaveta e bancos) ${formatCurrency((day.accounts ?? []).filter((a) => a.kind !== 'card').reduce((t, a) => t + a.closing, 0))}, a receber da maquininha ${formatCurrency((day.accounts ?? []).filter((a) => a.kind === 'card').reduce((t, a) => t + a.closing, 0))}. O total soma os dois.`}
        </Text>
      )}
      <View style={styles.lines}>
        {day.lines.map((ln, i) => {
          const key = `${day.date}-${i}`;
          return <LineRow key={key} line={ln} open={expanded.has(key)} onToggle={() => toggle(key)} />;
        })}
      </View>
    </View>
  );
}

export default function StatementScreen() {
  const router = useRouter();
  const brand = useBrandingColors();
  const isDesktop = useIsDesktop();
  const { user } = useAuth();
  const admin = isAdminRole(user?.role);
  const params = useLocalSearchParams<{ account?: string }>();
  const [accountId, setAccountId] = useState<number | null>(params.account ? Number(params.account) || null : null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data: finance } = useQuery({ queryKey: ['finance'], queryFn: getFinanceOverview });
  const statement = useInfiniteQuery({
    queryKey: ['finance-statement', accountId],
    queryFn: ({ pageParam }) => getStatement({ accountId, before: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_before ?? undefined,
    enabled: finance?.started !== false,
  });

  const pages = statement.data?.pages ?? [];
  const first = pages[0];
  const days = useMemo(() => pages.flatMap((p) => p.days), [pages]);
  const rec = first?.reconciliation ?? null;
  const toggle = (key: string) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const pick = (id: number | null) => { setAccountId(id); setExpanded(new Set()); };
  const accounts = (finance?.accounts ?? []);
  const accountName = accountId ? accounts.find((a) => a.id === accountId)?.name ?? 'esta conta' : 'todas as contas';

  const content = (() => {
    if (statement.isLoading) return <ScreenLoader inline message="Carregando o extrato..." />;
    if (statement.error && !first) {
      return <EmptyState type="error" title="Não foi possível abrir o extrato" description={parseApiError(statement.error)}
        actionLabel="Tentar de novo" onAction={() => statement.refetch()} />;
    }
    if (first && !first.started) {
      return <EmptyState icon="wallet-outline" title="O controle do dinheiro ainda não começou"
        description="O extrato aparece depois que a loja informa os saldos de partida."
        actionLabel={admin ? 'Começar a controlar o dinheiro' : undefined} onAction={admin ? () => router.push('/finance/setup' as any) : undefined} />;
    }
    return (
      <>
        {!!rec && rec.difference !== null && (
          rec.difference === 0 ? (
            <View style={[styles.check, { borderColor: Colors.light.success, backgroundColor: Colors.light.successLight }]} testID="statement-check-ok">
              <Ionicons name="checkmark-circle" size={22} color={Colors.light.success} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.checkTitle}>{`Extrato bate com o saldo: ${formatCurrency(rec.balance_now)}`}</Text>
                <Text style={styles.checkText}>
                  {`Tudo o que entrou e saiu de ${accountName} desde ${first?.start_date ? formatDate(first.start_date) : 'o começo da contagem'} fecha com o saldo de agora.`}
                </Text>
              </View>
            </View>
          ) : (
            <View style={[styles.check, { borderColor: Colors.light.error, backgroundColor: Colors.light.errorLight }]} testID="statement-check-bad">
              <Ionicons name="alert-circle" size={22} color={Colors.light.error} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.checkTitle}>{`Não bate: diferença de ${formatCurrency(Math.abs(rec.difference))}`}</Text>
                <Text style={styles.checkText}>
                  {`O saldo de agora é ${formatCurrency(rec.balance_now)} e o extrato termina em ${formatCurrency(rec.closing_of_latest_day)}. Procure um lançamento com data de amanhã em diante ou um ajuste de saldo; se não achar, mostre esta tela a quem administra a loja.`}
                </Text>
              </View>
            </View>
          )
        )}

        {days.length === 0 ? (
          <EmptyState icon="receipt-outline"
            title={first?.next_before ? 'Nenhum movimento nestes dias' : 'Nenhum movimento ainda'}
            description={first?.next_before ? 'Veja os dias anteriores para achar o último movimento.' : 'Quando houver venda, transferência ou pagamento, ele aparece aqui.'}
            actionLabel={first?.next_before ? 'Ver dias anteriores' : undefined}
            onAction={first?.next_before ? () => statement.fetchNextPage() : undefined} />
        ) : (
          days.map((d) => <DayCard key={d.date} day={d} expanded={expanded} toggle={toggle} />)
        )}

        {statement.hasNextPage ? (
          <AppButton variant="outlined" size="md" fullWidth icon="time-outline" label="Ver dias anteriores"
            loading={statement.isFetchingNextPage} onPress={() => statement.fetchNextPage()} />
        ) : days.length > 0 && !!first?.start_date ? (
          <Text style={styles.end}>{`Começo da contagem: ${formatDate(first.start_date)}`}</Text>
        ) : null}
      </>
    );
  })();

  return (
    <View style={styles.container}>
      <PageHeader title="Extrato" subtitle="Dia a dia, conta por conta" showBackButton backFallback="/finance" />
      {accounts.length > 0 && (
        <View style={[styles.chipsBar, isDesktop && styles.reading]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll} contentContainerStyle={styles.chips}>
            <FilterChip text="Todas" on={accountId === null} color={brand.primary} onPress={() => pick(null)} />
            {accounts.map((a) => (
              <FilterChip key={a.id} text={a.name} on={accountId === a.id} color={brand.primary} onPress={() => pick(a.id)} />
            ))}
          </ScrollView>
          {!!rec && rec.difference !== null && (
            <Badge label={rec.difference === 0 ? 'Bate com o saldo' : 'Não bate'} variant={rec.difference === 0 ? 'success' : 'error'} size="sm" />
          )}
        </View>
      )}
      {accounts.length > 0 && (
        <View style={[styles.pdfBar, isDesktop && styles.reading]}>
          <PdfActions getPdf={() => getStatementPdf(accountId)} cacheKey={`extrato-${accountId ?? 'todas'}`} shareLabel="Extrato completo em PDF" variant="outlined" size="sm" fullWidth={false} />
        </View>
      )}
      <ScrollView contentContainerStyle={[styles.content, isDesktop && styles.reading]}
        refreshControl={<RefreshControl refreshing={statement.isRefetching && !statement.isFetchingNextPage} onRefresh={() => statement.refetch()} />}>
        {content}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  reading: { width: '100%', maxWidth: 760, alignSelf: 'center' },
  chipsBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 16, paddingRight: 16, paddingVertical: 8, backgroundColor: Colors.light.background, borderBottomWidth: 1, borderBottomColor: Colors.light.border },
  pdfBar: { paddingHorizontal: 16, paddingTop: 8, flexDirection: 'row', justifyContent: 'flex-start' },
  chipsScroll: { flex: 1, minWidth: 0 },   // sem isto a faixa de chips passava por baixo do selo "Bate com o saldo"
  chips: { flexDirection: 'row', gap: 8, paddingRight: 8 },
  chip: { borderWidth: 1.5, borderColor: Colors.light.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  chipText: { fontSize: 13, fontWeight: theme.fontWeight.bold, color: Colors.light.text },
  content: { padding: 16, paddingBottom: 48, gap: 12 },
  check: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderWidth: 1, borderRadius: 14, padding: 14 },
  checkTitle: { fontSize: 15, fontWeight: theme.fontWeight.extrabold, color: Colors.light.text },
  checkText: { fontSize: 13, lineHeight: 19, color: Colors.light.textSecondary },
  day: { backgroundColor: Colors.light.card, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: Colors.light.border, gap: 10 },
  dayTitle: { fontSize: 15, fontWeight: theme.fontWeight.extrabold, color: Colors.light.text, textTransform: 'capitalize' },
  dayBalances: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  balanceBox: { flexGrow: 1, flexBasis: 100, minWidth: 0, backgroundColor: Colors.light.background, borderRadius: 10, padding: 8, gap: 2 },
  balanceLabel: { fontSize: 11, color: Colors.light.textSecondary },
  balanceValue: { fontSize: 14, fontWeight: theme.fontWeight.extrabold, color: Colors.light.text },
  lines: { gap: 2 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  lineLabel: { fontSize: 14, color: Colors.light.text },
  lineHint: { fontSize: 11, color: Colors.light.textSecondary },
  lineValue: { fontSize: 14, fontWeight: theme.fontWeight.extrabold, flexShrink: 0 },   // o valor nunca quebra: quem encolhe é o rótulo
  item: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingLeft: 12, paddingVertical: 4, borderLeftWidth: 2, borderLeftColor: Colors.light.border },
  itemLabel: { flex: 1, fontSize: 13, color: Colors.light.textSecondary },
  itemValue: { fontSize: 13, fontWeight: theme.fontWeight.bold, flexShrink: 0 },
  end: { textAlign: 'center', fontSize: 12, color: Colors.light.textSecondary, paddingVertical: 8 },
});
