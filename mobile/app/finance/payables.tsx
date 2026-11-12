/**
 * Despesas a pagar: em aberto (vencidas primeiro em destaque), pagas e canceladas. Nova conta, pagar (escolhe a conta de
 * onde sai o dinheiro e o dia), corrigir e cancelar. Pagar desconta do saldo da conta escolhida (backend: /finance/payables).
 *
 * Organização: resumo (a pagar, vencidas) com a ação principal "Nova despesa a pagar", faixa "Pagar agora" só quando há
 * vencida, filtros em chips e linhas com uma ação (Pagar). Corrigir, cancelar e desfazer ficam em "Mais opções".
 * No notebook: resumo e filtros à esquerda, lista à direita.
 */
import React, { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { TextInput } from 'react-native-paper';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import PageHeader from '@/components/layout/PageHeader';
import AppButton from '@/components/ui/AppButton';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';
import BottomSheet from '@/components/ui/BottomSheet';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import DateTimeInput from '@/components/ui/DateTimeInput';
import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { useDesktopContentStyle, useIsDesktop } from '@/hooks/useLayout';
import { formatCurrency, formatDate } from '@/utils/format';
import { parseApiError, showApiError } from '@/utils/apiError';
import { moneyInput, parseMoneyBr } from '@/utils/cashMoney';
import { isoToDate } from '@/utils/dateBr';
import {
  cancelPayable, createPayable, getFinanceOverview, isoDay, listPayables, payPayable, unpayPayable, updatePayable, type Payable,
} from '@/services/financeService';
import { getExpenseCategories } from '@/services/expenseService';
import ScreenLoader from '@/components/ui/ScreenLoader';

type Filter = 'open' | 'paid' | 'canceled';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'open', label: 'Em aberto' }, { id: 'paid', label: 'Pagas' }, { id: 'canceled', label: 'Canceladas' },
];

export default function PayablesScreen() {
  const queryClient = useQueryClient();
  const brand = useBrandingColors();
  const desktop = useDesktopContentStyle();
  const isDesktop = useIsDesktop();
  const [filter, setFilter] = useState<Filter>('open');
  // só as vencidas, dentro de "Em aberto" (filtro da tela: não muda o que o servidor devolve)
  const [onlyOverdue, setOnlyOverdue] = useState(false);
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
  const [detail, setDetail] = useState<Payable | null>(null);
  // Corrigir uma despesa já lançada (o que é, valor, vencimento, observação); paga também acerta a conta de onde saiu
  const [editing, setEditing] = useState<{ p: Payable; description: string; amount: string; due: Date | undefined; notes: string } | null>(null);
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

  const doEdit = useMutation({
    mutationFn: () => updatePayable(editing!.p.id, {
      description: editing!.description.trim(), amount: (parseMoneyBr(editing!.amount) ?? 0).toFixed(2),
      due_date: isoDay(editing!.due!), notes: editing!.notes.trim(),
    }),
    onSuccess: async () => { setEditing(null); await refresh(); },
    onError: (e) => setSheetError(parseApiError(e) || 'Não foi possível corrigir.'),
  });
  const openEdit = (p: Payable) => {
    setSheetError('');
    setEditing({ p, description: p.description, amount: moneyInput(Math.round(p.amount * 100).toString()), due: isoToDate(p.due_date), notes: p.notes ?? '' });
  };
  const openPay = (p: Payable) => {
    setSheetError('');
    setPaying({ p, account: accounts.find((a) => a.receives_pix)?.id ?? accounts[0]?.id ?? null, day: today });
  };

  const doUnpay = useMutation({
    mutationFn: (id: number) => unpayPayable(id),
    onSuccess: async () => { setUnpaying(null); await refresh(); },
    onError: (e) => { setUnpaying(null); showApiError(e, 'Não foi possível desfazer'); },
  });

  const today = new Date();
  const all = data?.items ?? [];
  const items = filter === 'open' && onlyOverdue ? all.filter((p) => p.overdue) : all;
  const overdueCount = data?.overdue_count ?? 0;
  const startForm = () => { setSheetError(''); setForm({ description: '', amount: '', due: undefined, isExpense: true, categoryId: null }); };
  const pickFilter = (f: Filter) => { setFilter(f); setOnlyOverdue(false); };
  const accountName = (id: number | null | undefined) => accounts.find((a) => a.id === id)?.name ?? '';

  // Resumo: quanto falta pagar, quantas já venceram e a ação principal da tela
  const hero = (
    <View style={styles.hero} testID="contas-pagar-resumo">
      <Text style={styles.eyebrow}>A PAGAR</Text>
      <Text style={styles.big}>{formatCurrency(data?.open_total ?? 0)}</Text>
      {overdueCount > 0 && (
        <View style={styles.pills}>
          <Badge label={`${overdueCount} vencida(s) · ${formatCurrency(data?.overdue_total ?? 0)}`} variant="error" size="md" />
        </View>
      )}
      <AppButton variant="primary" size="md" fullWidth icon="add" label="Nova despesa a pagar" onPress={startForm} />
    </View>
  );

  // "Pagar agora" só existe quando há conta vencida e a lista ainda mostra tudo
  const todo = filter === 'open' && overdueCount > 0 && !onlyOverdue ? (
    <View style={styles.todo} testID="contas-pagar-vencidas">
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.todoTitle}>Pagar agora</Text>
        <Text style={styles.itemSub}>{`${overdueCount} conta(s) vencida(s), ${formatCurrency(data?.overdue_total ?? 0)}`}</Text>
      </View>
      <AppButton variant="outlined" size="sm" label="Ver vencidas" onPress={() => setOnlyOverdue(true)} />
    </View>
  ) : null;

  const filters = (
    <View style={styles.filters}>
      {FILTERS.map((f) => (
        <Chip key={f.id} text={f.label} on={filter === f.id && !onlyOverdue} color={brand.primary} role="tab" onPress={() => pickFilter(f.id)} />
      ))}
      {filter === 'open' && overdueCount > 0 && (
        <Chip text={`Vencidas (${overdueCount})`} on={onlyOverdue} color={Colors.light.error} role="tab" onPress={() => setOnlyOverdue(!onlyOverdue)} />
      )}
    </View>
  );

  const list = isLoading ? <ScreenLoader inline /> : items.length === 0 ? (
    <EmptyState
      icon="receipt-outline"
      title={filter === 'open' ? 'Nenhuma conta em aberto' : 'Nada por aqui'}
      description={filter === 'open' ? 'Boletos, aluguel e outras contas que vencem depois aparecem aqui até serem pagas.' : 'Troque o filtro para ver outras contas.'}
      actionLabel={filter === 'open' ? 'Nova despesa a pagar' : undefined}
      onAction={startForm}
    />
  ) : (
    <>
      {items.map((p) => (
        <View key={p.id} style={[styles.item, p.overdue && p.status === 'open' && styles.itemOverdue]}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.itemTitle}>{p.description}</Text>
            <View style={styles.pills}>
              {p.status === 'paid' && <Badge label="Paga" variant="success" size="sm" />}
              {p.status === 'canceled' && <Badge label="Cancelada" variant="neutral" size="sm" />}
              {p.status === 'open' && p.overdue && <Badge label="Vencida" variant="error" size="sm" />}
              {!p.counts_as_expense && <Badge label="Mercadoria ou dívida anterior" variant="neutral" size="sm" />}
              {p.origin === 'implantacao' && <Badge label="Da implantação" variant="neutral" size="sm" />}
            </View>
            <Text style={[styles.itemSub, p.status === 'open' && p.overdue && { color: Colors.light.error, fontWeight: theme.fontWeight.bold }]}>
              {p.status === 'paid'
                ? `Paga em ${formatDate(p.paid_on!)}${accountName(p.paid_account_id) ? ` · ${accountName(p.paid_account_id)}` : ''}`
                : p.status === 'canceled' ? 'Não será paga'
                : `${p.overdue ? 'Venceu' : 'Vence'} em ${formatDate(p.due_date)}`}
            </Text>
            <View style={styles.itemActions}>
              <AppButton variant="text" size="sm" label="Mais opções" onPress={() => setDetail(p)} />
            </View>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 6 }}>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.amount}>{formatCurrency(p.amount)}</Text>
              <Text style={styles.caption}>{p.status === 'paid' ? 'pago' : p.status === 'canceled' ? 'cancelado' : 'a pagar'}</Text>
            </View>
            {p.status === 'open' && <AppButton variant="primary" size="sm" label="Pagar" onPress={() => openPay(p)} />}
          </View>
        </View>
      ))}
    </>
  );

  return (
    <View style={styles.container}>
      <PageHeader title="Despesas a pagar" subtitle="O que ainda vai sair das contas" showBackButton backFallback="/(tabs)/expenses" />
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

      <BottomSheet
        visible={!!detail}
        onDismiss={() => setDetail(null)}
        title={detail?.description ?? ''}
        subtitle={detail ? `${formatCurrency(detail.amount)} · ${detail.status === 'paid' ? 'paga' : detail.status === 'canceled' ? 'cancelada' : 'a pagar'}` : undefined}
        icon="receipt-outline"
        actions={detail?.status === 'open' ? [
          { label: 'Pagar', variant: 'primary', onPress: () => { const p = detail; setDetail(null); openPay(p); } },
          { label: 'Corrigir', variant: 'secondary', onPress: () => { const p = detail; setDetail(null); openEdit(p); } },
          { label: 'Cancelar conta', variant: 'danger', onPress: () => { const p = detail; setDetail(null); setCanceling(p); } },
        ] : detail?.status === 'paid' ? [
          { label: 'Corrigir', variant: 'secondary', onPress: () => { const p = detail; setDetail(null); openEdit(p); } },
          { label: 'Desfazer pagamento', variant: 'danger', onPress: () => { const p = detail; setDetail(null); setUnpaying(p); } },
        ] : undefined}
      >
        {!!detail && (
          <View style={{ gap: 6 }}>
            <Text style={styles.itemSub}>
              {detail.counts_as_expense
                ? 'Despesa da loja: ao pagar, entra no resultado do mês.'
                : 'Mercadoria ou dívida anterior: ao pagar, só tira o dinheiro da conta.'}
            </Text>
            <Text style={styles.itemSub}>{`Vencimento: ${formatDate(detail.due_date)}`}</Text>
            {!!detail.notes && <Text style={styles.itemSub}>{detail.notes}</Text>}
          </View>
        )}
      </BottomSheet>

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
                <Chip key={label} text={label} on={form.isExpense === v} color={brand.primary} onPress={() => setForm({ ...form, isExpense: v })} />
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
                  <Chip key={c.id} text={c.name} on={form.categoryId === c.id} color={brand.primary}
                    onPress={() => setForm({ ...form, categoryId: form.categoryId === c.id ? null : c.id })} />
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
                <Chip key={a.id} text={`${a.name} · ${formatCurrency(a.balance)}`} on={paying.account === a.id} color={brand.primary}
                  onPress={() => setPaying({ ...paying, account: a.id })} />
              ))}
            </View>
            <DateTimeInput label="Dia do pagamento" value={paying.day} onChange={(d) => setPaying({ ...paying, day: d })} mode="date" maximumDate={today} />
          </View>
        )}
      </BottomSheet>

      <BottomSheet visible={!!editing} onDismiss={() => setEditing(null)} title="Corrigir despesa" icon="pencil"
        subtitle={editing ? (editing.p.status === 'paid' ? 'Já paga: o saldo da conta acompanha' : 'Ainda em aberto') : undefined}
        actions={[{ label: 'Salvar correção', variant: 'primary', loading: doEdit.isPending,
          disabled: !editing?.description.trim() || !(parseMoneyBr(editing?.amount ?? '') ?? 0) || !editing?.due,
          onPress: () => { setSheetError(''); doEdit.mutate(); } }]}>
        {!!editing && (
          <View style={{ gap: 10 }}>
            {!!sheetError && <Text style={styles.error}>{sheetError}</Text>}
            <TextInput mode="outlined" label="O que é" value={editing.description} onChangeText={(t) => setEditing({ ...editing, description: t })}
              activeOutlineColor={brand.primary} />
            <TextInput mode="outlined" label="Valor" value={editing.amount} keyboardType="decimal-pad" left={<TextInput.Affix text="R$" />}
              onChangeText={(t) => setEditing({ ...editing, amount: moneyInput(t) })} activeOutlineColor={brand.primary} />
            <DateTimeInput label="Vencimento" value={editing.due} onChange={(d) => setEditing({ ...editing, due: d })} mode="date" />
            <TextInput mode="outlined" label="Observação (opcional)" value={editing.notes} onChangeText={(t) => setEditing({ ...editing, notes: t })}
              activeOutlineColor={brand.primary} />
            {editing.p.status === 'paid' && (
              <Text style={styles.itemSub}>
                Pago em {formatDate(editing.p.paid_on!)}. Se mudar o valor, o dinheiro da conta e a despesa do mês acompanham. Para trocar a conta ou o dia do pagamento, desfaça o pagamento e pague de novo.
              </Text>
            )}
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
  hero: { backgroundColor: Colors.light.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.light.border, gap: 10 },
  eyebrow: { fontSize: 11, fontWeight: theme.fontWeight.extrabold, letterSpacing: 1, color: Colors.light.textSecondary },
  big: { fontSize: 28, fontWeight: theme.fontWeight.extrabold, color: Colors.light.text },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  todo: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.light.warningLight, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: Colors.light.warning },
  todoTitle: { fontSize: 14, fontWeight: theme.fontWeight.extrabold, color: Colors.light.text },
  label: { fontSize: 13, fontWeight: theme.fontWeight.bold, color: Colors.light.textSecondary },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1.5, borderColor: Colors.light.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: Colors.light.card },
  chipText: { fontSize: 13, fontWeight: theme.fontWeight.bold, color: Colors.light.text },
  item: { flexDirection: 'row', gap: 12, backgroundColor: Colors.light.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.light.border },
  itemOverdue: { borderColor: Colors.light.error + '66' },
  itemTitle: { fontSize: 15, fontWeight: theme.fontWeight.bold, color: Colors.light.text },
  itemSub: { fontSize: 12, color: Colors.light.textSecondary },
  amount: { fontSize: 16, fontWeight: theme.fontWeight.extrabold, color: Colors.light.text },
  caption: { fontSize: 11, color: Colors.light.textSecondary },
  itemActions: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  error: { color: Colors.light.error, fontWeight: theme.fontWeight.semibold },
});
