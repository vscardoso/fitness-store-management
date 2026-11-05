/**
 * Contas a pagar: em aberto (vencidas primeiro em destaque), pagas e canceladas. Nova conta, pagar (escolhe a conta de
 * onde sai o dinheiro e o dia) e cancelar. Pagar desconta do saldo da conta escolhida (backend: /finance/payables).
 */
import React, { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Button, TextInput } from 'react-native-paper';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';

import PageHeader from '@/components/layout/PageHeader';
import BottomSheet from '@/components/ui/BottomSheet';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import DateTimeInput from '@/components/ui/DateTimeInput';
import { ActivityIndicator } from '@/components/ui/MagnifierLoader';
import { Colors } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { useDesktopContentStyle } from '@/hooks/useLayout';
import { formatCurrency, formatDate } from '@/utils/format';
import { parseApiError, showApiError } from '@/utils/apiError';
import { moneyInput, parseMoneyBr } from '@/utils/cashMoney';
import {
  cancelPayable, createPayable, getFinanceOverview, isoDay, listPayables, payPayable, unpayPayable, type Payable,
} from '@/services/financeService';
import { getExpenseCategories } from '@/services/expenseService';

type Filter = 'open' | 'paid' | 'canceled';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'open', label: 'Em aberto' }, { id: 'paid', label: 'Pagas' }, { id: 'canceled', label: 'Canceladas' },
];

export default function PayablesScreen() {
  const queryClient = useQueryClient();
  const brand = useBrandingColors();
  const desktop = useDesktopContentStyle();
  const [filter, setFilter] = useState<Filter>('open');
  const { data, isLoading, refetch, isRefetching } = useQuery({ queryKey: ['finance-payables', filter], queryFn: () => listPayables(filter) });
  const { data: overview } = useQuery({ queryKey: ['finance'], queryFn: getFinanceOverview });
  const accounts = overview?.accounts ?? [];

  const [form, setForm] = useState<{
    description: string; amount: string; due: Date | undefined; isExpense: boolean; categoryId: number | null;
  } | null>(null);
  const { data: categories } = useQuery({ queryKey: ['expense-categories'], queryFn: getExpenseCategories, enabled: !!form });
  const [paying, setPaying] = useState<{ p: Payable; account: number | null; day: Date | undefined } | null>(null);
  const [canceling, setCanceling] = useState<Payable | null>(null);
  const [unpaying, setUnpaying] = useState<Payable | null>(null);
  const [sheetError, setSheetError] = useState('');

  const refresh = () => queryClient.invalidateQueries();
  const doCreate = useMutation({
    mutationFn: () => createPayable({
      description: form!.description.trim(), amount: parseMoneyBr(form!.amount) ?? 0, due_date: isoDay(form!.due!),
      counts_as_expense: form!.isExpense, expense_category_id: form!.isExpense ? form!.categoryId : null,
    }),
    onSuccess: async () => { setForm(null); await refresh(); },
    onError: (e) => setSheetError(parseApiError(e) || 'Não foi possível salvar.'),
  });
  const doPay = useMutation({
    mutationFn: () => payPayable(paying!.p.id, paying!.account!, paying!.day ? isoDay(paying!.day) : undefined),
    onSuccess: async () => { setPaying(null); await refresh(); },
    onError: (e) => setSheetError(parseApiError(e) || 'Não foi possível pagar.'),
  });
  const doCancel = useMutation({
    mutationFn: (id: number) => cancelPayable(id),
    onSuccess: async () => { setCanceling(null); await refresh(); },
    onError: (e) => { setCanceling(null); showApiError(e, 'Não foi possível cancelar'); },
  });

  const doUnpay = useMutation({
    mutationFn: (id: number) => unpayPayable(id),
    onSuccess: async () => { setUnpaying(null); await refresh(); },
    onError: (e) => { setUnpaying(null); showApiError(e, 'Não foi possível desfazer'); },
  });

  const items = data?.items ?? [];
  const today = new Date();

  return (
    <View style={styles.container}>
      <PageHeader title="Despesas a pagar" subtitle="Ao pagar, a despesa entra no resultado do mês" showBackButton backFallback="/(tabs)/expenses" />
      <ScrollView contentContainerStyle={[styles.content, desktop]} refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}>
        <View style={styles.card}>
          <View style={styles.summary}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Em aberto</Text>
              <Text style={styles.big}>{formatCurrency(data?.open_total ?? 0)}</Text>
            </View>
            {!!data?.overdue_count && (
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: Colors.light.error }]}>Vencidas ({data.overdue_count})</Text>
                <Text style={[styles.big, { color: Colors.light.error }]}>{formatCurrency(data.overdue_total)}</Text>
              </View>
            )}
          </View>
          <Button mode="contained" icon="plus" buttonColor={brand.primary} style={styles.left}
            onPress={() => { setSheetError(''); setForm({ description: '', amount: '', due: undefined, isExpense: true, categoryId: null }); }}>
            Nova despesa a pagar
          </Button>
        </View>

        <View style={styles.filters}>
          {FILTERS.map((f) => (
            <TouchableOpacity key={f.id} onPress={() => setFilter(f.id)} style={[styles.chip, filter === f.id && { borderColor: brand.primary, backgroundColor: brand.primary + '14' }]}
              accessibilityRole="tab" accessibilityState={{ selected: filter === f.id }}>
              <Text style={[styles.chipText, filter === f.id && { color: brand.primary }]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {isLoading ? <ActivityIndicator size="large" color={brand.primary} /> : items.length === 0 ? (
          <Text style={styles.empty}>{filter === 'open' ? 'Nenhuma conta em aberto.' : 'Nada por aqui.'}</Text>
        ) : items.map((p) => (
          <View key={p.id} style={[styles.item, p.overdue && styles.itemOverdue]}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.itemTitle}>{p.description}</Text>
              <Text style={[styles.itemSub, p.overdue && { color: Colors.light.error, fontWeight: '700' }]}>
                {p.status === 'paid'
                  ? `Paga em ${formatDate(p.paid_on!)} · ${accounts.find((a) => a.id === p.paid_account_id)?.name ?? ''}`
                  : p.status === 'canceled' ? 'Cancelada'
                  : `${p.overdue ? 'Venceu' : 'Vence'} em ${formatDate(p.due_date)}`}
                {p.origin === 'implantacao' ? ' · da implantação' : ''}
              </Text>
              <Text style={styles.itemSub}>
                {p.counts_as_expense ? 'Despesa da loja: entra no resultado ao pagar' : 'Mercadoria ou dívida anterior: só tira da conta'}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 6 }}>
              <Text style={styles.amount}>{formatCurrency(p.amount)}</Text>
              {p.status === 'open' && (
                <View style={styles.itemActions}>
                  <TouchableOpacity onPress={() => setCanceling(p)} accessibilityLabel={`Cancelar ${p.description}`} hitSlop={6}>
                    <Ionicons name="close-circle-outline" size={20} color={Colors.light.textTertiary} />
                  </TouchableOpacity>
                  <Button mode="contained" compact buttonColor={brand.primary}
                    onPress={() => { setSheetError(''); setPaying({ p, account: accounts.find((a) => a.receives_pix)?.id ?? accounts[0]?.id ?? null, day: today }); }}>
                    Pagar
                  </Button>
                </View>
              )}
              {p.status === 'paid' && (
                <Button mode="text" compact textColor={Colors.light.textSecondary} onPress={() => setUnpaying(p)}
                  accessibilityLabel={`Desfazer pagamento de ${p.description}`}>
                  Desfazer pagamento
                </Button>
              )}
            </View>
          </View>
        ))}
      </ScrollView>

      <BottomSheet visible={!!form} onDismiss={() => setForm(null)} title="Nova despesa a pagar" icon="receipt-outline"
        actions={[{ label: 'Salvar', variant: 'primary', loading: doCreate.isPending,
          disabled: !form?.description.trim() || !(parseMoneyBr(form?.amount ?? '') ?? 0) || !form?.due,
          onPress: () => { setSheetError(''); doCreate.mutate(); } }]}>
        {!!form && (
          <View style={{ gap: 10 }}>
            {!!sheetError && <Text style={styles.error}>{sheetError}</Text>}
            <TextInput mode="outlined" label="O que é" value={form.description} onChangeText={(t) => setForm({ ...form, description: t })}
              placeholder="Boleto do fornecedor, aluguel, energia..." activeOutlineColor={brand.primary} />
            <TextInput mode="outlined" label="Valor" value={form.amount} keyboardType="decimal-pad" left={<TextInput.Affix text="R$" />}
              onChangeText={(t) => setForm({ ...form, amount: moneyInput(t) })} activeOutlineColor={brand.primary} />
            <DateTimeInput label="Vencimento" value={form.due} onChange={(d) => setForm({ ...form, due: d })} mode="date" />
            <Text style={styles.label}>Tipo</Text>
            <View style={styles.filters}>
              {([[true, 'Despesa da loja'], [false, 'Compra de mercadoria']] as const).map(([v, label]) => (
                <TouchableOpacity key={label} onPress={() => setForm({ ...form, isExpense: v })}
                  style={[styles.chip, form.isExpense === v && { borderColor: brand.primary, backgroundColor: brand.primary + '14' }]}
                  accessibilityRole="radio" accessibilityState={{ selected: form.isExpense === v }}>
                  <Text style={[styles.chipText, form.isExpense === v && { color: brand.primary }]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.itemSub}>
              {form.isExpense
                ? 'Aluguel, luz, salário: ao pagar, entra no resultado do mês.'
                : 'Boleto de peças compradas: o custo já entra pela entrada de estoque, então ao pagar só tira o dinheiro da conta.'}
            </Text>
            {form.isExpense && !!categories?.length && (
              <View style={styles.filters}>
                {categories.map((c) => (
                  <TouchableOpacity key={c.id} onPress={() => setForm({ ...form, categoryId: form.categoryId === c.id ? null : c.id })}
                    style={[styles.chip, form.categoryId === c.id && { borderColor: brand.primary, backgroundColor: brand.primary + '14' }]}>
                    <Text style={[styles.chipText, form.categoryId === c.id && { color: brand.primary }]}>{c.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}
      </BottomSheet>

      <BottomSheet visible={!!paying} onDismiss={() => setPaying(null)} title="Pagar conta"
        subtitle={paying ? `${paying.p.description}: ${formatCurrency(paying.p.amount)}` : undefined} icon="checkmark-circle-outline"
        actions={[{ label: 'Confirmar pagamento', variant: 'primary', loading: doPay.isPending, disabled: !paying?.account,
          onPress: () => { setSheetError(''); doPay.mutate(); } }]}>
        {!!paying && (
          <View style={{ gap: 10 }}>
            {!!sheetError && <Text style={styles.error}>{sheetError}</Text>}
            <Text style={styles.label}>Saiu de qual conta?</Text>
            <View style={styles.filters}>
              {accounts.filter((a) => a.kind !== 'card').map((a) => (
                <TouchableOpacity key={a.id} onPress={() => setPaying({ ...paying, account: a.id })}
                  style={[styles.chip, paying.account === a.id && { borderColor: brand.primary, backgroundColor: brand.primary + '14' }]}
                  accessibilityRole="radio" accessibilityState={{ selected: paying.account === a.id }}>
                  <Text style={[styles.chipText, paying.account === a.id && { color: brand.primary }]}>{a.name} · {formatCurrency(a.balance)}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <DateTimeInput label="Dia do pagamento" value={paying.day} onChange={(d) => setPaying({ ...paying, day: d })} mode="date" maximumDate={today} />
          </View>
        )}
      </BottomSheet>

      <ConfirmDialog visible={!!canceling} title="Cancelar esta conta?" type="warning" confirmText="Cancelar conta" cancelText="Voltar"
        message={canceling ? `${canceling.description}: ${formatCurrency(canceling.amount)}. Ela sai das contas em aberto e não mexe em nenhum saldo.` : ''}
        loading={doCancel.isPending} onConfirm={() => canceling && doCancel.mutate(canceling.id)} onCancel={() => setCanceling(null)} />

      <ConfirmDialog visible={!!unpaying} title="Desfazer o pagamento?" type="warning" confirmText="Desfazer" cancelText="Voltar"
        message={unpaying ? `${unpaying.description}: ${formatCurrency(unpaying.amount)} volta para ${accounts.find((a) => a.id === unpaying.paid_account_id)?.name ?? 'a conta'} e a conta fica em aberto de novo.` : ''}
        loading={doUnpay.isPending} onConfirm={() => unpaying && doUnpay.mutate(unpaying.id)} onCancel={() => setUnpaying(null)} />
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
  empty: { textAlign: 'center', color: Colors.light.textSecondary, marginTop: 24 },
  item: { flexDirection: 'row', gap: 12, backgroundColor: Colors.light.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.light.border },
  itemOverdue: { borderColor: Colors.light.error + '66' },
  itemTitle: { fontSize: 15, fontWeight: '700', color: Colors.light.text },
  itemSub: { fontSize: 12, color: Colors.light.textSecondary },
  amount: { fontSize: 16, fontWeight: '800', color: Colors.light.text },
  itemActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  error: { color: Colors.light.error, fontWeight: '600' },
});
