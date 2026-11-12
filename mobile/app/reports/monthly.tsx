/**
 * Relatório mensal da loja, lido como um relatório: (1) a resposta do mês (lucro, de onde veio e para onde foi cada R$ 100
 * vendidos), (2) o que olhar, (3) como vendeu (formas de pagamento, mais vendidos, categorias, despesas), (4) o dinheiro do mês
 * (tinha, entrou, saiu, deveria ter) e (5) o retrato de HOJE (fiado, contas a pagar, estoque). Números do servidor
 * (backend/app/services/monthly_report_service.py), as mesmas contas das outras telas. Todo número vem com uma palavra.
 */
import React, { useState } from 'react';
import { Platform, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';

import PageHeader from '@/components/layout/PageHeader';
import AppButton from '@/components/ui/AppButton';
import FoldSection from '@/components/finance/FoldSection';
import { BarRow, DeltaBadge, StackedBar } from '@/components/reports/ReportParts';
import { FitText } from '@/components/ui/PriceDisplay';
import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { useDesktopContentStyle, useIsDesktop } from '@/hooks/useLayout';
import { formatCurrency } from '@/utils/format';
import { parseApiError } from '@/utils/apiError';
import PdfActions from '@/components/ui/PdfActions';
import { getMonthlyReport, getMonthlyReportPdf } from '@/services/monthlyReportService';
import ScreenLoader from '@/components/ui/ScreenLoader';

const PAYMENTS: Record<string, string> = {
  cash: 'Dinheiro', credit_card: 'Cartão de crédito', debit_card: 'Cartão de débito', pix: 'PIX', bank_transfer: 'Transferência',
  installments: 'Parcelado', on_account: 'Fiado', loyalty_points: 'Pontos',
};
const KIND: Record<string, string> = { drawer: 'Gaveta', bank: 'Banco', card_machine: 'Maquininha' };
const pctText = (v: number) => `${v.toFixed(1).replace('.', ',')}%`;

function Row({ label, value, sub, bold, count }: { label: string; value: number | string; sub?: string; bold?: boolean; count?: boolean }) {
  const text = typeof value === 'string' ? value : count ? String(value) : formatCurrency(value);
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, bold && { fontWeight: theme.fontWeight.extrabold }]}>{label}</Text>
        {!!sub && <Text style={styles.small}>{sub}</Text>}
      </View>
      <Text style={[styles.rowValue, bold && { fontWeight: theme.fontWeight.extrabold }, typeof value === 'number' && value < 0 && { color: Colors.light.error }]}>{text}</Text>
    </View>
  );
}

/** Quadro com um número e a palavra que o explica; `warn` pinta de vermelho (algo vencido). */
function Stat({ label, value, note, warn, onPress }: { label: string; value: string; note?: string; warn?: boolean; onPress?: () => void }) {
  const body = (
    <>
      <Text style={styles.statLabel}>{label}</Text>
      <FitText style={[styles.statValue, warn && { color: Colors.light.error }]} minSize={11}>{value}</FitText>
      {!!note && <Text style={[styles.small, warn && { color: Colors.light.error }]}>{note}</Text>}
    </>
  );
  return onPress
    ? <TouchableOpacity style={styles.stat} onPress={onPress} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={`${label}: ${value}`}>{body}</TouchableOpacity>
    : <View style={styles.stat}>{body}</View>;
}

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <View style={{ gap: 2 }}>
        <Text style={styles.title}>{title}</Text>
        {!!hint && <Text style={styles.small}>{hint}</Text>}
      </View>
      {children}
    </View>
  );
}

export default function MonthlyReportScreen() {
  const router = useRouter();
  const brand = useBrandingColors();
  const desktop = useDesktopContentStyle();
  const isDesktop = useIsDesktop();
  const now = new Date();
  const [sel, setSel] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const isCurrent = sel.year === now.getFullYear() && sel.month === now.getMonth() + 1;
  const q = useQuery({ queryKey: ['monthly-report', sel.year, sel.month], queryFn: () => getMonthlyReport(sel.year, sel.month) });
  const d = q.data;
  const go = (step: number) => {
    const t = sel.year * 12 + (sel.month - 1) + step;
    setSel({ year: Math.floor(t / 12), month: (t % 12) + 1 });
  };
  const levelColor = (l: string) => (l === 'bad' ? Colors.light.error : l === 'warn' ? Colors.light.warning : Colors.light.success);
  const levelTag = (l: string) => (l === 'bad' ? 'AGIR' : l === 'warn' ? 'OLHAR' : 'OK');
  const palette = [brand.primary, Colors.light.success, Colors.light.warning, Colors.light.info, Colors.light.secondary, Colors.light.textTertiary];

  // dia do mês (só no mês em andamento): "dia 12 de 30"
  const dayInfo = (() => {
    if (!d || d.month_finished) return null;
    const total = new Date(sel.year, sel.month, 0).getDate();   // dias do mês (o fim do período do servidor é hoje, não o último dia)
    const day = Math.min(total, Math.max(1, new Date().getDate()));
    return { day, total };
  })();

  // 1. A resposta do mês
  const cur = d?.result.current;
  const answer = !!d && !!cur && (
    <View style={styles.hero} testID="monthly-summary">
      <Text style={styles.eyebrow}>LUCRO DO MÊS</Text>
      <Text style={[styles.profit, cur.net_profit < 0 && { color: Colors.light.error }]}>{formatCurrency(cur.net_profit)}</Text>
      <DeltaBadge value={d.result.change.net_profit} />
      <Text style={styles.note}>
        {cur.revenue <= 0
          ? 'Nenhuma venda neste mês até agora.'
          : cur.net_profit >= 0
            ? `De cada R$ 100 vendidos, R$ ${Math.round((cur.net_profit / cur.revenue) * 100)} ficam de lucro depois de pagar as peças e as despesas.`
            : 'As peças e as despesas custaram mais do que a loja vendeu: o mês está no prejuízo.'}
      </Text>
      {cur.revenue > 0 && (
        <StackedBar totalLabel="do faturamento" segments={[
          { label: 'Custo das peças vendidas', amount: cur.cost, color: Colors.light.textTertiary },
          { label: 'Despesas do mês', amount: cur.expenses, color: Colors.light.warning },
          { label: 'Lucro do mês', amount: Math.max(0, cur.net_profit), color: brand.primary },
        ]} />
      )}
      <View style={styles.stats}>
        <Stat label="Faturamento" value={formatCurrency(cur.revenue)} note="vendas menos devoluções" />
        <Stat label="Vendas" value={String(cur.sales_count)} note={`ticket médio ${formatCurrency(cur.average_ticket)}`} />
        <Stat label="Peças vendidas" value={String(d.sales.pieces_sold)} note={`margem de lucro ${pctText(cur.gross_margin_pct)}`} />
      </View>
      <View style={{ gap: 2 }}>
        <Text style={styles.smallStrong}>Contra o mês anterior ({d.previous_label})</Text>
        <View style={styles.deltaLine}><Text style={styles.small}>Faturamento</Text><DeltaBadge value={d.result.change.revenue} /></View>
        <View style={styles.deltaLine}><Text style={styles.small}>Despesas</Text><DeltaBadge value={d.result.change.expenses} goodWhenUp={false} /></View>
        <View style={styles.deltaLine}><Text style={styles.small}>Vendas</Text><DeltaBadge value={d.result.change.sales_count} /></View>
        {!d.month_finished && <Text style={styles.small}>Mês em andamento: a comparação é com o mês anterior inteiro.</Text>}
      </View>
    </View>
  );

  // 2. O que olhar
  const attention = !!d && d.attention.length > 0 && (
    <Card title="Saúde da loja: o que olhar">
      {d.attention.map((a, i) => (
        <View key={i} style={styles.attRow}>
          <Text style={[styles.tag, { color: levelColor(a.level) }]}>{levelTag(a.level)}</Text>
          <Text style={styles.att}>{a.text}</Text>
        </View>
      ))}
    </Card>
  );

  // 3. Como vendeu
  const maxTop = Math.max(1, ...(d?.sales.top_products ?? []).slice(0, 5).map((p) => p.revenue));
  const totalExp = Math.max(1, cur?.expenses ?? 0);
  const selling = !!d && (
    <>
      {d.sales.payment_breakdown.length > 0 && (
        <Card title="Como as clientes pagaram" hint="Parte do faturamento em cada forma de pagamento.">
          <StackedBar totalLabel="das vendas" segments={d.sales.payment_breakdown.map((p, i) => ({
            label: `${PAYMENTS[p.method] ?? p.method} (${p.count} venda${p.count === 1 ? '' : 's'})`, amount: p.total, color: palette[i % palette.length],
          }))} />
        </Card>
      )}
      {d.sales.top_products.length > 0 && (
        <Card title="O que mais vendeu" hint="Os 5 produtos que mais faturaram no mês.">
          {d.sales.top_products.slice(0, 5).map((p, i) => (
            <BarRow key={i} label={`${p.product_name}${p.variant_label ? ` · ${p.variant_label}` : ''}`} value={formatCurrency(p.revenue)} color={brand.primary}
              share={p.revenue / maxTop} sub={`${p.quantity_sold} peça(s) vendida(s) · lucro ${formatCurrency(p.profit)}${p.variant_display_code ? ` · ${p.variant_display_code}` : ''}`} />
          ))}
        </Card>
      )}
      {d.sales.by_category.length > 0 && (
        <Card title="Faturamento por categoria">
          {d.sales.by_category.map((c) => (
            <BarRow key={c.category} label={c.category} value={formatCurrency(c.revenue)} color={Colors.light.success} share={c.percentage / 100}
              sub={`${c.percentage.toFixed(0)}% do faturamento · ${c.pieces} peça(s) · lucro ${formatCurrency(c.profit)}`} />
          ))}
        </Card>
      )}
      {cur!.expenses_by_category.length > 0 && (
        <Card title="Para onde foram as despesas" hint={`Total de despesas do mês: ${formatCurrency(cur!.expenses)}`}>
          {cur!.expenses_by_category.map((c) => (
            <BarRow key={c.label} label={c.label} value={formatCurrency(c.amount)} color={Colors.light.warning} share={c.amount / totalExp}
              sub={`${Math.round((c.amount / totalExp) * 100)}% das despesas`} />
          ))}
        </Card>
      )}
      {d.sales.by_seller.length > 1 && (
        <Card title="Faturamento por vendedor">
          {d.sales.by_seller.map((v) => (
            <BarRow key={v.seller_name} label={v.seller_name} value={formatCurrency(v.revenue)} color={Colors.light.info} share={v.percentage / 100}
              sub={`${v.sales} venda(s) · ticket médio ${formatCurrency(v.average_ticket)}`} />
          ))}
        </Card>
      )}
      <FoldSection title="Detalhes das vendas" summary={`${d.sales.returns_count} devolução(ões)`}>
        <Row label="Descontos dados" value={d.sales.discount_total} />
        <Row label="Vendas com cliente cadastrada" value={d.sales.sales_with_customer} count />
        <Row label="Vendas sem cliente cadastrada" value={d.sales.sales_without_customer} count />
        <Row label="Clientes novas cadastradas" value={d.new_customers} count />
        <Row label={`Devoluções e trocas (${d.sales.returns_count})`} value={d.sales.returns_total} />
        <Row label={`Vendas canceladas (${d.sales.cancelled_count})`} value={d.sales.cancelled_total} />
      </FoldSection>
    </>
  );

  // 4. O dinheiro do mês
  const fin = d?.finance;
  const money = !!d && !!fin && (
    <Card title="O dinheiro do mês" hint="Tinha, entrou, saiu e quanto deveria ter nas contas.">
      {!fin.started ? (
        <>
          <Text style={styles.note}>O Financeiro (contas e saldos) ainda não foi implantado nesta loja. Sem ele o app não sabe quanto dinheiro há em cada conta.</Text>
          <AppButton variant="primary" size="md" label="Ir para Caixa e contas" onPress={() => router.push('/finance' as any)} style={styles.left} />
        </>
      ) : fin.unavailable ? (
        <Text style={styles.note}>{fin.unavailable}</Text>
      ) : (
        <>
          <View style={styles.equation}>
            <Row label="Tinha no começo do mês" value={fin.start_total ?? 0} />
            <Row label="+ Entrou" value={fin.entered?.total ?? 0} />
            <Row label="− Saiu" value={fin.left?.total ?? 0} />
            <Row label="= Deveria ter no fim do mês" value={fin.expected_total ?? 0} bold />
          </View>
          {!!fin.accounts?.length && (
            <View style={styles.stats}>
              {fin.accounts.map((a) => <Stat key={a.id} label={`${a.name} (${KIND[a.kind] ?? a.kind})`} value={formatCurrency(a.expected)} note={`começo: ${formatCurrency(a.start)}`} />)}
            </View>
          )}
          <Text style={styles.small}>
            {fin.closed
              ? `Mês fechado em ${fin.closed.closed_at.slice(8, 10)}/${fin.closed.closed_at.slice(5, 7)}: contado ${formatCurrency(fin.closed.counted_total)}, diferença do caixa ${formatCurrency(fin.closed.difference)}.`
              : 'Este mês ainda não foi fechado.'}
          </Text>
          <FoldSection title="De onde veio e para onde foi" summary={`entrou ${formatCurrency(fin.entered?.total ?? 0)}`}>
            {fin.entered?.sales.map((s) => <Row key={s.label} label={`Entrou: vendas em ${s.label.toLowerCase()}`} value={s.amount} />)}
            <Row label="Entrou: fiado recebido" value={fin.entered?.receivables_received ?? 0} />
            {fin.entered?.other.map((o) => <Row key={o.label} label={`Entrou: ${o.label.toLowerCase()}`} value={o.amount} />)}
            {fin.left?.expenses.map((e) => <Row key={e.label} label={`Saiu: despesa de ${e.label.toLowerCase()}`} value={e.amount} />)}
            <Row label="Saiu: compras de mercadoria e dívidas pagas" value={fin.left?.purchases_and_debts ?? 0} />
            <Row label="Saiu: devoluções ao cliente" value={fin.left?.refunds ?? 0} />
            {fin.left?.other.map((o) => <Row key={o.label} label={`Saiu: ${o.label.toLowerCase()}`} value={o.amount} />)}
          </FoldSection>
          <View style={styles.actions}>
            <AppButton variant="outlined" size="md" label="Ver extrato passo a passo" onPress={() => router.push('/finance/statement' as any)} />
            <AppButton variant="outlined" size="md" label="Ir para o Fechamento do mês" onPress={() => router.push('/finance/closing' as any)} />
          </View>
        </>
      )}
    </Card>
  );

  // 5. Retrato de hoje
  const today = !!d && (
    <>
      <Card title="Hoje: a receber e a pagar" hint="Retrato de agora, não do mês escolhido.">
        <View style={styles.stats}>
          <Stat label="Fiado a receber" value={formatCurrency(d.to_receive.fiado_open)} note="total em aberto" onPress={() => router.push('/finance/receivables' as any)} />
          <Stat label="Fiado vencido" value={formatCurrency(d.to_receive.fiado_overdue)} note={d.to_receive.fiado_overdue > 0 ? 'passou do prazo' : 'nada vencido'} warn={d.to_receive.fiado_overdue > 0}
            onPress={() => router.push('/finance/receivables' as any)} />
          <Stat label="Contas a pagar" value={formatCurrency(d.to_pay.open_total)} note="despesas e contas em aberto" onPress={() => router.push('/finance/payables' as any)} />
          <Stat label="Contas vencidas" value={formatCurrency(d.to_pay.overdue_total)} note={`${d.to_pay.overdue_count} conta(s)`} warn={d.to_pay.overdue_count > 0}
            onPress={() => router.push('/finance/payables' as any)} />
        </View>
        <Text style={styles.small}>
          {`Fiado que vence nos próximos 7 dias: ${formatCurrency(d.to_receive.due_this_week)}. Neste mês, ${formatCurrency(d.to_receive.launched_in_month)} foram lançados em fiado (${d.to_receive.launched_count} parcela(s)) e ${formatCurrency(d.to_receive.received_in_month)} foram recebidos.`}
        </Text>
      </Card>
      <Card title="Estoque (hoje)">
        <View style={styles.stats}>
          <Stat label="Peças em estoque" value={String(d.stock.pieces)} note={`giro ${d.stock.turnover_pct.toFixed(0)}% (vendidas sobre recebidas)`} />
          <Stat label="Valor a preço de venda" value={formatCurrency(d.stock.sale_value)} />
          <Stat label="Valor a preço de custo" value={formatCurrency(d.stock.cost_value)} />
          <Stat label="Paradas há mais de 30 dias" value={String(d.stock.stagnant_units)} note="peças sem venda" warn={d.stock.stagnant_units > 0} />
        </View>
        <Text style={styles.small}>{`${d.stock.other_out} peça(s) saíram sem venda (baixa, perda ou ajuste).`}</Text>
      </Card>
    </>
  );

  return (
    <View style={styles.container}>
      <PageHeader title="Relatório mensal" subtitle="Como foi o mês da loja" showBackButton backFallback="/(tabs)/more" />
      <ScrollView contentContainerStyle={[styles.content, desktop]} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />}>
        <View style={styles.monthBar}>
          <TouchableOpacity onPress={() => go(-1)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Mês anterior">
            <Ionicons name="chevron-back" size={24} color={brand.primary} />
          </TouchableOpacity>
          <View style={{ alignItems: 'center', flex: 1, gap: 4 }}>
            <Text style={styles.monthTitle}>{d?.label ?? ''}</Text>
            <Text style={styles.small}>{d ? (d.month_finished ? 'Mês terminado' : dayInfo ? `Mês em andamento · dia ${dayInfo.day} de ${dayInfo.total}` : 'Mês em andamento') : ''}</Text>
            {!!dayInfo && (
              <View style={styles.monthTrack} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <View style={[styles.monthFill, { width: `${Math.round((dayInfo.day / dayInfo.total) * 100)}%` as `${number}%`, backgroundColor: brand.primary }]} />
              </View>
            )}
          </View>
          <TouchableOpacity onPress={() => go(1)} disabled={isCurrent} hitSlop={10} accessibilityRole="button" accessibilityLabel="Próximo mês">
            <Ionicons name="chevron-forward" size={24} color={isCurrent ? Colors.light.border : brand.primary} />
          </TouchableOpacity>
        </View>

        {q.isLoading && <ScreenLoader />}
        {!!q.error && <Text style={styles.error}>{parseApiError(q.error)}</Text>}

        {!!d && (
          <>
            {Platform.OS === 'web' && (
              <PdfActions getPdf={() => getMonthlyReportPdf(sel.year, sel.month)} cacheKey={`${sel.year}-${sel.month}`} shareLabel="Abrir PDF do mês" variant="outlined" size="md" fullWidth={false} />
            )}
            {isDesktop ? (
              <View style={styles.columns}>
                <View style={styles.col}>{answer}{attention}{selling}</View>
                <View style={styles.col}>{money}{today}</View>
              </View>
            ) : (
              <>
                {answer}
                {attention}
                {selling}
                {money}
                {today}
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  content: { padding: 16, paddingBottom: 48, gap: 12 },
  columns: { flexDirection: 'row', gap: 20, alignItems: 'flex-start' },
  col: { flex: 1, gap: 12, minWidth: 0 },
  card: { backgroundColor: Colors.light.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.light.border, gap: 10 },
  hero: { backgroundColor: Colors.light.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.light.border, gap: 10 },
  eyebrow: { fontSize: 11, fontWeight: theme.fontWeight.extrabold, letterSpacing: 1, color: Colors.light.textSecondary },
  profit: { fontSize: 34, fontWeight: theme.fontWeight.extrabold, color: Colors.light.text },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stat: { flexGrow: 1, flexBasis: 120, minWidth: 0, backgroundColor: Colors.light.background, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: Colors.light.border, gap: 2 },
  statLabel: { fontSize: 12, color: Colors.light.textSecondary },
  statValue: { fontSize: 17, fontWeight: theme.fontWeight.extrabold, color: Colors.light.text },
  title: { fontSize: 16, fontWeight: theme.fontWeight.extrabold, color: Colors.light.text },
  note: { fontSize: 14, lineHeight: 20, color: Colors.light.textSecondary },
  small: { fontSize: 12, lineHeight: 17, color: Colors.light.textSecondary },
  smallStrong: { fontSize: 12, fontWeight: theme.fontWeight.bold, color: Colors.light.text },
  deltaLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  left: { alignSelf: 'flex-start' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  equation: { gap: 6 },
  monthBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.light.card, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: Colors.light.border },
  monthTitle: { fontSize: 17, fontWeight: theme.fontWeight.extrabold, color: Colors.light.text },
  monthTrack: { alignSelf: 'stretch', height: 4, borderRadius: 2, backgroundColor: Colors.light.border, overflow: 'hidden', marginHorizontal: 12 },
  monthFill: { height: 4, borderRadius: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  rowLabel: { fontSize: 14, color: Colors.light.text },
  rowValue: { fontSize: 14, fontWeight: theme.fontWeight.bold, color: Colors.light.text },
  attRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  tag: { fontSize: 12, fontWeight: theme.fontWeight.extrabold, width: 48, marginTop: 2 },
  att: { flex: 1, fontSize: 14, lineHeight: 20, color: Colors.light.text },
  error: { color: Colors.light.error, fontWeight: theme.fontWeight.semibold },
});
