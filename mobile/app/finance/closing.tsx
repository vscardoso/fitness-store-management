/**
 * Fechamento do mês: a planilha da dona em forma de tela (docs/ESTUDO_FECHAMENTO_DO_MES.md).
 * começo do mês + entrou - saiu = deveria ter; ela digita o que tem (gaveta contada, extrato do banco) e vê a
 * diferença (quebra). "Fechar o mês" grava a fotografia; o saldo contado vira o começo do mês seguinte.
 * Tudo calculado pelo servidor (backend/app/services/month_closing_service.py).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Button, TextInput } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';

import PageHeader from '@/components/layout/PageHeader';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { ActivityIndicator } from '@/components/ui/MagnifierLoader';
import { Colors } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { useDesktopContentStyle } from '@/hooks/useLayout';
import { useAuth } from '@/hooks/useAuth';
import { isAdminRole } from '@/utils/roles';
import { formatCurrency } from '@/utils/format';
import { parseApiError, showApiError } from '@/utils/apiError';
import { differenceText, parseSignedMoney, signedMoneyInput, toMoneyField } from '@/utils/cashMoney';
import {
  closeMonth, getMonthClosing, listClosingMonths, reopenMonth, type ClosingMonth, type MonthClosing,
} from '@/services/financeService';

/** Mês que abre primeiro: o mais antigo terminado e ainda aberto; se todos fechados, o atual. */
function defaultMonth(months: ClosingMonth[]): ClosingMonth | undefined {
  const now = new Date();
  const finished = months.filter((m) => m.year * 12 + m.month < now.getFullYear() * 12 + now.getMonth() + 1);
  const open = finished.filter((m) => !m.closed);
  return open[open.length - 1] ?? months[0];
}

export default function ClosingScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const brand = useBrandingColors();
  const desktop = useDesktopContentStyle();
  const { user } = useAuth();
  const admin = isAdminRole(user?.role);
  const months = useQuery({ queryKey: ['finance-closings'], queryFn: listClosingMonths });
  const [sel, setSel] = useState<{ year: number; month: number } | null>(null);
  useEffect(() => {
    if (!sel && months.data?.months.length) {
      const m = defaultMonth(months.data.months);
      if (m) setSel({ year: m.year, month: m.month });
    }
  }, [months.data, sel]);

  const q = useQuery({
    queryKey: ['finance-closing', sel?.year, sel?.month],
    queryFn: () => getMonthClosing(sel!.year, sel!.month),
    enabled: !!sel,
  });
  const data = q.data;
  const [counted, setCounted] = useState<Record<number, string>>({});
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');
  const [confirm, setConfirm] = useState<'close' | 'reopen' | null>(null);
  useEffect(() => {
    // começa com o que deveria ter: ela só corrige o que for diferente
    if (data && !data.closed) {
      setCounted(Object.fromEntries(data.accounts.map((a) => [a.id, toMoneyField(a.expected)])));
      setNotes('');
      setFormError('');
    }
  }, [data?.year, data?.month, data?.closed?.id, data?.expected_total]); // eslint-disable-line react-hooks/exhaustive-deps

  const diffs = useMemo(() => {
    if (!data || data.closed) return null;
    let total = 0; let ok = true;
    const per = data.accounts.map((a) => {
      const v = parseSignedMoney(counted[a.id] ?? '');
      if (v === null) ok = false;
      const d = v === null ? 0 : Math.round((v - a.expected) * 100) / 100;
      total += d;
      return { id: a.id, value: v, diff: d };
    });
    return { per, total: Math.round(total * 100) / 100, ok };
  }, [data, counted]);

  const doClose = useMutation({
    mutationFn: () => closeMonth(sel!.year, sel!.month,
      Object.fromEntries(diffs!.per.map((p) => [String(p.id), p.value ?? 0])), notes.trim() || undefined),
    onSuccess: async () => { setConfirm(null); await queryClient.invalidateQueries(); },
    onError: (e) => { setConfirm(null); setFormError(parseApiError(e) || 'Não foi possível fechar o mês.'); },
  });
  const doReopen = useMutation({
    mutationFn: () => reopenMonth(sel!.year, sel!.month),
    onSuccess: async () => { setConfirm(null); await queryClient.invalidateQueries(); },
    onError: (e) => { setConfirm(null); showApiError(e, 'Não foi possível reabrir'); },
  });

  if (months.isLoading || (sel && q.isLoading)) {
    return <View style={styles.center}><ActivityIndicator size="large" color={brand.primary} /></View>;
  }

  if (months.data && !months.data.started) {
    return (
      <View style={styles.container}>
        <PageHeader title="Fechamento do mês" showBackButton backFallback="/finance" />
        <ScrollView contentContainerStyle={[styles.content, desktop]}>
          <View style={styles.card}>
            <Text style={styles.title}>Implante o financeiro primeiro</Text>
            <Text style={styles.note}>O fechamento parte do saldo de cada conta no dia da implantação.</Text>
            <Button mode="contained" buttonColor={brand.primary} style={styles.left} onPress={() => router.push('/finance' as any)}>
              Ir para Caixa e contas
            </Button>
          </View>
        </ScrollView>
      </View>
    );
  }

  const list = months.data?.months ?? [];
  const idx = list.findIndex((m) => m.year === sel?.year && m.month === sel?.month);
  const go = (step: number) => { const m = list[idx + step]; if (m) setSel({ year: m.year, month: m.month }); };
  const closed = data?.closed;
  const totalDiff = closed ? closed.difference : diffs?.total ?? 0;
  const dt = differenceText(totalDiff, formatCurrency);
  const needNotes = !closed && Math.abs(totalDiff) >= 50 && !notes.trim();

  return (
    <View style={styles.container}>
      <PageHeader title="Fechamento do mês" subtitle="O dinheiro bate?" showBackButton backFallback="/finance" />
      <ScrollView contentContainerStyle={[styles.content, desktop]} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />}>
        <View style={styles.monthBar}>
          {/* a lista vem do mais novo para o mais antigo: "mês anterior" é o próximo item */}
          <TouchableOpacity onPress={() => go(1)} disabled={idx >= list.length - 1} hitSlop={10} accessibilityRole="button" accessibilityLabel="Mês anterior">
            <Ionicons name="chevron-back" size={24} color={idx >= list.length - 1 ? Colors.light.border : brand.primary} />
          </TouchableOpacity>
          <View style={{ alignItems: 'center', flex: 1 }}>
            <Text style={styles.monthTitle}>{data?.label ?? ''}</Text>
            <Text style={[styles.badge, { color: closed ? Colors.light.success : Colors.light.warning }]}>
              {closed ? 'Fechado' : data?.month_finished ? 'Aberto' : 'Mês em andamento'}
            </Text>
          </View>
          <TouchableOpacity onPress={() => go(-1)} disabled={idx <= 0} hitSlop={10} accessibilityRole="button" accessibilityLabel="Próximo mês">
            <Ionicons name="chevron-forward" size={24} color={idx <= 0 ? Colors.light.border : brand.primary} />
          </TouchableOpacity>
        </View>

        {!!q.error && <Text style={styles.error}>{parseApiError(q.error)}</Text>}
        {!!data && (
          <>
            {!!closed && closed.changed_since_close !== 0 && (
              <View style={[styles.card, styles.warn]}>
                <Text style={styles.warnText}>
                  Depois do fechamento entrou lançamento com data deste mês: o que deveria ter mudou {formatCurrency(closed.changed_since_close)}.
                  {admin && closed.is_latest ? ' Para corrigir, reabra o mês e feche de novo.' : ''}
                </Text>
              </View>
            )}

            {idx === 0 && (
              <View style={styles.card}>
                <Text style={styles.title}>Total geral de hoje</Text>
                <Row label="Dinheiro nas contas (gaveta, bancos e maquininha)" value={data.expected_total} plain />
                <Row label="Fiado e empréstimos a receber" value={data.to_receive.fiado_open + data.to_receive.loans} plain />
                <Row label="Despesas e empréstimos a pagar" value={-(data.to_pay.payables_open + data.to_pay.loans)} plain />
                <Row label="Sobraria se tudo fosse recebido e pago"
                  value={data.expected_total + data.to_receive.fiado_open + data.to_receive.loans - data.to_pay.payables_open - data.to_pay.loans} plain bold />
                <Text style={styles.small}>
                  O estoque (R$ {data.stock.cost_value.toFixed(2).replace('.', ',')} a preço de custo) não entra: não é dinheiro. Isto é só uma conta de hoje, nada é lançado.
                </Text>
              </View>
            )}

            <Section title="1. Começo do mês" total={data.start_total}
              note={data.partial_start ? 'Começa no dia da implantação.' : undefined}>
              {data.accounts.map((a) => <Row key={a.id} label={a.name} value={a.start} />)}
            </Section>

            <Section title="2. Entrou" total={data.entered.total} positive>
              {data.entered.sales.map((s) => <Row key={s.method} label={`Vendas em ${s.label.toLowerCase()}`} value={s.amount} />)}
              <Row label="Fiado recebido" value={data.entered.receivables_received} />
              {data.entered.other.map((o) => <Row key={o.kind} label={o.label} value={o.amount} />)}
              <Row label="Colocado no caixa" value={data.entered.cash_register_in} />
              {!!data.entered.sales_on_account && (
                <Text style={styles.small}>Vendido no fiado no mês: {formatCurrency(data.entered.sales_on_account)} (entra quando ela pagar).</Text>
              )}
            </Section>

            <Section title="3. Saiu" total={-data.left.total}>
              {data.left.expenses.map((e) => <Row key={e.label} label={`Despesas: ${e.label}`} value={-e.amount} />)}
              <Row label="Compras e dívidas pagas" value={-data.left.purchases_and_debts} />
              <Row label="Devoluções em dinheiro" value={-data.left.refunds} />
              {data.left.other.map((o) => <Row key={o.kind} label={o.label} value={-o.amount} />)}
              <Row label="Tirado do caixa" value={-data.left.cash_register_out} />
              {!!data.left.expenses_without_account.count && (
                <Text style={styles.small}>
                  {data.left.expenses_without_account.count} despesa(s) sem dizer de onde saiu o dinheiro ({formatCurrency(data.left.expenses_without_account.amount)}):
                  não entram aqui. Se saíram de uma conta, edite a despesa e escolha “Pago com”.
                </Text>
              )}
            </Section>

            <View style={styles.card}>
              <Text style={styles.title}>4. Deveria ter</Text>
              <Text style={styles.total}>{formatCurrency(data.expected_total)}</Text>
              {!!data.transfers_between_accounts && (
                <Text style={styles.small}>Transferências entre as contas no mês: {formatCurrency(data.transfers_between_accounts)} (não mudam o total).</Text>
              )}
            </View>

            <View style={styles.card}>
              <Text style={styles.title}>5. Quanto tem</Text>
              <Text style={styles.note}>
                {closed ? 'O que foi contado no fechamento.' : 'Conte a gaveta e olhe o extrato de cada banco. Corrija só o que for diferente.'}
              </Text>
              {data.accounts.map((a) => {
                const p = diffs?.per.find((x) => x.id === a.id);
                const d = closed ? a.difference ?? 0 : p?.diff ?? 0;
                return (
                  <View key={a.id} style={styles.countRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowLabel}>{a.name}</Text>
                      <Text style={styles.small}>Deveria ter {formatCurrency(a.expected)}</Text>
                      {d !== 0 && <Text style={[styles.small, { color: d < 0 ? Colors.light.error : Colors.light.success }]}>{differenceText(d, formatCurrency).text}</Text>}
                    </View>
                    {closed ? (
                      <Text style={styles.rowValue}>{formatCurrency(a.counted ?? a.expected)}</Text>
                    ) : (
                      <TextInput mode="outlined" dense style={styles.input} value={counted[a.id] ?? ''} keyboardType="numbers-and-punctuation"
                        left={<TextInput.Affix text="R$" />} accessibilityLabel={`Quanto tem em ${a.name}`}
                        onChangeText={(t) => setCounted({ ...counted, [a.id]: signedMoneyInput(t, a.kind !== 'cash') })}
                        activeOutlineColor={brand.primary} />
                    )}
                  </View>
                );
              })}
            </View>

            <View style={[styles.card, { borderColor: dt.kind === 'ok' ? Colors.light.success : dt.kind === 'short' ? Colors.light.error : Colors.light.warning }]}>
              <Text style={styles.title}>6. Diferença</Text>
              <Text style={[styles.total, { color: dt.kind === 'ok' ? Colors.light.success : dt.kind === 'short' ? Colors.light.error : Colors.light.warning }]}>{dt.text}</Text>
              {closed ? (
                <>
                  {!!closed.notes && <Text style={styles.note}>Observação: {closed.notes}</Text>}
                  <Text style={styles.small}>
                    Fechado {closed.closed_by_name ? `por ${closed.closed_by_name} ` : ''}em {new Date(closed.closed_at).toLocaleString('pt-BR')}.
                  </Text>
                  {admin && closed.is_latest && (
                    <Button mode="outlined" style={styles.left} onPress={() => setConfirm('reopen')}>Reabrir o mês</Button>
                  )}
                </>
              ) : (
                <>
                  <TextInput mode="outlined" label={Math.abs(totalDiff) >= 50 ? 'Observação (obrigatória)' : 'Observação (opcional)'}
                    value={notes} onChangeText={setNotes} multiline activeOutlineColor={brand.primary}
                    placeholder="Ex.: troco que faltou, compra paga em dinheiro sem lançar" />
                  {!!formError && <Text style={styles.error}>{formError}</Text>}
                  {data.month_finished ? (
                    <Button mode="contained" buttonColor={brand.primary} style={styles.left} disabled={!diffs?.ok || needNotes}
                      onPress={() => { setFormError(''); setConfirm('close'); }}>
                      Fechar o mês
                    </Button>
                  ) : (
                    <Text style={styles.small}>O mês ainda não terminou. Dá para conferir agora e fechar no último dia.</Text>
                  )}
                </>
              )}
            </View>

            <Section title="Ainda vai entrar e sair">
              <Row label="Fiado a receber" value={data.to_receive.fiado_open} plain />
              {!!data.to_receive.fiado_overdue && <Row label="  ...já vencido" value={data.to_receive.fiado_overdue} plain />}
              <Row label="Empréstimos a receber" value={data.to_receive.loans} plain />
              <Row label="Despesas a pagar" value={-data.to_pay.payables_open} plain />
              <Row label="Empréstimos que a loja deve" value={-data.to_pay.loans} plain />
            </Section>

            <Section title="Resultado do mês">
              <Row label={`Vendas (${data.result.sales_count})`} value={data.result.revenue} plain />
              <Row label="Custo das peças vendidas" value={-data.result.cost} plain />
              <Row label="Despesas" value={-data.result.expenses} plain />
              <Row label="Sobrou (lucro)" value={data.result.profit} bold plain />
              <Text style={styles.small}>Retirada de sócio, empréstimo e fatura do cartão não entram aqui.</Text>
            </Section>

            <Section title="Estoque hoje">
              <Row label="Peças" value={data.stock.pieces} count plain />
              <Row label="A preço de venda" value={data.stock.sale_value} plain />
              <Row label="A preço de custo" value={data.stock.cost_value} plain />
            </Section>
          </>
        )}
      </ScrollView>

      <ConfirmDialog visible={confirm === 'close'} title={`Fechar ${data?.label ?? ''}?`} type="warning" confirmText="Fechar o mês" cancelText="Voltar"
        message={`${dt.text}. O que você contou vira o saldo de cada conta e o mês não recebe mais lançamentos.`}
        loading={doClose.isPending} onConfirm={() => doClose.mutate()} onCancel={() => setConfirm(null)} />
      <ConfirmDialog visible={confirm === 'reopen'} title={`Reabrir ${data?.label ?? ''}?`} type="warning" confirmText="Reabrir" cancelText="Voltar"
        message="Os ajustes da diferença do caixa são desfeitos e o mês volta a aceitar lançamentos. Depois feche de novo."
        loading={doReopen.isPending} onConfirm={() => doReopen.mutate()} onCancel={() => setConfirm(null)} />
    </View>
  );
}

function Section({ title, total, positive, note, children }: {
  title: string; total?: number; positive?: boolean; note?: string; children: React.ReactNode;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.sectionHead}>
        <Text style={[styles.title, { flex: 1 }]}>{title}</Text>
        {total !== undefined && (
          <Text style={[styles.sectionTotal, total < 0 && { color: Colors.light.error }, positive && total > 0 && { color: Colors.light.success }]}>
            {formatCurrency(total)}
          </Text>
        )}
      </View>
      {!!note && <Text style={styles.small}>{note}</Text>}
      {children}
    </View>
  );
}

function Row({ label, value, plain, bold, count }: { label: string; value: number; plain?: boolean; bold?: boolean; count?: boolean }) {
  if (!value && !plain) return null;
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, bold && { fontWeight: '800' }]} numberOfLines={2}>{label}</Text>
      <Text style={[styles.rowValue, value < 0 && { color: Colors.light.error }, bold && { fontWeight: '800' }]}>
        {count ? String(value) : formatCurrency(value)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.light.background },
  content: { padding: 16, paddingBottom: 48, gap: 12 },
  card: { backgroundColor: Colors.light.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.light.border, gap: 8 },
  warn: { borderColor: Colors.light.warning, backgroundColor: Colors.light.warningLight },
  warnText: { fontSize: 13, lineHeight: 19, color: Colors.light.text, fontWeight: '600' },
  title: { fontSize: 16, fontWeight: '800', color: Colors.light.text },
  note: { fontSize: 13, lineHeight: 19, color: Colors.light.textSecondary },
  small: { fontSize: 12, lineHeight: 17, color: Colors.light.textSecondary },
  total: { fontSize: 26, fontWeight: '800', color: Colors.light.text },
  left: { alignSelf: 'flex-start' },
  monthBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.light.card, borderRadius: 16, padding: 12,
    borderWidth: 1, borderColor: Colors.light.border },
  monthTitle: { fontSize: 17, fontWeight: '800', color: Colors.light.text },
  badge: { fontSize: 12, fontWeight: '800' },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTotal: { fontSize: 16, fontWeight: '800', color: Colors.light.text },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  rowLabel: { flex: 1, fontSize: 14, color: Colors.light.text },
  rowValue: { fontSize: 14, fontWeight: '700', color: Colors.light.text },
  countRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  input: { width: 150, backgroundColor: Colors.light.card },
  error: { color: Colors.light.error, fontWeight: '600' },
});
