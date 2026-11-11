/**
 * Na entrada já lançada: de onde saiu o dinheiro da compra. Mostra a conta (ou que ainda não saiu de nenhuma) e deixa
 * corrigir. Só aparece para compra de mercadoria feita depois de o Financeiro começar a contar. O saldo da conta
 * acompanha na hora (e volta se a compra for excluída).
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import AppButton from '@/components/ui/AppButton';
import BottomSheet from '@/components/ui/BottomSheet';
import PurchasePaidFrom, { NO_PURCHASE_PAYMENT, type PurchasePayment } from '@/components/finance/PurchasePaidFrom';
import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { formatCurrency } from '@/utils/format';
import { parseApiError } from '@/utils/apiError';
import { getFinanceOverview } from '@/services/financeService';
import { updateStockEntry } from '@/services/stockEntryService';
import type { StockEntry } from '@/types';

export default function EntryPaidFromCard({ entry }: { entry: StockEntry }) {
  const queryClient = useQueryClient();
  const brand = useBrandingColors();
  const { data: finance } = useQuery({ queryKey: ['finance'], queryFn: getFinanceOverview });
  const current: PurchasePayment = { accountId: entry.paid_account_id ?? null, outside: !!entry.paid_outside, withCash: Number(entry.paid_cash_amount || 0) > 0 };
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<PurchasePayment>(current);
  const [error, setError] = useState('');
  useEffect(() => { if (!open) { setDraft({ accountId: entry.paid_account_id ?? null, outside: !!entry.paid_outside, withCash: Number(entry.paid_cash_amount || 0) > 0 }); setError(''); } }, [open, entry.paid_account_id, entry.paid_outside, entry.paid_cash_amount]);

  const save = useMutation({
    mutationFn: () => updateStockEntry(entry.id, { paid_account_id: draft.accountId, paid_outside: draft.outside, paid_with_cash: !!draft.withCash }),
    onSuccess: () => {
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ['finance'] });
      queryClient.invalidateQueries({ queryKey: ['stock-entry', String(entry.id)] });
      queryClient.invalidateQueries({ queryKey: ['stock-entry', entry.id] });
      queryClient.invalidateQueries({ queryKey: ['stock-entries'] });
    },
    onError: (e) => setError(parseApiError(e)),
  });

  const type = String(entry.entry_type);
  if (!finance?.started || (type !== 'local' && type !== 'online')) return null;
  if (finance.start_date && entry.entry_date.slice(0, 10) < finance.start_date) return null;   // antes da contagem: já está no saldo de partida

  const account = finance.accounts.find((a) => a.id === current.accountId);
  const goods = Math.max(0, Number(entry.total_cost || 0) - Number(entry.discount_amount || 0));
  const cashPart = Number(entry.paid_cash_amount || 0);
  const text = account && cashPart > 0
    ? `Pago com a Gaveta (${formatCurrency(cashPart)}) e ${account.name} (o resto). O valor da mercadoria já saiu desses saldos.`
    : account
    ? `Pago com ${account.name}. O valor da mercadoria já saiu desse saldo.`
    : current.outside
      ? 'Pago por fora das contas do app. Não desconta de nenhuma conta.'
      : 'Ainda não saiu de nenhuma conta: o saldo do Financeiro não desconta esta compra.';
  const unchanged = draft.accountId === current.accountId && draft.outside === current.outside && !!draft.withCash === !!current.withCash;

  return (
    <View style={styles.card} testID="entry-paid-from">
      <View style={styles.head}>
        <Ionicons name="wallet-outline" size={20} color={brand.primary} />
        <Text style={styles.title}>De onde saiu o dinheiro</Text>
      </View>
      <Text style={[styles.text, !account && !current.outside && { color: Colors.light.warningDark }]}>{text}</Text>
      <AppButton variant="outlined" size="md" fullWidth label={account || current.outside ? 'Mudar' : 'Dizer de onde saiu o dinheiro'} onPress={() => setOpen(true)} />

      <BottomSheet
        visible={open}
        onDismiss={() => !save.isPending && setOpen(false)}
        title="De onde saiu o dinheiro?"
        subtitle={entry.entry_code}
        icon="wallet-outline"
        actions={[
          { label: 'Cancelar', onPress: () => setOpen(false), variant: 'secondary', disabled: save.isPending },
          { label: 'Salvar', onPress: () => save.mutate(), variant: 'primary', loading: save.isPending, disabled: unchanged || save.isPending },
        ]}
      >
        <PurchasePaidFrom value={draft} onChange={(v) => { setError(''); setDraft(v); }} amount={goods} entryDate={entry.entry_date.slice(0, 10)} />
        {!!error && <Text style={styles.error}>{error}</Text>}
        <Text style={styles.note}>{`Mercadoria desta compra: ${formatCurrency(goods)} (sem o frete, que tem o próprio "Pago com").`}</Text>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.light.card, borderRadius: theme.borderRadius.xl, padding: theme.spacing.md,
    borderWidth: 1, borderColor: Colors.light.border, gap: theme.spacing.sm, marginBottom: theme.spacing.md,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  title: { fontSize: theme.fontSize.base, fontWeight: theme.fontWeight.bold, color: Colors.light.text },
  text: { fontSize: theme.fontSize.md, color: Colors.light.text },
  error: { fontSize: theme.fontSize.sm, color: Colors.light.error, marginBottom: theme.spacing.sm },
  note: { fontSize: theme.fontSize.sm, color: Colors.light.textSecondary },
});
