/**
 * Financeiro: quanto a loja tem em cada conta agora (gaveta, bancos, maquininha a receber), transferir entre contas
 * (depósito da gaveta, repasse da maquininha) e o resumo das contas a pagar. O saldo vem calculado do servidor a partir
 * das vendas, devoluções, caixa, transferências e pagamentos (nada é digitado depois da implantação).
 */
import React, { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Button, TextInput } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';

import PageHeader from '@/components/layout/PageHeader';
import CashStatusCard from '@/components/cash/CashStatusCard';
import BottomSheet from '@/components/ui/BottomSheet';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { ActivityIndicator } from '@/components/ui/MagnifierLoader';
import { Colors } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { useDesktopContentStyle } from '@/hooks/useLayout';
import { useAuth } from '@/hooks/useAuth';
import { isAdminRole } from '@/utils/roles';
import { formatCurrency, formatDate } from '@/utils/format';
import { parseApiError, showApiError } from '@/utils/apiError';
import { moneyInput, parseMoneyBr } from '@/utils/cashMoney';
import {
  addBankAccount, deleteTransfer, getFinanceOverview, listPayables, listTransfers, setPixAccount, transferBetweenAccounts,
  type AccountTransfer, type FinanceAccount,
} from '@/services/financeService';

const ICON: Record<string, keyof typeof Ionicons.glyphMap> = { cash: 'cash-outline', bank: 'business-outline', card: 'card-outline' };
// o que cada conta é, sem repetir o nome dela
const SUBTITLE = (a: FinanceAccount) =>
  a.kind === 'cash' ? 'Dinheiro em espécie' : a.kind === 'card' ? 'Cartão que ainda vai cair no banco'
  : a.receives_pix ? 'Banco · recebe o PIX' : 'Banco';

export default function FinanceScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const brand = useBrandingColors();
  const desktop = useDesktopContentStyle();
  const { user } = useAuth();
  const admin = isAdminRole(user?.role);
  const { data, isLoading, refetch, isRefetching, error } = useQuery({ queryKey: ['finance'], queryFn: getFinanceOverview });
  const { data: payables } = useQuery({
    queryKey: ['finance-payables', 'open'], queryFn: () => listPayables('open'), enabled: !!data?.started,
  });

  const { data: transfers } = useQuery({ queryKey: ['finance-transfers'], queryFn: listTransfers, enabled: !!data?.started });
  const [removing, setRemoving] = useState<AccountTransfer | null>(null);
  const [transfer, setTransfer] = useState<{ from: number | null; to: number | null; amount: string; note: string } | null>(null);
  const [newBank, setNewBank] = useState<{ name: string; amount: string } | null>(null);
  const [sheetError, setSheetError] = useState('');
  const [detail, setDetail] = useState<FinanceAccount | null>(null);

  const refresh = () => queryClient.invalidateQueries();
  const doTransfer = useMutation({
    mutationFn: () => transferBetweenAccounts({
      from_account_id: transfer!.from!, to_account_id: transfer!.to!, amount: parseMoneyBr(transfer!.amount) ?? 0,
      description: transfer!.note.trim() || undefined,
    }),
    onSuccess: async () => { setTransfer(null); await refresh(); },
    onError: (e) => setSheetError(parseApiError(e) || 'Não foi possível transferir.'),
  });
  const doBank = useMutation({
    mutationFn: () => addBankAccount(newBank!.name.trim(), parseMoneyBr(newBank!.amount) ?? 0, false),
    onSuccess: async () => { setNewBank(null); await refresh(); },
    onError: (e) => setSheetError(parseApiError(e) || 'Não foi possível criar a conta.'),
  });
  const doRemove = useMutation({
    mutationFn: (id: number) => deleteTransfer(id),
    onSuccess: async () => { setRemoving(null); await refresh(); },
    onError: (e) => { setRemoving(null); showApiError(e, 'Não foi possível apagar'); },
  });
  const doPix = useMutation({
    mutationFn: (id: number) => setPixAccount(id),
    onSuccess: async () => { setDetail(null); await refresh(); },
    onError: (e) => showApiError(e, 'Não foi possível trocar o banco do PIX'),
  });

  if (isLoading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={brand.primary} /></View>;
  }

  if (!data?.started) {
    return (
      <View style={styles.container}>
        <PageHeader title="Financeiro" showBackButton backFallback="/(tabs)/more" />
        <ScrollView contentContainerStyle={[styles.content, desktop]}>
          {!!error && <Text style={styles.error}>{parseApiError(error)}</Text>}
          <CashStatusCard />
          <View style={styles.card}>
            <Ionicons name="storefront-outline" size={32} color={brand.primary} />
            <Text style={styles.title}>A loja já funcionava antes do Provador?</Text>
            <Text style={styles.note}>
              Informe quanto tem na gaveta, em cada banco e para receber da maquininha, e as contas a pagar que já existem.
              A partir daí o app soma as vendas e desconta os pagamentos sozinho, conta por conta.
            </Text>
            {admin ? (
              <Button mode="contained" buttonColor={brand.primary} style={styles.left} onPress={() => router.push('/finance/setup' as any)}>
                Implantar a loja
              </Button>
            ) : (
              <Text style={styles.note}>Quem administra a loja faz a implantação.</Text>
            )}
          </View>
        </ScrollView>
      </View>
    );
  }

  const accounts = data.accounts;
  const name = (id: number | null) => accounts.find((a) => a.id === id)?.name ?? 'Escolha';
  const openTransfer = (from: number | null, to: number | null) => { setSheetError(''); setTransfer({ from, to, amount: '', note: '' }); };
  const card = accounts.find((a) => a.kind === 'card');
  const pixBank = accounts.find((a) => a.receives_pix);

  return (
    <View style={styles.container}>
      <PageHeader title="Financeiro" subtitle={`Desde ${formatDate(data.start_date!)}`} showBackButton backFallback="/(tabs)/more" />
      <ScrollView contentContainerStyle={[styles.content, desktop]} refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}>
        <CashStatusCard />
        <View style={styles.card}>
          <Text style={styles.label}>Total em todas as contas</Text>
          <Text style={[styles.total, data.total < 0 && { color: Colors.light.error }]}>{formatCurrency(data.total)}</Text>
          <View style={styles.actions}>
            <Button mode="contained" buttonColor={brand.primary} icon="swap-horizontal" onPress={() => openTransfer(null, null)}>Transferir</Button>
            {!!card && !!pixBank && card.balance > 0 && (
              <Button mode="outlined" onPress={() => openTransfer(card.id, pixBank.id)}>Repasse da maquininha</Button>
            )}
          </View>
        </View>

        <View style={styles.grid}>
          {accounts.map((a) => (
            <TouchableOpacity key={a.id} style={styles.account} onPress={() => setDetail(a)} activeOpacity={0.8}
              accessibilityRole="button" accessibilityLabel={`${a.name}: ${formatCurrency(a.balance)}`}>
              <View style={styles.accountHead}>
                <View style={[styles.icon, { backgroundColor: brand.primary + '14' }]}>
                  <Ionicons name={ICON[a.kind]} size={18} color={brand.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.accountName} numberOfLines={1}>{a.name}</Text>
                  <Text style={styles.accountKind}>{SUBTITLE(a)}</Text>
                </View>
              </View>
              <Text style={[styles.balance, a.balance < 0 && { color: Colors.light.error }]}>{formatCurrency(a.balance)}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {admin && (
          <Button mode="text" icon="plus" textColor={brand.primary} style={styles.left}
            onPress={() => { setSheetError(''); setNewBank({ name: '', amount: '' }); }}>
            Nova conta de banco
          </Button>
        )}

        <TouchableOpacity style={styles.card} onPress={() => router.push('/finance/payables' as any)} activeOpacity={0.8} accessibilityRole="button">
          <View style={styles.accountHead}>
            <Ionicons name="receipt-outline" size={22} color={brand.primary} />
            <Text style={[styles.title, { flex: 1 }]}>Despesas a pagar</Text>
            <Ionicons name="chevron-forward" size={18} color={Colors.light.textTertiary} />
          </View>
          <Text style={styles.note}>Em aberto: {formatCurrency(payables?.open_total ?? 0)}</Text>
          {!!payables?.overdue_count && (
            <Text style={styles.overdue}>{payables.overdue_count} vencida(s): {formatCurrency(payables.overdue_total)}</Text>
          )}
        </TouchableOpacity>

        {!!transfers?.length && (
          <View style={styles.card}>
            <Text style={styles.title}>Últimas transferências</Text>
            {transfers.slice(0, 10).map((t) => (
              <View key={t.id} style={styles.transferRow}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.transferText} numberOfLines={1}>{name(t.from_account_id)} → {name(t.to_account_id)}</Text>
                  <Text style={styles.accountKind} numberOfLines={1}>
                    {formatDate(t.occurred_on)}{t.description ? ` · ${t.description}` : ''}
                  </Text>
                </View>
                <Text style={styles.transferText}>{formatCurrency(t.amount)}</Text>
                <TouchableOpacity onPress={() => setRemoving(t)} hitSlop={8} accessibilityRole="button"
                  accessibilityLabel={`Apagar transferência de ${formatCurrency(t.amount)}`}>
                  <Ionicons name="trash-outline" size={18} color={Colors.light.textTertiary} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <ConfirmDialog visible={!!removing} title="Apagar esta transferência?" type="warning" confirmText="Apagar" cancelText="Voltar"
        message={removing ? `${formatCurrency(removing.amount)} de ${name(removing.from_account_id)} para ${name(removing.to_account_id)}. As duas contas voltam ao saldo de antes.` : ''}
        loading={doRemove.isPending} onConfirm={() => removing && doRemove.mutate(removing.id)} onCancel={() => setRemoving(null)} />

      <BottomSheet
        visible={!!transfer}
        onDismiss={() => setTransfer(null)}
        title="Transferir entre contas"
        subtitle="Ex.: depósito da gaveta no banco, repasse da maquininha"
        icon="swap-horizontal"
        actions={[{
          label: 'Transferir', variant: 'primary', loading: doTransfer.isPending,
          disabled: !transfer?.from || !transfer?.to || !(parseMoneyBr(transfer?.amount ?? '') ?? 0),
          onPress: () => { setSheetError(''); doTransfer.mutate(); },
        }]}
      >
        {!!transfer && (
          <View style={{ gap: 10 }}>
            {!!sheetError && <Text style={styles.error}>{sheetError}</Text>}
            <Text style={styles.label}>De: {name(transfer.from)}</Text>
            <View style={styles.chips}>
              {accounts.map((a) => (
                <Chip key={a.id} text={a.name} on={transfer.from === a.id} color={brand.primary}
                  onPress={() => setTransfer({ ...transfer, from: a.id, to: transfer.to === a.id ? null : transfer.to })} />
              ))}
            </View>
            <Text style={styles.label}>Para: {name(transfer.to)}</Text>
            <View style={styles.chips}>
              {accounts.filter((a) => a.id !== transfer.from && a.kind !== 'card').map((a) => (
                <Chip key={a.id} text={a.name} on={transfer.to === a.id} color={brand.primary} onPress={() => setTransfer({ ...transfer, to: a.id })} />
              ))}
            </View>
            <TextInput mode="outlined" label="Valor" value={transfer.amount} keyboardType="decimal-pad" left={<TextInput.Affix text="R$" />}
              onChangeText={(t) => setTransfer({ ...transfer, amount: moneyInput(t) })} activeOutlineColor={brand.primary} />
            <TextInput mode="outlined" label="Observação (opcional)" value={transfer.note} onChangeText={(t) => setTransfer({ ...transfer, note: t })}
              activeOutlineColor={brand.primary} />
          </View>
        )}
      </BottomSheet>

      <BottomSheet
        visible={!!newBank}
        onDismiss={() => setNewBank(null)}
        title="Nova conta de banco"
        icon="business-outline"
        actions={[{ label: 'Criar conta', variant: 'primary', loading: doBank.isPending, disabled: !newBank?.name.trim(),
          onPress: () => { setSheetError(''); doBank.mutate(); } }]}
      >
        {!!newBank && (
          <View style={{ gap: 10 }}>
            {!!sheetError && <Text style={styles.error}>{sheetError}</Text>}
            <TextInput mode="outlined" label="Banco" value={newBank.name} onChangeText={(t) => setNewBank({ ...newBank, name: t })}
              placeholder="Nubank, Itaú, Sicoob..." activeOutlineColor={brand.primary} />
            <TextInput mode="outlined" label="Saldo na data da implantação" value={newBank.amount} keyboardType="decimal-pad"
              left={<TextInput.Affix text="R$" />} onChangeText={(t) => setNewBank({ ...newBank, amount: moneyInput(t) })}
              activeOutlineColor={brand.primary} />
          </View>
        )}
      </BottomSheet>

      <BottomSheet
        visible={!!detail}
        onDismiss={() => setDetail(null)}
        title={detail?.name ?? ''}
        subtitle={detail ? `Saldo: ${formatCurrency(detail.balance)}` : undefined}
        icon={detail ? ICON[detail.kind] : undefined}
        actions={detail && admin && detail.kind === 'bank' && !detail.receives_pix
          ? [{ label: 'Receber o PIX nesta conta', variant: 'secondary', loading: doPix.isPending, onPress: () => doPix.mutate(detail.id) }]
          : undefined}
      >
        {!!detail && (
          <View style={{ gap: 6 }}>
            <Line label="Saldo na implantação" value={detail.breakdown.opening} />
            <Line label="Vendas" value={detail.breakdown.sales} />
            <Line label="Devoluções" value={-detail.breakdown.refunds} />
            {detail.kind === 'cash' && <Line label="Caixa (suprimentos e sangrias)" value={detail.breakdown.cash_register} />}
            <Line label="Transferências recebidas" value={detail.breakdown.transfers_in} />
            <Line label="Transferências enviadas" value={-detail.breakdown.transfers_out} />
            <Line label="Contas pagas" value={-detail.breakdown.payables_paid} />
            <Line label="Despesas pagas" value={-detail.breakdown.expenses_paid} />
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

function Line({ label, value }: { label: string; value: number }) {
  if (!value) return null;
  return (
    <View style={styles.line}>
      <Text style={styles.lineLabel}>{label}</Text>
      <Text style={[styles.lineValue, value < 0 && { color: Colors.light.error }]}>{formatCurrency(value)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.light.background },
  content: { padding: 16, paddingBottom: 48, gap: 12 },
  card: { backgroundColor: Colors.light.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.light.border, gap: 8 },
  title: { fontSize: 16, fontWeight: '800', color: Colors.light.text },
  note: { fontSize: 13, lineHeight: 19, color: Colors.light.textSecondary },
  label: { fontSize: 13, fontWeight: '700', color: Colors.light.textSecondary },
  total: { fontSize: 28, fontWeight: '800', color: Colors.light.text },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  left: { alignSelf: 'flex-start' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  account: { flexGrow: 1, flexBasis: 160, backgroundColor: Colors.light.card, borderRadius: 16, padding: 14, borderWidth: 1,
    borderColor: Colors.light.border, gap: 10 },
  accountHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  accountName: { fontSize: 15, fontWeight: '800', color: Colors.light.text },
  accountKind: { fontSize: 12, color: Colors.light.textSecondary },
  balance: { fontSize: 20, fontWeight: '800', color: Colors.light.text },
  transferRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  transferText: { fontSize: 14, fontWeight: '700', color: Colors.light.text },
  overdue: { fontSize: 13, fontWeight: '700', color: Colors.light.error },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1.5, borderColor: Colors.light.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  chipText: { fontSize: 13, fontWeight: '700', color: Colors.light.text },
  line: { flexDirection: 'row', justifyContent: 'space-between' },
  lineLabel: { fontSize: 14, color: Colors.light.textSecondary },
  lineValue: { fontSize: 14, fontWeight: '700', color: Colors.light.text },
  error: { color: Colors.light.error, fontWeight: '600' },
});
