/**
 * Relatório mensal da loja: parte FINANCEIRA (dinheiro, contas, fiado, contas a pagar) e ANALÍTICA (resultado contra o mês
 * anterior, vendas, estoque), com "pontos de atenção" em frase pronta. Números do servidor
 * (backend/app/services/monthly_report_service.py), as mesmas contas das outras telas. Todo número vem com uma palavra.
 */
import React, { useState } from 'react';
import { Platform, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Button } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';

import PageHeader from '@/components/layout/PageHeader';
import { Colors } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { useDesktopContentStyle } from '@/hooks/useLayout';
import { formatCurrency } from '@/utils/format';
import { parseApiError, showApiError } from '@/utils/apiError';
import PdfActions from '@/components/ui/PdfActions';
import { getMonthlyReport, getMonthlyReportPdf } from '@/services/monthlyReportService';
import ScreenLoader from '@/components/ui/ScreenLoader';

const PAYMENTS: Record<string, string> = {
  cash: 'Dinheiro', credit_card: 'Cartão de crédito', debit_card: 'Cartão de débito', pix: 'PIX', bank_transfer: 'Transferência',
  installments: 'Parcelado', on_account: 'Fiado', loyalty_points: 'Pontos',
};
const KIND: Record<string, string> = { drawer: 'Gaveta', bank: 'Banco', card_machine: 'Maquininha' };

const pct = (v: number | null | undefined) => (v === null || v === undefined ? 'sem mês anterior para comparar' : `${v > 0 ? '+' : ''}${v.toFixed(1).replace('.', ',')}% sobre o mês anterior`);

function Row({ label, value, sub, bold, count }: { label: string; value: number | string; sub?: string; bold?: boolean; count?: boolean }) {
  const text = typeof value === 'string' ? value : count ? String(value) : formatCurrency(value);
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, bold && { fontWeight: '800' }]}>{label}</Text>
        {!!sub && <Text style={styles.small}>{sub}</Text>}
      </View>
      <Text style={[styles.rowValue, bold && { fontWeight: '800' }, typeof value === 'number' && value < 0 && { color: Colors.light.error }]}>{text}</Text>
    </View>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      {children}
    </View>
  );
}

export default function MonthlyReportScreen() {
  const router = useRouter();
  const brand = useBrandingColors();
  const desktop = useDesktopContentStyle();
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

  return (
    <View style={styles.container}>
      <PageHeader title="Relatório mensal" subtitle="Financeiro e análise do mês" showBackButton backFallback="/(tabs)/more" />
      <ScrollView contentContainerStyle={[styles.content, desktop]} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />}>
        <View style={styles.monthBar}>
          <TouchableOpacity onPress={() => go(-1)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Mês anterior">
            <Ionicons name="chevron-back" size={24} color={brand.primary} />
          </TouchableOpacity>
          <View style={{ alignItems: 'center', flex: 1 }}>
            <Text style={styles.monthTitle}>{d?.label ?? ''}</Text>
            <Text style={styles.small}>{d ? (d.month_finished ? 'Mês terminado' : 'Mês em andamento') : ''}</Text>
          </View>
          <TouchableOpacity onPress={() => go(1)} disabled={isCurrent} hitSlop={10} accessibilityRole="button" accessibilityLabel="Próximo mês">
            <Ionicons name="chevron-forward" size={24} color={isCurrent ? Colors.light.border : brand.primary} />
          </TouchableOpacity>
        </View>

        {q.isLoading && (
          <ScreenLoader />
        )}
        {!!q.error && <Text style={styles.error}>{parseApiError(q.error)}</Text>}

        {!!d && (
          <>
            {Platform.OS === 'web' && (
              <PdfActions getPdf={() => getMonthlyReportPdf(sel.year, sel.month)} cacheKey={`${sel.year}-${sel.month}`} shareLabel="Abrir PDF do mês" variant="outlined" size="md" fullWidth={false} />
            )}

            <Card title="Saúde da loja: o que olhar">
              {d.attention.map((a, i) => (
                <View key={i} style={styles.attRow}>
                  <Text style={[styles.tag, { color: levelColor(a.level) }]}>{levelTag(a.level)}</Text>
                  <Text style={styles.att}>{a.text}</Text>
                </View>
              ))}
            </Card>

            <Card title="Resultado do mês">
              <Row label="Faturamento (vendas menos devoluções)" value={d.result.current.revenue} sub={pct(d.result.change.revenue)} />
              <Row label="Custo das peças vendidas" value={d.result.current.cost} />
              <Row label="Lucro das vendas" value={d.result.current.gross_profit} sub={`Margem de lucro: ${d.result.current.gross_margin_pct.toFixed(1).replace('.', ',')}%`} />
              <Row label="Despesas do mês" value={d.result.current.expenses} sub={pct(d.result.change.expenses)} />
              <Row label="Lucro do mês (depois das despesas)" value={d.result.current.net_profit} bold sub={pct(d.result.change.net_profit)} />
              <Row label="Vendas realizadas" value={d.result.current.sales_count} count sub={pct(d.result.change.sales_count)} />
              <Row label="Ticket médio (valor por venda)" value={d.result.current.average_ticket} sub={pct(d.result.change.average_ticket)} />
              <Text style={styles.small}>
                {d.previous_label}: faturamento {formatCurrency(d.result.previous.revenue)}, lucro do mês {formatCurrency(d.result.previous.net_profit)}.
                {!d.month_finished ? ' Mês em andamento: a comparação é com o mês anterior inteiro.' : ''}
              </Text>
              {d.result.current.expenses_by_category.map((c) => <Row key={c.label} label={`Despesa: ${c.label}`} value={c.amount} />)}
            </Card>

            <Card title="Vendas do mês">
              <Row label="Peças vendidas" value={d.sales.pieces_sold} count />
              <Row label="Descontos dados" value={d.sales.discount_total} />
              <Row label="Vendas com cliente cadastrada" value={d.sales.sales_with_customer} count />
              <Row label="Vendas sem cliente cadastrada" value={d.sales.sales_without_customer} count />
              <Row label="Clientes novas cadastradas" value={d.new_customers} count />
              <Row label={`Devoluções e trocas (${d.sales.returns_count})`} value={d.sales.returns_total} />
              <Row label={`Vendas canceladas (${d.sales.cancelled_count})`} value={d.sales.cancelled_total} />
              {d.sales.payment_breakdown.length > 0 && <Text style={styles.sub}>Como as clientes pagaram</Text>}
              {d.sales.payment_breakdown.map((p) => (
                <Row key={p.method} label={PAYMENTS[p.method] ?? p.method} value={p.total} sub={`${p.count} venda(s) · ${p.percentage.toFixed(0)}% do total`} />
              ))}
              {d.sales.by_category.length > 0 && <Text style={styles.sub}>Faturamento por categoria</Text>}
              {d.sales.by_category.map((c) => (
                <Row key={c.category} label={c.category} value={c.revenue} sub={`${c.pieces} peça(s) · ${c.percentage.toFixed(0)}% do faturamento · lucro ${formatCurrency(c.profit)}`} />
              ))}
              {d.sales.by_seller.length > 1 && <Text style={styles.sub}>Faturamento por vendedor</Text>}
              {d.sales.by_seller.length > 1 && d.sales.by_seller.map((v) => (
                <Row key={v.seller_name} label={v.seller_name} value={v.revenue} sub={`${v.sales} venda(s) · ticket médio ${formatCurrency(v.average_ticket)}`} />
              ))}
              {d.sales.top_products.length > 0 && <Text style={styles.sub}>Mais vendidos</Text>}
              {d.sales.top_products.slice(0, 5).map((p, i) => (
                <Row key={i} label={p.product_name} value={p.revenue}
                  sub={`${p.quantity_sold} peça(s) · lucro ${formatCurrency(p.profit)}${p.variant_label ? ` · ${p.variant_label}` : ''}${p.variant_display_code ? ` ${p.variant_display_code}` : ''}`} />
              ))}
            </Card>

            <Card title="Financeiro: o dinheiro do mês">
              {!d.finance.started ? (
                <>
                  <Text style={styles.note}>O Financeiro (contas e saldos) ainda não foi implantado nesta loja. Sem ele o app não sabe quanto dinheiro há em cada conta.</Text>
                  <Button mode="contained" buttonColor={brand.primary} onPress={() => router.push('/finance' as any)} style={styles.left}>Ir para Caixa e contas</Button>
                </>
              ) : d.finance.unavailable ? (
                <Text style={styles.note}>{d.finance.unavailable}</Text>
              ) : (
                <>
                  <Row label="Tinha no começo do mês" value={d.finance.start_total ?? 0} />
                  {d.finance.entered?.sales.map((s) => <Row key={s.label} label={`Entrou: vendas em ${s.label.toLowerCase()}`} value={s.amount} />)}
                  <Row label="Entrou: fiado recebido" value={d.finance.entered?.receivables_received ?? 0} />
                  {d.finance.entered?.other.map((o) => <Row key={o.label} label={`Entrou: ${o.label.toLowerCase()}`} value={o.amount} />)}
                  <Row label="Total que entrou" value={d.finance.entered?.total ?? 0} bold />
                  {d.finance.left?.expenses.map((e) => <Row key={e.label} label={`Saiu: despesa de ${e.label.toLowerCase()}`} value={e.amount} />)}
                  <Row label="Saiu: compras de mercadoria e dívidas pagas" value={d.finance.left?.purchases_and_debts ?? 0} />
                  <Row label="Saiu: devoluções ao cliente" value={d.finance.left?.refunds ?? 0} />
                  {d.finance.left?.other.map((o) => <Row key={o.label} label={`Saiu: ${o.label.toLowerCase()}`} value={o.amount} />)}
                  <Row label="Total que saiu" value={d.finance.left?.total ?? 0} bold />
                  <Row label="Deveria ter no fim do mês" value={d.finance.expected_total ?? 0} bold />
                  {d.finance.accounts?.map((a) => (
                    <Row key={a.id} label={`${a.name} (${KIND[a.kind] ?? a.kind})`} value={a.expected} sub={`Começo do mês: ${formatCurrency(a.start)}`} />
                  ))}
                  <Text style={styles.small}>
                    {d.finance.closed
                      ? `Fechado em ${d.finance.closed.closed_at.slice(8, 10)}/${d.finance.closed.closed_at.slice(5, 7)}: contado ${formatCurrency(d.finance.closed.counted_total)}, diferença do caixa ${formatCurrency(d.finance.closed.difference)}.`
                      : 'Este mês ainda não foi fechado.'}
                  </Text>
                  <Button mode="outlined" onPress={() => router.push('/finance/closing' as any)} style={styles.left}>Ir para o Fechamento do mês</Button>
                </>
              )}
            </Card>

            <Card title="A receber e a pagar (hoje)">
              <Row label="Fiado a receber (total em aberto)" value={d.to_receive.fiado_open} />
              <Row label="Fiado já vencido" value={d.to_receive.fiado_overdue} />
              <Row label="Fiado que vence nos próximos 7 dias" value={d.to_receive.due_this_week} />
              <Row label={`Fiado lançado neste mês (${d.to_receive.launched_count} parcela(s))`} value={d.to_receive.launched_in_month} />
              <Row label="Fiado recebido neste mês" value={d.to_receive.received_in_month} />
              <Row label="Despesas e contas a pagar em aberto" value={d.to_pay.open_total} />
              <Row label={`Contas a pagar vencidas (${d.to_pay.overdue_count})`} value={d.to_pay.overdue_total} />
            </Card>

            <Card title="Estoque (hoje)">
              <Row label="Peças em estoque" value={d.stock.pieces} count />
              <Row label="Valor do estoque a preço de venda" value={d.stock.sale_value} />
              <Row label="Valor do estoque a preço de custo" value={d.stock.cost_value} />
              <Row label="Giro: peças vendidas sobre as recebidas" value={`${d.stock.turnover_pct.toFixed(0)}%`} />
              <Row label="Peças paradas há mais de 30 dias" value={d.stock.stagnant_units} count />
              <Row label="Peças que saíram sem venda (baixa, perda, ajuste)" value={d.stock.other_out} count />
            </Card>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  content: { padding: 16, paddingBottom: 48, gap: 12 },
  card: { backgroundColor: Colors.light.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.light.border, gap: 8 },
  title: { fontSize: 16, fontWeight: '800', color: Colors.light.text },
  sub: { fontSize: 13, fontWeight: '800', color: Colors.light.textSecondary, marginTop: 6 },
  note: { fontSize: 13, lineHeight: 19, color: Colors.light.textSecondary },
  small: { fontSize: 12, lineHeight: 17, color: Colors.light.textSecondary },
  left: { alignSelf: 'flex-start' },
  monthBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.light.card, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: Colors.light.border },
  monthTitle: { fontSize: 17, fontWeight: '800', color: Colors.light.text },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  rowLabel: { fontSize: 14, color: Colors.light.text },
  rowValue: { fontSize: 14, fontWeight: '700', color: Colors.light.text },
  attRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  tag: { fontSize: 12, fontWeight: '800', width: 48, marginTop: 2 },
  att: { flex: 1, fontSize: 14, lineHeight: 20, color: Colors.light.text },
  error: { color: Colors.light.error, fontWeight: '600' },
});
