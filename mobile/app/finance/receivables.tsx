/**
 * Fiado (a receber): quanto as clientes devem, vencidas em destaque, por cliente. Receber (valor parcial permitido,
 * das parcelas mais antigas para as mais novas), ver e desfazer recebimentos (gerente), lançar fiado antigo e
 * cancelar lançamento errado (gerente). O dinheiro recebido cai na conta da forma (backend: /receivables).
 *
 * Organização: resumo (a receber, vencido, vence em 7 dias), faixa "Cobrar agora" só quando há vencido, filtros em chips
 * e a lista por cliente com uma ação principal (Receber). No notebook: resumo e filtros à esquerda, lista à direita.
 */
import React, { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { TextInput } from 'react-native-paper';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';

import PageHeader from '@/components/layout/PageHeader';
import AppButton from '@/components/ui/AppButton';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';
import BottomSheet from '@/components/ui/BottomSheet';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import DateTimeInput from '@/components/ui/DateTimeInput';
import CustomerSelectionModal from '@/components/sale/CustomerSelectionModal';
import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { useDesktopContentStyle, useIsDesktop } from '@/hooks/useLayout';
import { useAuth } from '@/hooks/useAuth';
import { isManagerRole } from '@/utils/roles';
import { formatCurrency, formatDate } from '@/utils/format';
import { parseApiError, showApiError } from '@/utils/apiError';
import { moneyInput, parseMoneyBr } from '@/utils/cashMoney';
import { dateToIso } from '@/utils/dateBr';
import { FIADO_INTERVALS, type FiadoInterval, defaultFirstDue, dueDates, splitAmount } from '@/utils/fiadoPlan';
import {
  RECEIVE_METHODS, cancelReceivable, createOpeningFiado, listReceivablePayments, listReceivables, receiveFiado,
  undoReceivablePayment, type Receivable, type ReceivableFilter, type ReceiveMethod,
} from '@/services/receivableService';
import type { Customer } from '@/types';
import ScreenLoader from '@/components/ui/ScreenLoader';

const FILTERS: { id: ReceivableFilter; label: string }[] = [
  { id: 'open', label: 'Em aberto' }, { id: 'overdue', label: 'Vencidas' }, { id: 'paid', label: 'Pagas' }, { id: 'all', label: 'Todas' },
];

export default function ReceivablesScreen() {
  const queryClient = useQueryClient();
  const brand = useBrandingColors();
  const desktop = useDesktopContentStyle();
  const isDesktop = useIsDesktop();
  const { user } = useAuth();
  const manager = isManagerRole(user?.role);
  const params = useLocalSearchParams<{ customer?: string }>();
  const customerFilter = params.customer ? Number(params.customer) : undefined;

  const [filter, setFilter] = useState<ReceivableFilter>('open');
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['receivables', filter, customerFilter ?? null],
    queryFn: () => listReceivables(filter, customerFilter),
  });

  const [receiving, setReceiving] = useState<{ customerId: number; name: string; owed: number; amount: string; method: ReceiveMethod; day: Date | undefined } | null>(null);
  const [history, setHistory] = useState<Receivable | null>(null);
  const [canceling, setCanceling] = useState<Receivable | null>(null);
  const [undoing, setUndoing] = useState<number | null>(null);
  const [opening, setOpening] = useState<{ customer: Customer | null; amount: string; count: number; interval: FiadoInterval; first: Date; description: string } | null>(null);
  const [pickCustomer, setPickCustomer] = useState(false);
  const [sheetError, setSheetError] = useState('');

  const { data: payments } = useQuery({
    queryKey: ['receivable-payments', history?.id],
    queryFn: () => listReceivablePayments(history!.id),
    enabled: !!history,
  });

  const refresh = () => queryClient.invalidateQueries();
  const doReceive = useMutation({
    mutationFn: () => receiveFiado({
      customer_id: receiving!.customerId, amount: parseMoneyBr(receiving!.amount) ?? 0,
      payment_method: receiving!.method, received_on: receiving!.day ? dateToIso(receiving!.day) : undefined,
    }),
    onSuccess: async () => { setReceiving(null); await refresh(); },
    onError: (e) => setSheetError(parseApiError(e) || 'Não foi possível receber.'),
  });
  const doOpening = useMutation({
    mutationFn: () => {
      const total = parseMoneyBr(opening!.amount) ?? 0;
      const values = splitAmount(total, opening!.count);
      const dates = dueDates(opening!.first, opening!.count, opening!.interval);
      return createOpeningFiado({
        customer_id: opening!.customer!.id, description: opening!.description.trim() || undefined,
        installments: values.map((v, k) => ({ amount: v, due_date: dateToIso(dates[k]) })),
      });
    },
    onSuccess: async () => { setOpening(null); await refresh(); },
    onError: (e) => setSheetError(parseApiError(e) || 'Não foi possível lançar.'),
  });
  const doCancel = useMutation({
    mutationFn: (id: number) => cancelReceivable(id),
    onSuccess: async () => { setCanceling(null); await refresh(); },
    onError: (e) => { setCanceling(null); showApiError(e, 'Não foi possível cancelar'); },
  });
  const doUndo = useMutation({
    mutationFn: (id: number) => undoReceivablePayment(id),
    onSuccess: async () => { setUndoing(null); setHistory(null); await refresh(); },
    onError: (e) => { setUndoing(null); showApiError(e, 'Não foi possível desfazer'); },
  });

  // por cliente, na ordem do vencimento mais antigo
  const groups = useMemo(() => {
    const map = new Map<number, { id: number; name: string; items: Receivable[]; owed: number; overdue: boolean }>();
    (data?.items ?? []).forEach((r) => {
      const g = map.get(r.customer_id) ?? { id: r.customer_id, name: r.customer_name || 'Cliente', items: [], owed: 0, overdue: false };
      g.items.push(r);
      g.owed += r.outstanding;
      g.overdue = g.overdue || r.overdue;
      map.set(r.customer_id, g);
    });
    return Array.from(map.values());
  }, [data]);

  const s = data?.summary;
  const today = new Date();
  const overdueTotal = s?.overdue_total ?? 0;
  const startOpening = () => {
    setSheetError('');
    setOpening({ customer: null, amount: '', count: 1, interval: 30, first: defaultFirstDue(30), description: '' });
  };

  const label = (r: Receivable) => {
    const part = r.installments_total > 1 ? `Parcela ${r.installment_number} de ${r.installments_total}` : 'Parcela única';
    const origin = r.origin === 'opening' ? (r.description || 'Fiado antigo') : 'Venda';
    return `${origin} · ${part}`;
  };
  const statusText = (r: Receivable) => {
    if (r.status === 'paid') return 'Paga';
    if (r.status === 'canceled') return r.abated_amount > 0 ? 'Abatida por devolução' : 'Cancelada';
    const when = `${r.overdue ? 'Venceu' : 'Vence'} em ${formatDate(r.due_date)}`;
    return r.received_amount > 0 || r.abated_amount > 0 ? `${when} · falta ${formatCurrency(r.outstanding)}` : when;
  };

  // Resumo: o que as clientes devem, o que já venceu e o que vence nos próximos 7 dias
  const hero = (
    <View style={styles.hero} testID="fiado-resumo">
      <Text style={styles.eyebrow}>A RECEBER</Text>
      <Text style={styles.big}>{formatCurrency(s?.open_total ?? 0)}</Text>
      <Text style={styles.itemSub}>{s?.customers ?? 0} cliente(s) · {s?.installments ?? 0} parcela(s) em aberto</Text>
      {(overdueTotal > 0 || !!s?.due_this_week) && (
        <View style={styles.pills}>
          {overdueTotal > 0 && <Badge label={`Vencido ${formatCurrency(overdueTotal)}`} variant="error" size="md" />}
          {!!s?.due_this_week && <Badge label={`Vence em 7 dias ${formatCurrency(s.due_this_week)}`} variant="warning" size="md" />}
        </View>
      )}
      {manager && !customerFilter && (
        <AppButton variant="outlined" size="sm" icon="add" label="Lançar fiado antigo" onPress={startOpening} />
      )}
    </View>
  );

  // "Cobrar agora" só existe quando há parcela vencida e a lista não está só nas vencidas
  const todo = overdueTotal > 0 && filter !== 'overdue' ? (
    <View style={styles.todo} testID="fiado-cobrar">
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.todoTitle}>Cobrar agora</Text>
        <Text style={styles.itemSub}>{`${formatCurrency(overdueTotal)} de parcelas que já venceram`}</Text>
      </View>
      <AppButton variant="outlined" size="sm" label="Ver vencidas" onPress={() => setFilter('overdue')} />
    </View>
  ) : null;

  const filters = (
    <View style={styles.filters}>
      {FILTERS.map((f) => (
        <Chip key={f.id} text={f.label} on={filter === f.id} color={brand.primary} role="tab" onPress={() => setFilter(f.id)} />
      ))}
    </View>
  );

  const list = isLoading ? <ScreenLoader inline /> : groups.length === 0 ? (
    <EmptyState
      icon="book-outline"
      title={filter === 'open' ? 'Ninguém deve nada agora' : 'Nada por aqui'}
      description={filter === 'open' ? 'Quando uma venda for no fiado, ela aparece aqui com o vencimento de cada parcela.' : 'Troque o filtro para ver outras parcelas.'}
      actionLabel={filter === 'open' && manager && !customerFilter ? 'Lançar fiado antigo' : undefined}
      onAction={startOpening}
    />
  ) : (
    <>
      {groups.map((g) => (
        <View key={g.id} style={[styles.group, g.overdue && styles.itemOverdue]}>
          <View style={styles.groupHead}>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={styles.itemTitle}>{g.name}</Text>
              {g.owed > 0 && <Text style={styles.itemSub}>{`Deve ${formatCurrency(g.owed)}`}</Text>}
              {g.overdue && <View style={styles.pills}><Badge label="Tem parcela vencida" variant="error" size="sm" /></View>}
            </View>
            {g.owed > 0 && (
              <AppButton variant="primary" size="sm" label="Receber"
                onPress={() => { setSheetError(''); setReceiving({ customerId: g.id, name: g.name, owed: g.owed, amount: moneyInput(g.owed.toFixed(2)), method: 'pix', day: today }); }} />
            )}
          </View>
          {g.items.map((r) => (
            <View key={r.id} style={styles.row}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.rowTitle}>{label(r)}</Text>
                <Text style={[styles.itemSub, r.overdue && { color: Colors.light.error, fontWeight: theme.fontWeight.bold }]}>{statusText(r)}</Text>
                <View style={styles.itemActions}>
                  {r.received_amount > 0 && (
                    <AppButton variant="text" size="sm" label="Recebimentos" onPress={() => setHistory(r)} />
                  )}
                  {manager && r.origin === 'opening' && r.received_amount === 0 && r.status !== 'canceled' && (
                    <AppButton variant="text" size="sm" label="Cancelar lançamento" textColor={Colors.light.textSecondary} onPress={() => setCanceling(r)} />
                  )}
                </View>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.amount}>{formatCurrency(r.amount)}</Text>
                <Text style={styles.caption}>da parcela</Text>
              </View>
            </View>
          ))}
        </View>
      ))}
    </>
  );

  return (
    <View style={styles.container}>
      <PageHeader title="Fiado" subtitle="Quem deve e quando vence" showBackButton backFallback="/(tabs)/more" />
      <ScrollView contentContainerStyle={[styles.content, desktop]} refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}>
        {isDesktop ? (
          <View style={styles.columns}>
            <View style={styles.sideCol}>{hero}{todo}{filters}</View>
            <View style={styles.listCol}>{list}</View>
          </View>
        ) : (
          <>
            {hero}
            {todo}
            {filters}
            {list}
          </>
        )}
      </ScrollView>

      <BottomSheet visible={!!receiving} onDismiss={() => setReceiving(null)} title="Receber fiado"
        subtitle={receiving ? `${receiving.name} deve ${formatCurrency(receiving.owed)}` : undefined} icon="cash-outline"
        actions={[{ label: 'Confirmar recebimento', variant: 'primary', loading: doReceive.isPending,
          disabled: !(parseMoneyBr(receiving?.amount ?? '') ?? 0),
          onPress: () => { setSheetError(''); doReceive.mutate(); } }]}>
        {!!receiving && (
          <View style={{ gap: 10 }}>
            {!!sheetError && <Text style={styles.error}>{sheetError}</Text>}
            <TextInput mode="outlined" label="Quanto ela pagou" value={receiving.amount} keyboardType="decimal-pad" left={<TextInput.Affix text="R$" />}
              onChangeText={(t) => setReceiving({ ...receiving, amount: moneyInput(t) })} activeOutlineColor={brand.primary} />
            <Text style={styles.itemSub}>Pode ser só uma parte: paga primeiro as parcelas que vencem antes.</Text>
            <Text style={styles.label}>Como ela pagou</Text>
            <View style={styles.filters}>
              {RECEIVE_METHODS.map((m) => (
                <Chip key={m.value} text={m.label} on={receiving.method === m.value} color={brand.primary} onPress={() => setReceiving({ ...receiving, method: m.value })} />
              ))}
            </View>
            <DateTimeInput label="Dia do recebimento" value={receiving.day} onChange={(d) => setReceiving({ ...receiving, day: d })} mode="date" maximumDate={today} />
          </View>
        )}
      </BottomSheet>

      <BottomSheet visible={!!history} onDismiss={() => setHistory(null)} title="Recebimentos"
        subtitle={history ? `${history.customer_name ?? ''} · ${label(history)}` : undefined} icon="time-outline">
        <View style={{ gap: 8 }}>
          {(payments ?? []).map((p) => (
            <View key={p.id} style={styles.payRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{formatCurrency(p.amount)} · {p.method_label}</Text>
                <Text style={styles.itemSub}>{formatDate(p.received_on)}{p.created_by_name ? ` · ${p.created_by_name}` : ''}</Text>
              </View>
              {manager && (
                <AppButton variant="text" size="sm" label="Desfazer" textColor={Colors.light.textSecondary} onPress={() => setUndoing(p.id)} />
              )}
            </View>
          ))}
        </View>
      </BottomSheet>

      <BottomSheet visible={!!opening && !pickCustomer} onDismiss={() => setOpening(null)} title="Lançar fiado antigo"
        subtitle="O que a cliente já devia antes de a loja usar o app" icon="book-outline"
        actions={[{ label: 'Lançar', variant: 'primary', loading: doOpening.isPending,
          disabled: !opening?.customer || !(parseMoneyBr(opening?.amount ?? '') ?? 0),
          onPress: () => { setSheetError(''); doOpening.mutate(); } }]}>
        {!!opening && (() => {
          const total = parseMoneyBr(opening.amount) ?? 0;
          const values = total > 0 ? splitAmount(total, opening.count) : [];
          const dates = dueDates(opening.first, opening.count, opening.interval);
          return (
            <View style={{ gap: 10 }}>
              {!!sheetError && <Text style={styles.error}>{sheetError}</Text>}
              <TouchableOpacity onPress={() => setPickCustomer(true)} style={[styles.chip, styles.pick]} accessibilityRole="button">
                <Ionicons name="person-outline" size={16} color={brand.primary} />
                <Text style={styles.chipText}>{opening.customer ? opening.customer.full_name : 'Escolher a cliente'}</Text>
              </TouchableOpacity>
              <TextInput mode="outlined" label="Quanto ela deve" value={opening.amount} keyboardType="decimal-pad" left={<TextInput.Affix text="R$" />}
                onChangeText={(t) => setOpening({ ...opening, amount: moneyInput(t) })} activeOutlineColor={brand.primary} />
              <Text style={styles.label}>Em quantas vezes</Text>
              <View style={styles.filters}>
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <Chip key={n} text={n === 1 ? '1 vez' : `${n}x`} on={opening.count === n} color={brand.primary} onPress={() => setOpening({ ...opening, count: n })} />
                ))}
              </View>
              {opening.count > 1 && (
                <View style={styles.filters}>
                  {FIADO_INTERVALS.map((iv) => (
                    <Chip key={iv.value} text={iv.label} on={opening.interval === iv.value} color={brand.primary} onPress={() => setOpening({ ...opening, interval: iv.value })} />
                  ))}
                </View>
              )}
              <DateTimeInput label={opening.count > 1 ? 'Primeiro vencimento' : 'Vencimento'} value={opening.first}
                onChange={(d) => d && setOpening({ ...opening, first: d })} mode="date" />
              {values.length > 0 && (
                <Text style={styles.itemSub}>
                  {values.map((v, k) => `${dates[k].toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}: ${formatCurrency(v)}`).join('  ·  ')}
                </Text>
              )}
              <TextInput mode="outlined" label="Observação (opcional)" value={opening.description} placeholder="Ex.: planilha de outubro"
                onChangeText={(t) => setOpening({ ...opening, description: t })} activeOutlineColor={brand.primary} />
            </View>
          );
        })()}
      </BottomSheet>

      <CustomerSelectionModal visible={pickCustomer} onDismiss={() => setPickCustomer(false)} title="Quem deve?"
        onSelectCustomer={(c) => { setPickCustomer(false); setOpening((o) => (o ? { ...o, customer: c } : o)); }} />

      <ConfirmDialog visible={!!canceling} title="Cancelar este lançamento?" type="warning" confirmText="Cancelar lançamento" cancelText="Voltar"
        message={canceling ? `${canceling.customer_name}: ${formatCurrency(canceling.amount)} sai do fiado. Use quando foi lançado errado.` : ''}
        loading={doCancel.isPending} onConfirm={() => canceling && doCancel.mutate(canceling.id)} onCancel={() => setCanceling(null)} />

      <ConfirmDialog visible={undoing != null} title="Desfazer o recebimento?" type="warning" confirmText="Desfazer" cancelText="Voltar"
        message="O valor volta a ficar em aberto e sai da conta onde tinha entrado."
        loading={doUndo.isPending} onConfirm={() => undoing != null && doUndo.mutate(undoing)} onCancel={() => setUndoing(null)} />
    </View>
  );
}

function Chip({ text, on, color, onPress, role = 'radio' }: { text: string; on: boolean; color: string; onPress: () => void; role?: 'radio' | 'tab' }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.chip, on && { borderColor: color, backgroundColor: color + '14' }]}
      accessibilityRole={role} accessibilityState={{ selected: on }}>
      <Text style={[styles.chipText, on && { color }]}>{text}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  content: { padding: 16, paddingBottom: 48, gap: 12 },
  columns: { flexDirection: 'row', gap: 20, alignItems: 'flex-start' },
  sideCol: { width: 360, gap: 12 },
  listCol: { flex: 1, gap: 12, minWidth: 0 },
  hero: { backgroundColor: Colors.light.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.light.border, gap: 8 },
  eyebrow: { fontSize: 11, fontWeight: theme.fontWeight.extrabold, letterSpacing: 1, color: Colors.light.textSecondary },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  todo: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.light.warningLight, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: Colors.light.warning },
  todoTitle: { fontSize: 14, fontWeight: theme.fontWeight.extrabold, color: Colors.light.text },
  label: { fontSize: 13, fontWeight: theme.fontWeight.bold, color: Colors.light.textSecondary },
  big: { fontSize: 28, fontWeight: theme.fontWeight.extrabold, color: Colors.light.text },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1.5, borderColor: Colors.light.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: Colors.light.card },
  chipText: { fontSize: 13, fontWeight: theme.fontWeight.bold, color: Colors.light.text },
  pick: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  group: { backgroundColor: Colors.light.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.light.border, gap: 10 },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  payRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  itemOverdue: { borderColor: Colors.light.error + '66' },
  itemTitle: { fontSize: 15, fontWeight: theme.fontWeight.bold, color: Colors.light.text },
  rowTitle: { fontSize: 13, fontWeight: theme.fontWeight.semibold, color: Colors.light.text },
  itemSub: { fontSize: 12, color: Colors.light.textSecondary },
  amount: { fontSize: 15, fontWeight: theme.fontWeight.extrabold, color: Colors.light.text },
  caption: { fontSize: 11, color: Colors.light.textSecondary },
  itemActions: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  error: { color: Colors.light.error, fontWeight: theme.fontWeight.semibold },
});
