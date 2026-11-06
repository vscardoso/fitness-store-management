/**
 * Caixa da loja: abre com o dinheiro que já está na gaveta, mostra quanto DEVE ter agora (vendas em dinheiro,
 * devoluções, suprimentos e sangrias), e fecha contando o dinheiro. O caixa é opcional: sem ele as vendas seguem normais.
 * PIX e cartão não vão para a gaveta: aparecem à parte só para conferir com a maquininha e o banco.
 */
import React, { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Button, TextInput } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import PageHeader from '@/components/layout/PageHeader';
import BottomSheet from '@/components/ui/BottomSheet';
import { Colors } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { useAuth } from '@/hooks/useAuth';
import { Line, ClosedSummary, diffColor } from '@/components/cash/CashParts';
import { isManagerRole } from '@/utils/roles';
import { formatCurrency, formatDateTime } from '@/utils/format';
import { parseApiError } from '@/utils/apiError';
import { differenceText, moneyInput, parseMoneyBr } from '@/utils/cashMoney';
import {
  addCashMovement,
  closeCash,
  getCashCurrent,
  openCash,
  type CashSession,
  type MovementKind,
} from '@/services/cashService';
import { useDesktopContentStyle } from '@/hooks/useLayout';
import { getFinanceOverview } from '@/services/financeService';

// Mesmos motivos do servidor (app/services/cash_register_service.py, REASONS); o servidor recusa qualquer outro.
const REASONS: Record<MovementKind, { id: string; label: string }[]> = {
  supply: [
    { id: 'troco', label: 'Reforço de troco' },
    { id: 'aporte', label: 'Dinheiro colocado no caixa' },
    { id: 'outro', label: 'Outro' },
  ],
  withdrawal: [
    { id: 'sangria', label: 'Guardar ou depositar' },
    { id: 'pagamento', label: 'Pagamento feito com o caixa' },
    { id: 'outro', label: 'Outro' },
  ],
};

const METHOD_LABEL: Record<string, string> = {
  pix: 'PIX',
  debit_card: 'Cartão de débito',
  credit_card: 'Cartão de crédito',
  bank_transfer: 'Transferência',
  installments: 'Parcelado',
  on_account: 'Fiado',
  loyalty_points: 'Pontos de fidelidade',
};

export default function CashScreen() {
  const desktopContent = useDesktopContentStyle();
  const router = useRouter();
  const brand = useBrandingColors();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const manager = isManagerRole(user?.role);
  // loja que já funcionava: gaveta, bancos e contas a pagar entram pela implantação do financeiro
  const { data: finance } = useQuery({ queryKey: ['finance'], queryFn: getFinanceOverview, enabled: manager });

  const [openAmount, setOpenAmount] = useState('');
  const [openNote, setOpenNote] = useState('');
  const [moveKind, setMoveKind] = useState<MovementKind | null>(null);
  const [moveAmount, setMoveAmount] = useState('');
  const [moveReason, setMoveReason] = useState('');
  const [moveNote, setMoveNote] = useState('');
  const [moveAccount, setMoveAccount] = useState<number | null>(null);
  const [closing, setClosing] = useState(false);
  const [counted, setCounted] = useState('');
  const [closeNote, setCloseNote] = useState('');
  const [closed, setClosed] = useState<CashSession | null>(null);
  const [error, setError] = useState('');

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['cash', 'current'],
    queryFn: getCashCurrent,
    refetchInterval: 15_000, // as vendas em dinheiro mudam o esperado
  });
  const session = data?.session ?? null;

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['cash'] });
  const fail = (e: unknown) => setError(parseApiError(e) || 'Não foi possível concluir. Tente de novo.');

  const open = useMutation({
    mutationFn: () => openCash(parseMoneyBr(openAmount) ?? 0, openNote.trim()),
    onSuccess: () => {
      setOpenAmount('');
      setOpenNote('');
      setClosed(null);
      setError('');
      refresh();
    },
    onError: fail,
  });
  const move = useMutation({
    mutationFn: () => addCashMovement(moveKind as MovementKind, parseMoneyBr(moveAmount) as number, moveReason, moveNote.trim(), moveAccount),
    onSuccess: () => {
      setMoveKind(null);
      setError('');
      refresh();
    },
    onError: fail,
  });
  const close = useMutation({
    mutationFn: () => closeCash(parseMoneyBr(counted) as number, closeNote.trim()),
    onSuccess: (s) => {
      setClosing(false);
      setClosed(s);
      setCounted('');
      setCloseNote('');
      setError('');
      refresh();
    },
    onError: fail,
  });

  const startMove = (kind: MovementKind) => {
    setMoveKind(kind);
    setMoveAmount('');
    setMoveReason(REASONS[kind][0].id);
    setMoveNote('');
    setMoveAccount(null);
    setError('');
  };
  // bancos do Financeiro para onde a retirada vai (depósito) / de onde o reforço vem (saque)
  const otherAccounts = finance?.started ? finance.accounts.filter((a) => a.kind === 'bank') : [];

  const openValue = parseMoneyBr(openAmount);
  const moveValue = parseMoneyBr(moveAmount);
  const countedValue = parseMoneyBr(counted);
  const liveDiff = session && countedValue !== null ? differenceText(countedValue - session.expected_amount, formatCurrency) : null;
  const others = useMemo(() => Object.entries(session?.other_methods ?? {}), [session]);

  return (
    <View style={styles.container}>
      <PageHeader
        title="Caixa da gaveta"
        subtitle={session ? 'Aberto' : 'Fechado'}
        showBackButton
        onBack={() => (router.canGoBack() ? router.back() : router.replace((manager ? '/finance' : '/(tabs)/more') as any))}
        rightActions={manager ? [{ icon: 'time-outline', onPress: () => router.push('/cash/history' as any) }] : undefined}
      />
      <ScrollView
        contentContainerStyle={[styles.content, desktopContent]}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
      >
        {!!error && <Text style={styles.error}>{error}</Text>}

        {closed && !session && (
          <View style={styles.card}>
            <ClosedSummary s={closed} title="Caixa fechado" />
          </View>
        )}

        {!isLoading && !session && (
          <View style={styles.card}>
            <Text style={styles.title}>Abrir o caixa</Text>
            <Text style={styles.note}>
              Conte o dinheiro que está na gaveta agora e informe abaixo. É o saldo de partida: o app soma as vendas em dinheiro
              a partir daqui e diz quanto deve ter quando você fechar.
            </Text>
            {data?.last_closed && (
              <Text style={styles.note}>
                O último caixa fechou com {formatCurrency(data.last_closed.counted_amount)} na gaveta ({formatDateTime(data.last_closed.closed_at)}).
              </Text>
            )}
            <TextInput
              mode="outlined"
              label="Dinheiro na gaveta (R$)"
              value={openAmount}
              onChangeText={(t) => setOpenAmount(moneyInput(t))}
              keyboardType="decimal-pad"
              placeholder="0,00"
              style={styles.input}
            />
            <TextInput mode="outlined" label="Observação (opcional)" value={openNote} onChangeText={setOpenNote} style={styles.input} />
            {manager && finance && !finance.started && (
              <TouchableOpacity onPress={() => router.push('/finance' as any)} accessibilityRole="link" style={styles.financeLink}>
                <Text style={[styles.note, { color: brand.primary, fontWeight: '700' }]}>
                  A loja já funcionava? Lance também os bancos, a maquininha e as contas a pagar em Contas e saldos.
                </Text>
              </TouchableOpacity>
            )}
            <Button
              mode="contained"
              buttonColor={brand.primary}
              onPress={() => open.mutate()}
              disabled={openValue === null || open.isPending}
              loading={open.isPending}
              style={styles.btn}
            >
              Abrir caixa
            </Button>
          </View>
        )}

        {session && (
          <>
            <View style={styles.card}>
              <Text style={styles.small}>
                Aberto {formatDateTime(session.opened_at)}
                {session.opened_by ? ` por ${session.opened_by}` : ''}
              </Text>
              <Text style={styles.big}>{formatCurrency(session.expected_amount)}</Text>
              <Text style={styles.note}>
                Dinheiro que deve ter na gaveta agora · {session.sales_count} venda{session.sales_count === 1 ? '' : 's'} no turno
              </Text>

              <Line label="Dinheiro ao abrir" value={session.opening_amount} />
              <Line label="Vendas em dinheiro" value={session.cash_sales} plus />
              <Line label="Devoluções pagas em dinheiro" value={session.cash_refunds} minus />
              <Line label="Dinheiro colocado" value={session.supplies} plus />
              <Line label="Dinheiro retirado" value={session.withdrawals} minus />

              <View style={styles.actions}>
                <Button mode="contained-tonal" icon="plus" onPress={() => startMove('supply')} style={styles.flex}>
                  Colocar dinheiro
                </Button>
                <Button mode="contained-tonal" icon="minus" onPress={() => startMove('withdrawal')} style={styles.flex}>
                  Retirar dinheiro
                </Button>
              </View>
              <Button
                mode="contained"
                buttonColor={brand.primary}
                onPress={() => {
                  setClosing(true);
                  setCounted('');
                  setCloseNote('');
                  setError('');
                }}
                style={styles.btn}
              >
                Fechar caixa
              </Button>
            </View>

            {others.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.title}>Recebido de outras formas</Text>
                <Text style={styles.note}>Não vai para a gaveta. Use para conferir com a maquininha e o banco.</Text>
                {others.map(([k, v]) => (
                  <View key={k} style={styles.line}>
                    <Text style={styles.lineLabel}>
                      {METHOD_LABEL[k] ?? k} ({v.sales})
                    </Text>
                    <Text style={styles.lineValue}>{formatCurrency(v.amount)}</Text>
                  </View>
                ))}
              </View>
            )}

            {session.movements.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.title}>Dinheiro colocado e retirado</Text>
                {session.movements.map((m) => (
                  <View key={m.id} style={styles.line}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.lineLabel}>{m.reason_label}</Text>
                      <Text style={styles.small}>
                        {formatDateTime(m.created_at)}
                        {m.created_by ? ` · ${m.created_by}` : ''}
                        {m.note ? ` · ${m.note}` : ''}
                      </Text>
                    </View>
                    <Text style={[styles.lineValue, { color: m.kind === 'supply' ? Colors.light.success : Colors.light.error }]}>
                      {m.kind === 'supply' ? '+' : '-'} {formatCurrency(m.amount)}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      <BottomSheet
        visible={moveKind !== null}
        onDismiss={() => setMoveKind(null)}
        title={moveKind === 'supply' ? 'Colocar dinheiro no caixa' : 'Retirar dinheiro do caixa'}
        subtitle={session ? `Agora há ${formatCurrency(session.expected_amount)} na gaveta` : undefined}
        icon={moveKind === 'supply' ? 'add-circle-outline' : 'remove-circle-outline'}
        actions={[
          { label: 'Cancelar', variant: 'secondary', onPress: () => setMoveKind(null) },
          {
            label: 'Confirmar',
            onPress: () => move.mutate(),
            loading: move.isPending,
            disabled: moveValue === null || moveValue <= 0 || move.isPending,
          },
        ]}
      >
        <TextInput
          mode="outlined"
          label="Valor (R$)"
          value={moveAmount}
          onChangeText={(t) => setMoveAmount(moneyInput(t))}
          keyboardType="decimal-pad"
          placeholder="0,00"
          style={styles.input}
        />
        <Text style={styles.note}>Motivo</Text>
        <View style={styles.chips}>
          {(moveKind ? REASONS[moveKind] : []).map((r) => (
            <TouchableOpacity
              key={r.id}
              onPress={() => setMoveReason(r.id)}
              style={[styles.chip, moveReason === r.id && { backgroundColor: brand.primary, borderColor: brand.primary }]}
            >
              <Text style={[styles.chipText, moveReason === r.id && { color: '#fff' }]}>{r.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {otherAccounts.length > 0 && (
          <>
            <Text style={styles.note}>{moveKind === 'supply' ? 'De onde veio o dinheiro?' : 'Para onde foi o dinheiro?'}</Text>
            <View style={styles.chips}>
              {[{ id: null as number | null, name: moveKind === 'supply' ? 'De fora (ex.: do bolso)' : 'Saiu da loja (pagamento, outro)' },
                ...otherAccounts.map((a) => ({ id: a.id as number | null, name: a.name }))].map((o) => (
                <TouchableOpacity
                  key={o.id ?? 'fora'}
                  onPress={() => setMoveAccount(o.id)}
                  style={[styles.chip, moveAccount === o.id && { backgroundColor: brand.primary, borderColor: brand.primary }]}
                >
                  <Text style={[styles.chipText, moveAccount === o.id && { color: '#fff' }]}>{o.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {moveAccount !== null && (
              <Text style={styles.small}>
                {moveKind === 'supply'
                  ? 'O valor sai dessa conta e entra na gaveta no Financeiro.'
                  : 'O valor sai da gaveta e entra nessa conta no Financeiro (depósito). Não precisa transferir de novo.'}
              </Text>
            )}
          </>
        )}
        <TextInput mode="outlined" label="Observação (opcional)" value={moveNote} onChangeText={setMoveNote} style={styles.input} />
        {!!error && <Text style={styles.error}>{error}</Text>}
      </BottomSheet>

      <BottomSheet
        visible={closing}
        onDismiss={() => setClosing(false)}
        title="Fechar o caixa"
        subtitle={session ? `O sistema espera ${formatCurrency(session.expected_amount)}` : undefined}
        icon="lock-closed-outline"
        actions={[
          { label: 'Cancelar', variant: 'secondary', onPress: () => setClosing(false) },
          { label: 'Fechar caixa', onPress: () => close.mutate(), loading: close.isPending, disabled: countedValue === null || close.isPending },
        ]}
      >
        <Text style={styles.note}>Conte o dinheiro que está na gaveta e informe o valor. Depois de fechar, o resultado não muda mais.</Text>
        <TextInput
          mode="outlined"
          label="Dinheiro contado (R$)"
          value={counted}
          onChangeText={(t) => setCounted(moneyInput(t))}
          keyboardType="decimal-pad"
          placeholder="0,00"
          style={styles.input}
        />
        {liveDiff && <Text style={[styles.diff, { color: diffColor(liveDiff.kind) }]}>{liveDiff.text}</Text>}
        <TextInput mode="outlined" label="Observação (ex.: motivo da diferença)" value={closeNote} onChangeText={setCloseNote} style={styles.input} />
        {!!error && <Text style={styles.error}>{error}</Text>}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  financeLink: { paddingVertical: 4 },
  container: { flex: 1, backgroundColor: Colors.light.background },
  content: { padding: 16, paddingBottom: 48 },
  card: { backgroundColor: Colors.light.card, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: Colors.light.border },
  title: { fontSize: 16, fontWeight: '700', color: Colors.light.text },
  big: { fontSize: 34, fontWeight: '800', color: Colors.light.text, marginTop: 4 },
  note: { fontSize: 13, lineHeight: 19, color: Colors.light.textSecondary, marginTop: 6 },
  small: { fontSize: 12, color: Colors.light.textSecondary },
  error: { color: Colors.light.error, marginTop: 6, marginBottom: 6, lineHeight: 19 },
  input: { marginTop: 10, backgroundColor: Colors.light.card },
  btn: { marginTop: 12 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 14 },
  flex: { flex: 1 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7, borderTopWidth: 1, borderTopColor: Colors.light.border },
  lineLabel: { flex: 1, fontSize: 14, color: Colors.light.text },
  lineValue: { fontSize: 14, fontWeight: '700', color: Colors.light.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: Colors.light.border, backgroundColor: Colors.light.card },
  chipText: { fontSize: 13, color: Colors.light.text },
  diff: { fontSize: 20, fontWeight: '800', marginTop: 10, marginBottom: 4 },
});
