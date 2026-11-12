/**
 * Contas e saldos: quanto a loja tem em cada conta agora (gaveta, bancos, maquininha a receber), transferir entre contas
 * (depósito da gaveta, repasse da maquininha) e o resumo das contas a pagar. O saldo vem calculado do servidor a partir
 * das vendas, devoluções, caixa, transferências e pagamentos (nada é digitado depois da implantação).
 */
import React, { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { TextInput } from 'react-native-paper';
import AppButton from '@/components/ui/AppButton';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';

import PageHeader from '@/components/layout/PageHeader';
import CashStatusCard from '@/components/cash/CashStatusCard';
import FiadoProjectionCard from '@/components/finance/FiadoProjectionCard';
import CardScheduleCard from '@/components/finance/CardScheduleCard';
import PendingPurchasesCard from '@/components/finance/PendingPurchasesCard';
import PurchasePaymentResultCard from '@/components/finance/PurchasePaymentResultCard';
import BottomSheet from '@/components/ui/BottomSheet';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
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
import DateTimeInput from '@/components/ui/DateTimeInput';
import {
  addBankAccount, adjustAccountBalance, updateAccount, updateTransfer, deleteTransfer, getFinanceOverview, listTransfers, setPixAccount,
  transferBetweenAccounts, type AccountTransfer, type FinanceAccount,
} from '@/services/financeService';

/** Quantas transferências aparecem por vez na lista (cada rolagem até o fim, ou "Mostrar mais", traz mais 5). */
const TRANSFERS_PAGE = 5;
const ICON: Record<string, keyof typeof Ionicons.glyphMap> = { cash: 'cash-outline', bank: 'business-outline', card: 'card-outline' };
// o que cada conta é, sem repetir o nome dela
const SUBTITLE = (a: FinanceAccount) =>
  a.kind === 'cash' ? 'Dinheiro em espécie' : a.kind === 'card' ? 'Cartão que ainda vai cair no banco'
  : a.receives_pix ? 'Banco · recebe o PIX' : 'Banco';

export default function AccountsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const brand = useBrandingColors();
  const desktop = useDesktopContentStyle();
  const { user } = useAuth();
  const admin = isAdminRole(user?.role);
  const { data, isLoading, refetch, isRefetching, error } = useQuery({ queryKey: ['finance'], queryFn: getFinanceOverview });
  const { data: transfers } = useQuery({ queryKey: ['finance-transfers'], queryFn: listTransfers, enabled: !!data?.started });
  const [removing, setRemoving] = useState<AccountTransfer | null>(null);
  // Corrigir uma transferência já lançada (valor, dia ou observação; as contas não mudam: para isso apague e lance de novo)
  const [editing, setEditing] = useState<{ t: AccountTransfer; amount: string; day: Date; note: string } | null>(null);
  const [transfer, setTransfer] = useState<{ from: number | null; to: number | null; amount: string; note: string } | null>(null);
  const [newBank, setNewBank] = useState<{ name: string; amount: string } | null>(null);
  const [sheetError, setSheetError] = useState('');
  const [transferWarning, setTransferWarning] = useState('');
  const [detail, setDetail] = useState<FinanceAccount | null>(null);
  // "Transferências": todas, de 5 em 5; a lista rola dentro do cartão e carrega mais ao chegar no fim
  const [transfersShown, setTransfersShown] = useState(TRANSFERS_PAGE);
  // toque numa transferência: escolher Corrigir ou Apagar (antes eram dois ícones em cada linha)
  const [selTransfer, setSelTransfer] = useState<AccountTransfer | null>(null);
  const [openTodo, setOpenTodo] = useState<'purchases' | 'card' | null>(null);
  const [showForecast, setShowForecast] = useState(false);
  const isDesktop = useIsDesktop();
  // Corrigir saldo (admin): 'adjust' leva o saldo de hoje ao valor real; 'opening' corrige o saldo de partida
  const [fix, setFix] = useState<{ acc: FinanceAccount; mode: 'adjust' | 'opening'; amount: string; reason: string } | null>(null);

  // vindo do botão "Transferir entre contas" do Financeiro: abre a folha de transferência uma vez e limpa o parâmetro
  const params = useLocalSearchParams<{ transfer?: string }>();
  useEffect(() => {
    if (params.transfer === '1' && data?.started) {
      setSheetError(''); setTransfer({ from: null, to: null, amount: '', note: '' });
      router.setParams({ transfer: undefined } as any);
    }
  }, [params.transfer, data?.started]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = () => queryClient.invalidateQueries();
  const doTransfer = useMutation({
    mutationFn: () => transferBetweenAccounts({
      from_account_id: transfer!.from!, to_account_id: transfer!.to!, amount: parseMoneyBr(transfer!.amount) ?? 0,
      description: transfer!.note.trim() || undefined,
    }),
    onSuccess: async (res) => { setTransfer(null); setTransferWarning(res?.warning || ''); await refresh(); },
    onError: (e) => setSheetError(parseApiError(e) || 'Não foi possível transferir.'),
  });
  const doEditTransfer = useMutation({
    mutationFn: () => updateTransfer(editing!.t.id, {
      amount: (parseMoneyBr(editing!.amount) ?? 0).toFixed(2), occurred_on: dateToIso(editing!.day),
      description: editing!.note.trim() || undefined,
    }),
    onSuccess: async () => { setEditing(null); await refresh(); },
    onError: (e) => setSheetError(parseApiError(e) || 'Não foi possível corrigir a transferência.'),
  });
  const doFix = useMutation({
    mutationFn: () => {
      const amount = (parseMoneyBr(fix!.amount) ?? 0).toFixed(2);
      return fix!.mode === 'adjust'
        ? adjustAccountBalance(fix!.acc.id, { target_balance: amount, reason: fix!.reason.trim() })
        : updateAccount(fix!.acc.id, { opening_balance: amount });
    },
    onSuccess: async (res) => {
      setFix(null);
      setTransferWarning((res as { warning?: string | null })?.warning || '');
      await refresh();
    },
    onError: (e) => setSheetError(parseApiError(e) || 'Não foi possível corrigir o saldo.'),
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
    return <ScreenLoader />;
  }

  if (!data?.started) {
    return (
      <View style={styles.container}>
        <PageHeader title="Contas e saldos" showBackButton backFallback="/finance" />
        <ScrollView contentContainerStyle={[styles.content, desktop]}>
          {!!error && <Text style={styles.error}>{parseApiError(error)}</Text>}
          <CashStatusCard />
        {!!transferWarning && (
          <View style={[styles.card, styles.warn]}>
            <Text style={styles.warnText}>{transferWarning}</Text>
            <AppButton variant="text" size="sm" label="Entendi" onPress={() => setTransferWarning('')} />
          </View>
        )}
          <View style={styles.card}>
            <Ionicons name="storefront-outline" size={32} color={brand.primary} />
            <Text style={styles.title}>A loja já funcionava antes do Provador?</Text>
            <Text style={styles.note}>
              Informe quanto tem na gaveta, em cada banco e para receber da maquininha, e as contas a pagar que já existem.
              A partir daí o app soma as vendas e desconta os pagamentos sozinho, conta por conta.
            </Text>
            {admin ? (
              <AppButton variant="primary" size="md" fullWidth label="Começar a controlar o dinheiro" onPress={() => router.push('/finance/setup' as any)} />
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
  const openFix = (acc: FinanceAccount) => {
    setSheetError(''); setDetail(null);
    setFix({ acc, mode: 'adjust', amount: moneyInput(Math.round(acc.balance * 100).toString()), reason: '' });
  };
  const openTransfer = (from: number | null, to: number | null) => { setSheetError(''); setTransfer({ from, to, amount: '', note: '' }); };
  const openEditTransfer = (t: AccountTransfer) => {
    setSheetError('');
    setEditing({ t, amount: moneyInput(Math.round(t.amount * 100).toString()), day: isoToDate(t.occurred_on), note: t.description ?? '' });
  };

  const pending = data.purchases_pending;
  const card = data.card_schedule ?? null;
  const cardDue = !!card && card.due_now > 0.004;
  const todoCount = (pending && pending.count > 0 ? 1 : 0) + (cardDue ? 1 : 0);

  const warning = !!transferWarning && (
    <View style={[styles.card, styles.warn]}>
      <Text style={styles.warnText}>{transferWarning}</Text>
      <AppButton variant="text" size="sm" label="Entendi" onPress={() => setTransferWarning('')} />
    </View>
  );

  // Esquerda no notebook: o total, a ação (Transferir) e o que precisa de você
  const hero = (
    <View style={styles.hero} testID="accounts-total">
      <Text style={styles.eyebrow}>DINHEIRO AGORA</Text>
      <Text style={[styles.total, data.total < 0 && { color: Colors.light.error }]}>{formatCurrency(data.total)}</Text>
      <Text style={styles.note}>Gaveta, bancos e o que a maquininha ainda vai pagar, somados.</Text>
      <AppButton variant="primary" size="md" fullWidth icon="swap-horizontal-outline" label="Transferir" onPress={() => openTransfer(null, null)} />
      <AppButton variant="outlined" size="md" fullWidth icon="list-outline" label="Ver extrato passo a passo" onPress={() => router.push('/finance/statement' as any)} />
    </View>
  );

  const todos = todoCount > 0 && (
    <View style={styles.section} testID="accounts-todo">
      <Text style={styles.eyebrow}>{`PRECISA DE VOCÊ · ${todoCount}`}</Text>
      {!!pending && pending.count > 0 && (
        <>
          <TodoRow title="Compras sem conta" note={`${pending.count} compra(s), ${formatCurrency(pending.total)}, ainda não saíram de nenhuma conta`}
            action="Descontar" open={openTodo === 'purchases'} onPress={() => setOpenTodo(openTodo === 'purchases' ? null : 'purchases')} />
          {openTodo === 'purchases' && <PendingPurchasesCard pending={pending} />}
        </>
      )}
      {cardDue && !!card && (
        <>
          <TodoRow title="Repasse da maquininha" note={`${formatCurrency(card.due_now)} já pode ir para ${card.bank_name ?? 'o banco'}`}
            action="Fazer repasse" open={openTodo === 'card'} onPress={() => setOpenTodo(openTodo === 'card' ? null : 'card')} />
          {openTodo === 'card' && <CardScheduleCard schedule={card} />}
        </>
      )}
    </View>
  );

  const forecast = (!!data.projection || (!!card && !cardDue)) && (
    <View style={styles.section}>
      <TouchableOpacity style={styles.forecastHead} onPress={() => setShowForecast((v) => !v)} accessibilityRole="button"
        accessibilityState={{ expanded: showForecast }}>
        <Text style={styles.forecastTitle}>Previsão e maquininha</Text>
        <Ionicons name={showForecast ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.light.textSecondary} />
      </TouchableOpacity>
      {showForecast && (
        <>
          {!!card && !cardDue && <CardScheduleCard schedule={card} />}
          {!!data.projection && <FiadoProjectionCard projection={data.projection} />}
        </>
      )}
    </View>
  );

  const accountsGrid = (
    <View style={styles.section}>
      <Text style={styles.eyebrow}>CONTAS</Text>
      <Text style={styles.small}>Toque numa conta para ver de onde veio o saldo.</Text>
      <View style={styles.grid}>
        {accounts.map((a) => (
          <TouchableOpacity key={a.id} style={styles.account} onPress={() => setDetail(a)} activeOpacity={0.8}
            accessibilityRole="button" accessibilityLabel={`${a.name}: ${formatCurrency(a.balance)}`}>
            <View style={styles.accountHead}>
              <View style={[styles.icon, { backgroundColor: brand.primary + '14' }]}>
                <Ionicons name={ICON[a.kind]} size={18} color={brand.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.accountName} numberOfLines={2}>{a.name}</Text>
                <Text style={styles.accountKind}>{SUBTITLE(a)}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.light.textTertiary} />
            </View>
            <Text style={[styles.balance, a.balance < 0 && { color: Colors.light.error }]}>{formatCurrency(a.balance)}</Text>
          </TouchableOpacity>
        ))}
        {admin && (
          <TouchableOpacity style={[styles.account, styles.newAccount]} onPress={() => { setSheetError(''); setNewBank({ name: '', amount: '' }); }}
            activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Nova conta de banco">
            <Ionicons name="add" size={22} color={brand.primary} />
            <Text style={[styles.accountName, { color: brand.primary }]}>Nova conta de banco</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  const transfersList = !!transfers?.length && (
    <View style={styles.section}>
      <Text style={[styles.eyebrow, { textTransform: 'uppercase' }]}>{`Transferências · ${transfers.length}`}</Text>
      <View style={styles.card}>
        <ScrollView style={styles.transfersScroll} nestedScrollEnabled showsVerticalScrollIndicator
          scrollEventThrottle={100}
          onScroll={(e) => {
            const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
            if (contentOffset.y + layoutMeasurement.height >= contentSize.height - 24) setTransfersShown((n) => Math.min(transfers.length, n + TRANSFERS_PAGE));
          }}>
        {transfers.slice(0, transfersShown).map((t) => (
          <TouchableOpacity key={t.id} style={styles.transferRow} onPress={() => { setSheetError(''); setSelTransfer(t); }} activeOpacity={0.7}
            accessibilityRole="button" accessibilityLabel={`Transferência de ${formatCurrency(t.amount)}: corrigir ou apagar`}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.transferText} numberOfLines={1}>{name(t.from_account_id)} → {name(t.to_account_id)}</Text>
              <Text style={styles.accountKind} numberOfLines={1}>
                {formatDate(t.occurred_on)}{t.description ? ` · ${t.description}` : ''}{t.is_auto ? ' · lançado pelo sistema' : ''}
              </Text>
            </View>
            <Text style={styles.transferText}>{formatCurrency(t.amount)}</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.light.textTertiary} />
          </TouchableOpacity>
        ))}
        </ScrollView>
        {transfersShown < transfers.length ? (
          <AppButton variant="text" size="sm" label={`Mostrar mais ${Math.min(TRANSFERS_PAGE, transfers.length - transfersShown)} (${transfersShown} de ${transfers.length})`}
            onPress={() => setTransfersShown((n) => Math.min(transfers.length, n + TRANSFERS_PAGE))} />
        ) : (
          <Text style={styles.small}>{`Todas as ${transfers.length} transferências estão na lista.`}</Text>
        )}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <PageHeader title="Contas e saldos" subtitle={`Contando desde ${formatDate(data.start_date!)}`} showBackButton backFallback="/finance" />
      <ScrollView contentContainerStyle={[styles.content, desktop]} refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}>
        {warning}
        {isDesktop ? (
          <View style={styles.columns}>
            <View style={styles.col}>
              <CashStatusCard />
              {hero}
              <PurchasePaymentResultCard />
              {todos}
              {forecast}
            </View>
            <View style={styles.col}>
              {accountsGrid}
              {transfersList}
            </View>
          </View>
        ) : (
          <>
            <CashStatusCard />
            {hero}
            {accountsGrid}
            <PurchasePaymentResultCard />
            {todos}
            {forecast}
            {transfersList}
          </>
        )}
      </ScrollView>

      <BottomSheet
        visible={!!selTransfer}
        onDismiss={() => setSelTransfer(null)}
        title="Transferência"
        subtitle={selTransfer ? `${name(selTransfer.from_account_id)} → ${name(selTransfer.to_account_id)}` : undefined}
        icon="swap-horizontal"
        actions={selTransfer ? [
          { label: 'Corrigir', variant: 'secondary', onPress: () => { const t = selTransfer; setSelTransfer(null); openEditTransfer(t); } },
          { label: 'Apagar', variant: 'danger', onPress: () => { const t = selTransfer; setSelTransfer(null); setRemoving(t); } },
        ] : undefined}
      >
        {!!selTransfer && (
          <View style={{ gap: 6 }}>
            <Line label="Valor" value={selTransfer.amount} />
            <Text style={styles.note}>
              {formatDate(selTransfer.occurred_on)}{selTransfer.description ? ` · ${selTransfer.description}` : ''}{selTransfer.is_auto ? ' · lançado pelo sistema' : ''}
            </Text>
          </View>
        )}
      </BottomSheet>

      <ConfirmDialog visible={!!removing} title="Apagar esta transferência?" type="warning" confirmText="Apagar" cancelText="Voltar"
        message={removing ? `${formatCurrency(removing.amount)} de ${name(removing.from_account_id)} para ${name(removing.to_account_id)}. As duas contas voltam ao saldo de antes.${removing.is_auto ? ' Foi um repasse automático: se você apagar, o sistema não o lança de novo (o dia volta para a lista da maquininha e você faz o repasse à mão).' : ''}` : ''}
        loading={doRemove.isPending} onConfirm={() => removing && doRemove.mutate(removing.id)} onCancel={() => setRemoving(null)} />

      {(() => {
        if (!editing) return null;
        const newAmount = parseMoneyBr(editing.amount) ?? 0;
        const unchanged = Math.round(newAmount * 100) === Math.round(editing.t.amount * 100)
          && dateToIso(editing.day) === editing.t.occurred_on.slice(0, 10)
          && (editing.note.trim() || '') === (editing.t.description ?? '').trim();
        return (
          <BottomSheet
            visible
            onDismiss={() => setEditing(null)}
            title="Corrigir transferência"
            subtitle={`${name(editing.t.from_account_id)} → ${name(editing.t.to_account_id)}`}
            icon="pencil"
            actions={[{
              label: 'Salvar correção', variant: 'primary', loading: doEditTransfer.isPending,
              disabled: !newAmount || unchanged, onPress: () => { setSheetError(''); doEditTransfer.mutate(); },
            }]}
          >
            <View style={{ gap: 10 }}>
              {!!sheetError && <Text style={styles.error}>{sheetError}</Text>}
              <TextInput mode="outlined" label="Valor" value={editing.amount} keyboardType="decimal-pad" left={<TextInput.Affix text="R$" />}
                onChangeText={(t) => setEditing({ ...editing, amount: moneyInput(t) })} activeOutlineColor={brand.primary} />
              <DateTimeInput label="Dia" value={editing.day} onChange={(d) => d && setEditing({ ...editing, day: d })} mode="date"
                minimumDate={data.start_date ? isoToDate(data.start_date) : undefined} maximumDate={new Date()} />
              <TextInput mode="outlined" label="Observação" value={editing.note} onChangeText={(t) => setEditing({ ...editing, note: t })}
                activeOutlineColor={brand.primary} />
              <Text style={styles.note}>
                Os saldos das duas contas acompanham o novo valor. Para trocar de conta, apague a transferência e lance de novo.
              </Text>
            </View>
          </BottomSheet>
        );
      })()}

      <BottomSheet
        visible={!!transfer}
        onDismiss={() => setTransfer(null)}
        title="Transferir entre contas"
        subtitle="Ex.: depósito da gaveta no banco. O dinheiro do cartão se repassa em “Fazer repasse”"
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
              {accounts.filter((a) => a.kind !== 'card').map((a) => (
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

      {(() => {
        if (!fix) return null;
        const target = parseMoneyBr(fix.amount);
        const diffCents = target == null ? 0 : Math.round(target * 100) - Math.round(fix.acc.balance * 100);
        const openingNow = Number(fix.acc.opening_balance ?? fix.acc.breakdown.opening ?? 0);
        const shortReason = fix.mode === 'adjust' && fix.reason.trim().length < 5;
        const noChange = fix.mode === 'adjust' ? diffCents === 0 : target == null || Math.round(target * 100) === Math.round(openingNow * 100);
        return (
          <BottomSheet
            visible
            onDismiss={() => setFix(null)}
            title={`Corrigir saldo de ${fix.acc.name}`}
            icon="pencil"
            actions={[{
              label: fix.mode === 'adjust' ? 'Corrigir saldo' : 'Corrigir saldo de partida', variant: 'primary', loading: doFix.isPending,
              disabled: target == null || noChange || shortReason,
              onPress: () => { setSheetError(''); doFix.mutate(); },
            }]}
          >
            <View style={{ gap: 10 }}>
              {!!sheetError && <Text style={styles.error}>{sheetError}</Text>}
              {fix.mode === 'adjust' ? (
                <>
                  <Text style={styles.note}>Saldo no sistema hoje: {formatCurrency(fix.acc.balance)}</Text>
                  <TextInput mode="outlined" label="Quanto tem de verdade agora?" value={fix.amount} keyboardType="decimal-pad"
                    left={<TextInput.Affix text="R$" />} onChangeText={(t) => setFix({ ...fix, amount: moneyInput(t) })}
                    activeOutlineColor={brand.primary} />
                  <TextInput mode="outlined" label="Motivo (mínimo 5 letras)" value={fix.reason}
                    onChangeText={(t) => setFix({ ...fix, reason: t })} activeOutlineColor={brand.primary} />
                  <View style={styles.chips}>
                    {['Contagem do dinheiro', 'Conferi no extrato do banco', 'Erro de lançamento'].map((r) => (
                      <Chip key={r} text={r} on={fix.reason === r} color={brand.primary} onPress={() => setFix({ ...fix, reason: r })} />
                    ))}
                  </View>
                  {diffCents !== 0 && target != null && (
                    <Text style={styles.note}>
                      Vai lançar um ajuste de {diffCents > 0 ? '+' : '-'} {formatCurrency(Math.abs(diffCents) / 100)}. Não conta como venda nem como despesa e fica registrado com o seu nome.
                    </Text>
                  )}
                  <TouchableOpacity onPress={() => { setSheetError(''); setFix({ ...fix, mode: 'opening', amount: moneyInput(Math.round(openingNow * 100).toString()) }); }}
                    accessibilityRole="button">
                    <Text style={[styles.note, { textDecorationLine: 'underline' }]}>Errei o saldo da implantação (saldo de partida)</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <TextInput mode="outlined" label="Saldo de partida" value={fix.amount} keyboardType="decimal-pad"
                    left={<TextInput.Affix text="R$" />} onChangeText={(t) => setFix({ ...fix, amount: moneyInput(t) })}
                    activeOutlineColor={brand.primary} />
                  <Text style={styles.note}>Muda o saldo desde o início da contagem. Só dá se nenhum mês foi fechado.</Text>
                  <TouchableOpacity onPress={() => { setSheetError(''); setFix({ ...fix, mode: 'adjust', amount: moneyInput(Math.round(fix.acc.balance * 100).toString()) }); }}
                    accessibilityRole="button">
                    <Text style={[styles.note, { textDecorationLine: 'underline' }]}>Voltar para corrigir o saldo de hoje</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </BottomSheet>
        );
      })()}

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
        actions={detail ? [
          { label: 'Ver extrato desta conta', variant: 'primary' as const, onPress: () => { const id = detail.id; setDetail(null); router.push(`/finance/statement?account=${id}` as any); } },
          ...(admin ? [
            ...(detail.kind === 'bank' && !detail.receives_pix
              ? [{ label: 'Receber o PIX nesta conta', variant: 'secondary' as const, loading: doPix.isPending, onPress: () => doPix.mutate(detail.id) }]
              : []),
            { label: 'Corrigir saldo', variant: 'secondary' as const, onPress: () => openFix(detail) },
          ] : []),
        ] : undefined}
      >
        {!!detail && (
          <View style={{ gap: 6 }}>
            <Line label="Saldo na implantação" value={detail.breakdown.opening} />
            <Line label="Vendas" value={detail.breakdown.sales} />
            <Line label="Devoluções" value={-detail.breakdown.refunds} />
            {detail.kind === 'cash' && <Line label="Caixa (dinheiro colocado e tirado)" value={detail.breakdown.cash_register} />}
            <Line label="Transferências recebidas" value={detail.breakdown.transfers_in} />
            <Line label="Transferências enviadas" value={-detail.breakdown.transfers_out} />
            <Line label="Contas pagas" value={-detail.breakdown.payables_paid} />
            <Line label="Despesas pagas" value={-detail.breakdown.expenses_paid} />
            {!!detail.breakdown.purchases_paid && <Line label="Compras de mercadoria" value={-detail.breakdown.purchases_paid} />}
            <Line label="Fiado recebido" value={detail.breakdown.receivables_received} />
            <Line label="Outras entradas (sócio, empréstimo)" value={detail.breakdown.other_in} />
            <Line label="Retiradas, empréstimos e fatura" value={-detail.breakdown.other_out} />
            <Line label="Ajustes do fechamento (diferença do caixa)" value={detail.breakdown.closing_adjustments} />
          </View>
        )}
      </BottomSheet>
    </View>
  );
}

/** Linha de "Precisa de você": resumo e uma ação; abre o cartão completo no mesmo lugar. */
function TodoRow({ title, note, action, onPress, open }: { title: string; note: string; action: string; onPress: () => void; open?: boolean }) {
  return (
    <View style={styles.todo}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.todoTitle}>{title}</Text>
        <Text style={styles.todoNote}>{note}</Text>
      </View>
      <AppButton variant="outlined" size="sm" label={open ? 'Fechar' : action} onPress={onPress} />
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
  content: { padding: 16, paddingBottom: 48, gap: 16 },
  columns: { flexDirection: 'row', gap: 20, alignItems: 'flex-start' },
  col: { flex: 1, gap: 16, minWidth: 0 },
  section: { gap: 8 },
  eyebrow: { fontSize: 11, fontWeight: theme.fontWeight.extrabold, letterSpacing: 1, color: Colors.light.textSecondary },
  hero: { backgroundColor: Colors.light.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.light.border, gap: 8 },
  card: { backgroundColor: Colors.light.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.light.border, gap: 8 },
  warn: { borderColor: Colors.light.warning, backgroundColor: Colors.light.warningLight },
  warnText: { fontSize: 14, lineHeight: 20, color: Colors.light.text, fontWeight: theme.fontWeight.bold },
  title: { fontSize: 16, fontWeight: theme.fontWeight.extrabold, color: Colors.light.text },
  note: { fontSize: 13, lineHeight: 19, color: Colors.light.textSecondary },
  small: { fontSize: 12, color: Colors.light.textSecondary },
  label: { fontSize: 13, fontWeight: theme.fontWeight.bold, color: Colors.light.textSecondary },
  total: { fontSize: 30, fontWeight: theme.fontWeight.extrabold, color: Colors.light.text },
  left: { alignSelf: 'flex-start' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  account: { flexGrow: 1, flexBasis: 160, minWidth: 0, backgroundColor: Colors.light.card, borderRadius: 16, padding: 14, borderWidth: 1,
    borderColor: Colors.light.border, gap: 10 },
  newAccount: { borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 4 },
  accountHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  accountName: { fontSize: 15, fontWeight: theme.fontWeight.extrabold, color: Colors.light.text },
  accountKind: { fontSize: 12, color: Colors.light.textSecondary },
  balance: { fontSize: 20, fontWeight: theme.fontWeight.extrabold, color: Colors.light.text },
  todo: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.light.warningLight, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: Colors.light.warning },
  todoTitle: { fontSize: 14, fontWeight: theme.fontWeight.extrabold, color: Colors.light.text },
  todoNote: { fontSize: 12, lineHeight: 17, color: Colors.light.textSecondary },
  forecastHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderStyle: 'dashed', borderColor: Colors.light.border, borderRadius: 12, padding: 12 },
  forecastTitle: { fontSize: 14, fontWeight: theme.fontWeight.bold, color: Colors.light.textSecondary },
  transfersScroll: { maxHeight: 320 },
  transferRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  transferText: { fontSize: 14, fontWeight: theme.fontWeight.bold, color: Colors.light.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1.5, borderColor: Colors.light.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  chipText: { fontSize: 13, fontWeight: theme.fontWeight.bold, color: Colors.light.text },
  line: { flexDirection: 'row', justifyContent: 'space-between' },
  lineLabel: { fontSize: 14, color: Colors.light.textSecondary },
  lineValue: { fontSize: 14, fontWeight: theme.fontWeight.bold, color: Colors.light.text },
  error: { color: Colors.light.error, fontWeight: theme.fontWeight.semibold },
});
