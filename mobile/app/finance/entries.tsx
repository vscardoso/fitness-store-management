/**
 * Retiradas e empréstimos: dinheiro que sai ou entra de uma conta sem ser venda nem despesa da loja (retirada de
 * sócio, dinheiro posto pelo sócio, empréstimo dado ou pego, fatura do cartão da loja). Mexe no saldo da conta e
 * aparece no Fechamento do mês, mas não entra no Resultado do mês. Regras em backend/app/services/finance_service.py.
 *
 * Organização: cabeçalho com as duas ações (Saiu dinheiro, Entrou dinheiro) e o que está emprestado, lista de quem deve,
 * e os lançamentos agrupados por mês (com o que saiu e entrou no mês). Corrigir e apagar ficam no detalhe do lançamento.
 * No notebook: ações e empréstimos à esquerda, lançamentos à direita.
 */
import React, { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { TextInput } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';

import PageHeader from '@/components/layout/PageHeader';
import AppButton from '@/components/ui/AppButton';
import Badge from '@/components/ui/Badge';
import BottomSheet from '@/components/ui/BottomSheet';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import DateTimeInput from '@/components/ui/DateTimeInput';
import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { useDesktopContentStyle, useIsDesktop } from '@/hooks/useLayout';
import { useAuth } from '@/hooks/useAuth';
import { isAdminRole } from '@/utils/roles';
import { formatCurrency, formatDate } from '@/utils/format';
import { parseApiError, showApiError } from '@/utils/apiError';
import { moneyInput, parseMoneyBr } from '@/utils/cashMoney';
import { dateToIso, isoToDate } from '@/utils/dateBr';
import ScreenLoader from '@/components/ui/ScreenLoader';
import {
  createEntry, deleteEntry, getFinanceOverview, getLoans, listEntries, updateEntry, type AccountEntry, type EntryKind,
} from '@/services/financeService';

type Option = { kind: EntryKind; label: string; hint: string; person?: 'required'; needsText?: boolean };

const OUT: Option[] = [
  { kind: 'owner_withdrawal', label: 'Retirada de sócio', hint: 'Dinheiro que o sócio tirou para ele (pró-labore, lucro).', person: 'required' },
  { kind: 'card_bill', label: 'Fatura do cartão', hint: 'Só se as compras do cartão já foram lançadas como despesa. Se não foram, lance como despesa.' },
  { kind: 'loan_given', label: 'Emprestei', hint: 'A loja emprestou dinheiro para alguém. Fica em “A receber” até voltar.', person: 'required' },
  { kind: 'loan_paid', label: 'Paguei empréstimo', hint: 'Parcela de um empréstimo que a loja pegou.', person: 'required' },
  { kind: 'other_out', label: 'Outra saída', hint: 'Qualquer dinheiro que saiu e não é gasto da loja.', needsText: true },
];
const IN: Option[] = [
  { kind: 'owner_contribution', label: 'Sócio colocou', hint: 'Dinheiro do sócio que entrou na loja.', person: 'required' },
  { kind: 'loan_repaid', label: 'Recebi empréstimo de volta', hint: 'Quem pegou emprestado pagou (tudo ou uma parte).', person: 'required' },
  { kind: 'loan_taken', label: 'Peguei empréstimo', hint: 'A loja pegou dinheiro emprestado (banco, pessoa).', person: 'required' },
  { kind: 'other_in', label: 'Outra entrada', hint: 'Dinheiro que entrou e não é venda.', needsText: true },
];
const ALL = [...OUT, ...IN];

type Form = { direction: 'out' | 'in'; kind: EntryKind | null; account: number | null; amount: string; person: string; text: string; day: Date };

/** "novembro de 2026" a partir de "2026-11". */
function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  const t = new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export default function EntriesScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const brand = useBrandingColors();
  const desktop = useDesktopContentStyle();
  const isDesktop = useIsDesktop();
  const { user } = useAuth();
  const admin = isAdminRole(user?.role);
  const { data: overview } = useQuery({ queryKey: ['finance'], queryFn: getFinanceOverview });
  const { data: entries, isLoading, refetch, isRefetching, error } = useQuery({ queryKey: ['finance-entries'], queryFn: listEntries });
  const { data: loans } = useQuery({ queryKey: ['finance-loans'], queryFn: getLoans });
  const [form, setForm] = useState<Form | null>(null);
  const [formError, setFormError] = useState('');
  const [removing, setRemoving] = useState<AccountEntry | null>(null);
  const [detail, setDetail] = useState<AccountEntry | null>(null);
  // Corrigir um lançamento (valor, dia, conta, observação; sócio também troca o nome). Empréstimo não troca a pessoa.
  const [editing, setEditing] = useState<{ e: AccountEntry; account: number; amount: string; person: string; text: string; day: Date } | null>(null);
  const [editError, setEditError] = useState('');

  // maquininha a receber não é de onde sai nem para onde vai dinheiro de sócio ou empréstimo
  const accounts = (overview?.accounts ?? []).filter((a) => a.kind !== 'card');
  const option = useMemo(() => ALL.find((o) => o.kind === form?.kind), [form?.kind]);
  const amount = parseMoneyBr(form?.amount ?? '') ?? 0;
  const canSave = !!form?.kind && !!form.account && amount > 0
    && (option?.person !== 'required' || !!form.person.trim()) && (!option?.needsText || !!form.text.trim());

  const save = useMutation({
    mutationFn: () => createEntry({
      kind: form!.kind!, account_id: form!.account!, amount, occurred_on: dateToIso(form!.day),
      person: form!.person.trim() || undefined, description: form!.text.trim() || undefined,
    }),
    onSuccess: async () => { setForm(null); await queryClient.invalidateQueries(); },
    onError: (e) => setFormError(parseApiError(e) || 'Não foi possível lançar.'),
  });
  const editOption = useMemo(() => ALL.find((o) => o.kind === editing?.e.kind), [editing?.e.kind]);
  const editAmount = parseMoneyBr(editing?.amount ?? '') ?? 0;
  const editOwner = !!editing?.e.kind.startsWith('owner');
  const editChanged = !!editing && (
    Math.round(editAmount * 100) !== Math.round(editing.e.amount * 100)
    || dateToIso(editing.day) !== editing.e.occurred_on.slice(0, 10)
    || editing.account !== editing.e.account_id
    || editing.text.trim() !== (editing.e.description ?? '').trim()
    || (editOwner && editing.person.trim() !== (editing.e.person ?? '').trim()));
  const canSaveEdit = !!editing && editAmount > 0 && editChanged
    && (!editOwner || !!editing.person.trim()) && (!editOption?.needsText || !!editing.text.trim());
  const saveEdit = useMutation({
    mutationFn: () => updateEntry(editing!.e.id, {
      amount: editAmount.toFixed(2), occurred_on: dateToIso(editing!.day), account_id: editing!.account,
      description: editing!.text.trim(), ...(editOwner ? { person: editing!.person.trim() } : {}),
    }),
    onSuccess: async () => { setEditing(null); await queryClient.invalidateQueries(); },
    onError: (e) => setEditError(parseApiError(e) || 'Não foi possível corrigir.'),
  });
  const openEdit = (e: AccountEntry) => {
    setEditError('');
    setEditing({ e, account: e.account_id, amount: moneyInput(Math.round(e.amount * 100).toString()), person: e.person ?? '',
      text: e.description ?? '', day: isoToDate(e.occurred_on) });
  };
  const remove = useMutation({
    mutationFn: (id: number) => deleteEntry(id),
    onSuccess: async () => { setRemoving(null); await queryClient.invalidateQueries(); },
    onError: (e) => { setRemoving(null); showApiError(e, 'Não foi possível apagar'); },
  });

  const open = (direction: 'out' | 'in') => {
    setFormError('');
    const pix = accounts.find((a) => a.receives_pix) ?? accounts.find((a) => a.kind === 'bank');
    setForm({ direction, kind: null, account: pix?.id ?? accounts[0]?.id ?? null, amount: '', person: '', text: '', day: new Date() });
  };

  // lançamentos agrupados por mês, com o que saiu e o que entrou em cada um
  const months = useMemo(() => {
    const map = new Map<string, { key: string; items: AccountEntry[]; out: number; in: number }>();
    (entries ?? []).filter((e) => e.kind !== 'closing_adjustment').forEach((e) => {
      const key = e.occurred_on.slice(0, 7);
      const g = map.get(key) ?? { key, items: [], out: 0, in: 0 };
      g.items.push(e);
      if (e.direction === 'in') g.in += e.amount; else g.out += e.amount;
      map.set(key, g);
    });
    return Array.from(map.values());
  }, [entries]);

  if (isLoading) {
    return <ScreenLoader />;
  }

  const notStarted = overview && !overview.started;
  const people = (loans?.people ?? []).filter((p) => p.to_receive > 0 || p.to_pay > 0);

  // Cabeçalho: as duas ações e o que está emprestado
  const hero = (
    <View style={styles.hero} testID="retiradas-resumo">
      <Text style={styles.eyebrow}>RETIRADAS E EMPRÉSTIMOS</Text>
      <Text style={styles.note}>Dinheiro que sai ou entra sem ser venda nem despesa. Não entra no resultado do mês.</Text>
      {(!!loans?.to_receive_total || !!loans?.to_pay_total) && (
        <View style={styles.figures}>
          {!!loans?.to_receive_total && (
            <View style={styles.figure}>
              <Text style={styles.figureValue}>{formatCurrency(loans.to_receive_total)}</Text>
              <Text style={styles.caption}>a receber de empréstimos</Text>
            </View>
          )}
          {!!loans?.to_pay_total && (
            <View style={styles.figure}>
              <Text style={styles.figureValue}>{formatCurrency(loans.to_pay_total)}</Text>
              <Text style={styles.caption}>que a loja deve</Text>
            </View>
          )}
        </View>
      )}
      <View style={styles.actionsRow}>
        <AppButton variant="primary" size="md" icon="arrow-up-circle-outline" label="Saiu dinheiro" style={{ flex: 1 }} onPress={() => open('out')} />
        <AppButton variant="outlined" size="md" icon="arrow-down-circle-outline" label="Entrou dinheiro" style={{ flex: 1 }} onPress={() => open('in')} />
      </View>
    </View>
  );

  const peopleCard = people.length > 0 ? (
    <View style={styles.card}>
      <Text style={styles.title}>Empréstimos em aberto</Text>
      {people.map((p) => (
        <View key={p.person} style={styles.line}>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={styles.lineLabel} numberOfLines={1}>{p.person}</Text>
            <View style={styles.pills}>
              {p.to_receive > 0
                ? <Badge label="deve para a loja" variant="warning" size="sm" />
                : <Badge label="a loja deve" variant="info" size="sm" />}
            </View>
          </View>
          <Text style={styles.lineValue}>{formatCurrency(p.to_receive > 0 ? p.to_receive : p.to_pay)}</Text>
        </View>
      ))}
    </View>
  ) : null;

  const entriesList = (
    <View style={{ gap: 12 }}>
      <Text style={styles.eyebrow}>LANÇAMENTOS</Text>
      {months.length === 0 && (
        <View style={styles.card}>
          <Text style={styles.title}>Nada lançado ainda</Text>
          <Text style={styles.note}>Retirada de sócio, empréstimo e fatura do cartão aparecem aqui, mês a mês.</Text>
          <AppButton variant="primary" size="md" icon="arrow-up-circle-outline" label="Saiu dinheiro" onPress={() => open('out')} />
        </View>
      )}
      {months.map((g) => (
        <View key={g.key} style={styles.card}>
          <View style={styles.monthHead}>
            <Text style={styles.title}>{monthLabel(g.key)}</Text>
            <Text style={styles.caption}>
              {[g.out > 0 ? `saiu ${formatCurrency(g.out)}` : '', g.in > 0 ? `entrou ${formatCurrency(g.in)}` : ''].filter(Boolean).join(' · ')}
            </Text>
          </View>
          {g.items.map((e) => (
            <TouchableOpacity key={e.id} style={styles.entry} onPress={() => setDetail(e)} activeOpacity={0.7} accessibilityRole="button"
              accessibilityLabel={`${e.kind_label}, ${formatCurrency(e.amount)}. Toque para corrigir ou apagar`}>
              <Ionicons name={e.direction === 'in' ? 'arrow-down-circle' : 'arrow-up-circle'} size={22}
                color={e.direction === 'in' ? Colors.light.success : Colors.light.error} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.entryTitle} numberOfLines={1}>{e.kind_label}{e.person ? ` · ${e.person}` : ''}</Text>
                <Text style={styles.small} numberOfLines={2}>
                  {formatDate(e.occurred_on)} · {e.account_name}{e.description ? ` · ${e.description}` : ''}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[styles.entryValue, { color: e.direction === 'in' ? Colors.light.success : Colors.light.error }]}>
                  {e.direction === 'in' ? '+' : '-'}{formatCurrency(e.amount)}
                </Text>
                <Text style={styles.caption}>{e.direction === 'in' ? 'entrou' : 'saiu'}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.light.textTertiary} />
            </TouchableOpacity>
          ))}
        </View>
      ))}
    </View>
  );

  return (
    <View style={styles.container}>
      <PageHeader title="Retiradas e empréstimos" subtitle="Fora do resultado do mês" showBackButton backFallback="/finance" />
      <ScrollView contentContainerStyle={[styles.content, desktop]} refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}>
        {!!error && <Text style={styles.error}>{parseApiError(error)}</Text>}
        {notStarted ? (
          <View style={styles.card}>
            <Text style={styles.title}>Implante o financeiro primeiro</Text>
            <Text style={styles.note}>Em Caixa e contas, o admin informa quanto a loja tem hoje em cada conta.</Text>
            {admin && <AppButton variant="primary" size="md" label="Começar a controlar o dinheiro" onPress={() => router.push('/finance/setup' as any)} />}
          </View>
        ) : isDesktop ? (
          <View style={styles.columns}>
            <View style={styles.sideCol}>{hero}{peopleCard}</View>
            <View style={styles.listCol}>{entriesList}</View>
          </View>
        ) : (
          <>
            {hero}
            {peopleCard}
            {entriesList}
          </>
        )}
      </ScrollView>

      <BottomSheet
        visible={!!detail}
        onDismiss={() => setDetail(null)}
        title={detail ? `${detail.kind_label}${detail.person ? ` · ${detail.person}` : ''}` : ''}
        subtitle={detail ? `${detail.direction === 'in' ? 'Entrou' : 'Saiu'} ${formatCurrency(detail.amount)} · ${formatDate(detail.occurred_on)}` : undefined}
        icon={detail?.direction === 'in' ? 'arrow-down-circle-outline' : 'arrow-up-circle-outline'}
        actions={detail ? [
          { label: 'Corrigir', variant: 'secondary', onPress: () => { const e = detail; setDetail(null); openEdit(e); } },
          { label: 'Apagar', variant: 'danger', onPress: () => { const e = detail; setDetail(null); setRemoving(e); } },
        ] : undefined}
      >
        {!!detail && (
          <View style={{ gap: 6 }}>
            <Text style={styles.small}>{`${detail.direction === 'in' ? 'Entrou em' : 'Saiu de'} ${detail.account_name}`}</Text>
            {!!detail.description && <Text style={styles.small}>{detail.description}</Text>}
          </View>
        )}
      </BottomSheet>

      <ConfirmDialog visible={!!removing} title="Apagar este lançamento?" type="warning" confirmText="Apagar" cancelText="Voltar"
        message={removing ? `${removing.kind_label} de ${formatCurrency(removing.amount)}. A conta ${removing.account_name} volta ao saldo de antes.` : ''}
        loading={remove.isPending} onConfirm={() => removing && remove.mutate(removing.id)} onCancel={() => setRemoving(null)} />

      <BottomSheet
        visible={!!editing}
        onDismiss={() => setEditing(null)}
        title="Corrigir lançamento"
        subtitle={editing ? `${editing.e.kind_label}${editing.e.person ? ` · ${editing.e.person}` : ''}` : undefined}
        icon="pencil"
        actions={[{ label: 'Salvar correção', variant: 'primary', loading: saveEdit.isPending, disabled: !canSaveEdit,
          onPress: () => { setEditError(''); saveEdit.mutate(); } }]}
      >
        {!!editing && (
          <View style={{ gap: 10 }}>
            {!!editError && <Text style={styles.error}>{editError}</Text>}
            <Text style={styles.label}>{editing.e.direction === 'in' ? 'Entrou em' : 'Saiu de'}</Text>
            <View style={styles.chips}>
              {accounts.map((a) => (
                <Chip key={a.id} text={a.name} on={editing.account === a.id} color={brand.primary} onPress={() => setEditing({ ...editing, account: a.id })} />
              ))}
            </View>
            <TextInput mode="outlined" label="Valor" value={editing.amount} keyboardType="decimal-pad" left={<TextInput.Affix text="R$" />}
              onChangeText={(t) => setEditing({ ...editing, amount: moneyInput(t) })} activeOutlineColor={brand.primary} />
            {editOwner && (
              <TextInput mode="outlined" label="Qual sócio" value={editing.person} onChangeText={(t) => setEditing({ ...editing, person: t })}
                activeOutlineColor={brand.primary} />
            )}
            <TextInput mode="outlined" label={editOption?.needsText ? 'O que foi' : 'Observação (opcional)'} value={editing.text}
              onChangeText={(t) => setEditing({ ...editing, text: t })} activeOutlineColor={brand.primary} />
            <DateTimeInput label="Dia" value={editing.day} onChange={(d) => d && setEditing({ ...editing, day: d })} mode="date" maximumDate={new Date()} />
            {!!editing.e.kind.startsWith('loan') && (
              <Text style={styles.note}>
                Para trocar a pessoa de um empréstimo, apague o lançamento e lance de novo. O valor não pode ficar abaixo do que já foi devolvido.
              </Text>
            )}
          </View>
        )}
      </BottomSheet>

      <BottomSheet
        visible={!!form}
        onDismiss={() => setForm(null)}
        title={form?.direction === 'in' ? 'Entrou dinheiro' : 'Saiu dinheiro'}
        icon={form?.direction === 'in' ? 'arrow-down-circle-outline' : 'arrow-up-circle-outline'}
        actions={[{ label: 'Lançar', variant: 'primary', loading: save.isPending, disabled: !canSave,
          onPress: () => { setFormError(''); save.mutate(); } }]}
      >
        {!!form && (
          <View style={{ gap: 10 }}>
            {!!formError && <Text style={styles.error}>{formError}</Text>}
            <Text style={styles.label}>O que foi?</Text>
            <View style={styles.chips}>
              {(form.direction === 'in' ? IN : OUT).map((o) => (
                <Chip key={o.kind} text={o.label} on={form.kind === o.kind} color={brand.primary} onPress={() => setForm({ ...form, kind: o.kind })} />
              ))}
            </View>
            {!!option && <Text style={styles.note}>{option.hint}</Text>}
            <Text style={styles.label}>{form.direction === 'in' ? 'Entrou em' : 'Saiu de'}</Text>
            <View style={styles.chips}>
              {accounts.map((a) => (
                <Chip key={a.id} text={a.name} on={form.account === a.id} color={brand.primary} onPress={() => setForm({ ...form, account: a.id })} />
              ))}
            </View>
            <TextInput mode="outlined" label="Valor" value={form.amount} keyboardType="decimal-pad" left={<TextInput.Affix text="R$" />}
              onChangeText={(t) => setForm({ ...form, amount: moneyInput(t) })} activeOutlineColor={brand.primary} />
            {option?.person === 'required' && (
              <TextInput mode="outlined" label={form.kind?.startsWith('owner') ? 'Qual sócio' : 'Com quem (pessoa ou banco)'}
                value={form.person} onChangeText={(t) => setForm({ ...form, person: t })} activeOutlineColor={brand.primary} />
            )}
            <TextInput mode="outlined" label={option?.needsText ? 'O que foi' : 'Observação (opcional)'} value={form.text}
              onChangeText={(t) => setForm({ ...form, text: t })} activeOutlineColor={brand.primary} />
            <DateTimeInput label="Dia" value={form.day} onChange={(d) => d && setForm({ ...form, day: d })} mode="date" maximumDate={new Date()} />
          </View>
        )}
      </BottomSheet>
    </View>
  );
}

function Chip({ text, on, color, onPress }: { text: string; on: boolean; color: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.chip, on && { borderColor: color, backgroundColor: color + '14' }]}
      accessibilityRole="radio" accessibilityState={{ selected: on }}>
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
  figures: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  figure: { gap: 2 },
  figureValue: { fontSize: 20, fontWeight: theme.fontWeight.extrabold, color: Colors.light.text },
  actionsRow: { flexDirection: 'row', gap: 10 },
  card: { backgroundColor: Colors.light.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.light.border, gap: 8 },
  title: { fontSize: 16, fontWeight: theme.fontWeight.extrabold, color: Colors.light.text },
  note: { fontSize: 13, lineHeight: 19, color: Colors.light.textSecondary },
  label: { fontSize: 13, fontWeight: theme.fontWeight.bold, color: Colors.light.textSecondary },
  small: { fontSize: 12, color: Colors.light.textSecondary },
  caption: { fontSize: 11, color: Colors.light.textSecondary },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  monthHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  entry: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  entryTitle: { fontSize: 14, fontWeight: theme.fontWeight.bold, color: Colors.light.text },
  entryValue: { fontSize: 14, fontWeight: theme.fontWeight.extrabold },
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  lineLabel: { flex: 1, fontSize: 14, color: Colors.light.text },
  lineValue: { fontSize: 14, fontWeight: theme.fontWeight.bold, color: Colors.light.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1.5, borderColor: Colors.light.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  chipText: { fontSize: 13, fontWeight: theme.fontWeight.bold, color: Colors.light.text },
  error: { color: Colors.light.error, fontWeight: theme.fontWeight.semibold },
});
