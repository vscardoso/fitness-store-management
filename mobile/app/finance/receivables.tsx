/**
 * Fiado (a receber): quanto as clientes devem, vencidas em destaque, por cliente. Receber (valor parcial permitido,
 * das parcelas mais antigas para as mais novas), ver e desfazer recebimentos (gerente), lançar fiado antigo e
 * cancelar lançamento errado (gerente). O dinheiro recebido cai na conta da forma (backend: /receivables).
 */
import React, { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Button, TextInput } from 'react-native-paper';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';

import PageHeader from '@/components/layout/PageHeader';
import BottomSheet from '@/components/ui/BottomSheet';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import DateTimeInput from '@/components/ui/DateTimeInput';
import CustomerSelectionModal from '@/components/sale/CustomerSelectionModal';
import { Colors } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { useDesktopContentStyle } from '@/hooks/useLayout';
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

  return (
    <View style={styles.container}>
      <PageHeader title="Fiado" subtitle="Quanto as clientes devem e quando vence" showBackButton backFallback="/(tabs)/more" />
      <ScrollView contentContainerStyle={[styles.content, desktop]} refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}>
        <View style={styles.card}>
          <View style={styles.summary}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>A receber</Text>
              <Text style={styles.big}>{formatCurrency(s?.open_total ?? 0)}</Text>
              <Text style={styles.itemSub}>{s?.customers ?? 0} cliente(s) · {s?.installments ?? 0} parcela(s)</Text>
            </View>
            {!!s?.overdue_total && (
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: Colors.light.error }]}>Vencido</Text>
                <Text style={[styles.big, { color: Colors.light.error }]}>{formatCurrency(s.overdue_total)}</Text>
              </View>
            )}
          </View>
          {!!s?.due_this_week && <Text style={styles.itemSub}>Vence nos próximos 7 dias: {formatCurrency(s.due_this_week)}</Text>}
          {manager && !customerFilter && (
            <Button mode="outlined" icon="plus" textColor={brand.primary} style={styles.left}
              onPress={() => { setSheetError(''); setOpening({ customer: null, amount: '', count: 1, interval: 30, first: defaultFirstDue(30), description: '' }); }}>
              Lançar fiado antigo
            </Button>
          )}
        </View>

        <View style={styles.filters}>
          {FILTERS.map((f) => (
            <TouchableOpacity key={f.id} onPress={() => setFilter(f.id)} style={[styles.chip, filter === f.id && { borderColor: brand.primary, backgroundColor: brand.primary + '14' }]}
              accessibilityRole="tab" accessibilityState={{ selected: filter === f.id }}>
              <Text style={[styles.chipText, filter === f.id && { color: brand.primary }]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {isLoading ? <ScreenLoader inline /> : groups.length === 0 ? (
          <Text style={styles.empty}>{filter === 'open' ? 'Ninguém deve nada agora.' : 'Nada por aqui.'}</Text>
        ) : groups.map((g) => (
          <View key={g.id} style={[styles.group, g.overdue && styles.itemOverdue]}>
            <View style={styles.groupHead}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle}>{g.name}</Text>
                {g.owed > 0 && <Text style={[styles.itemSub, g.overdue && { color: Colors.light.error, fontWeight: '700' }]}>
                  Deve {formatCurrency(g.owed)}{g.overdue ? ' · tem parcela vencida' : ''}
                </Text>}
              </View>
              {g.owed > 0 && (
                <Button mode="contained" compact buttonColor={brand.primary}
                  onPress={() => { setSheetError(''); setReceiving({ customerId: g.id, name: g.name, owed: g.owed, amount: moneyInput(g.owed.toFixed(2)), method: 'pix', day: today }); }}>
                  Receber
                </Button>
              )}
            </View>
            {g.items.map((r) => (
              <View key={r.id} style={styles.row}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.rowTitle}>{label(r)}</Text>
                  <Text style={[styles.itemSub, r.overdue && { color: Colors.light.error, fontWeight: '700' }]}>{statusText(r)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text style={styles.amount}>{formatCurrency(r.amount)}</Text>
                  <View style={styles.itemActions}>
                    {r.received_amount > 0 && (
                      <TouchableOpacity onPress={() => setHistory(r)} hitSlop={6} accessibilityLabel={`Recebimentos da parcela ${r.installment_number}`}>
                        <Text style={[styles.link, { color: brand.primary }]}>Recebimentos</Text>
                      </TouchableOpacity>
                    )}
                    {manager && r.origin === 'opening' && r.received_amount === 0 && r.status !== 'canceled' && (
                      <TouchableOpacity onPress={() => setCanceling(r)} hitSlop={6} accessibilityLabel={`Cancelar parcela ${r.installment_number}`}>
                        <Ionicons name="close-circle-outline" size={20} color={Colors.light.textTertiary} />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </View>
            ))}
          </View>
        ))}
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
                <TouchableOpacity key={m.value} onPress={() => setReceiving({ ...receiving, method: m.value })}
                  style={[styles.chip, receiving.method === m.value && { borderColor: brand.primary, backgroundColor: brand.primary + '14' }]}
                  accessibilityRole="radio" accessibilityState={{ selected: receiving.method === m.value }}>
                  <Text style={[styles.chipText, receiving.method === m.value && { color: brand.primary }]}>{m.label}</Text>
                </TouchableOpacity>
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
            <View key={p.id} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{formatCurrency(p.amount)} · {p.method_label}</Text>
                <Text style={styles.itemSub}>{formatDate(p.received_on)}{p.created_by_name ? ` · ${p.created_by_name}` : ''}</Text>
              </View>
              {manager && (
                <Button mode="text" compact textColor={Colors.light.textSecondary} onPress={() => setUndoing(p.id)}>Desfazer</Button>
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
                  <TouchableOpacity key={n} onPress={() => setOpening({ ...opening, count: n })}
                    style={[styles.chip, opening.count === n && { borderColor: brand.primary, backgroundColor: brand.primary + '14' }]}>
                    <Text style={[styles.chipText, opening.count === n && { color: brand.primary }]}>{n === 1 ? '1 vez' : `${n}x`}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {opening.count > 1 && (
                <View style={styles.filters}>
                  {FIADO_INTERVALS.map((iv) => (
                    <TouchableOpacity key={iv.value} onPress={() => setOpening({ ...opening, interval: iv.value })}
                      style={[styles.chip, opening.interval === iv.value && { borderColor: brand.primary, backgroundColor: brand.primary + '14' }]}>
                      <Text style={[styles.chipText, opening.interval === iv.value && { color: brand.primary }]}>{iv.label}</Text>
                    </TouchableOpacity>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  content: { padding: 16, paddingBottom: 48, gap: 12 },
  card: { backgroundColor: Colors.light.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.light.border, gap: 10 },
  summary: { flexDirection: 'row', gap: 12 },
  label: { fontSize: 13, fontWeight: '700', color: Colors.light.textSecondary },
  big: { fontSize: 22, fontWeight: '800', color: Colors.light.text },
  left: { alignSelf: 'flex-start' },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1.5, borderColor: Colors.light.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: Colors.light.card },
  chipText: { fontSize: 13, fontWeight: '700', color: Colors.light.text },
  pick: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  empty: { textAlign: 'center', color: Colors.light.textSecondary, marginTop: 24 },
  group: { backgroundColor: Colors.light.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.light.border, gap: 10 },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  itemOverdue: { borderColor: Colors.light.error + '66' },
  itemTitle: { fontSize: 15, fontWeight: '700', color: Colors.light.text },
  rowTitle: { fontSize: 13, fontWeight: '600', color: Colors.light.text },
  itemSub: { fontSize: 12, color: Colors.light.textSecondary },
  amount: { fontSize: 15, fontWeight: '800', color: Colors.light.text },
  itemActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  link: { fontSize: 12, fontWeight: '700' },
  error: { color: Colors.light.error, fontWeight: '600' },
});
