/**
 * "Compras sem conta": compras de mercadoria lançadas depois do começo da contagem que ainda não disseram de onde saiu o
 * dinheiro. Enquanto estiverem aqui, o saldo das contas NÃO as desconta. Escolher a conta (ou "não saiu das contas do app")
 * resolve todas de uma vez; os dados vêm de `GET /finance/accounts` (purchases_pending).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Checkbox } from 'react-native-paper';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import AppButton from '@/components/ui/AppButton';
import PurchasePaidFrom, { NO_PURCHASE_PAYMENT, type PurchasePayment } from '@/components/finance/PurchasePaidFrom';
import { Colors, theme } from '@/constants/Colors';
import { formatCurrency } from '@/utils/format';
import { parseApiError } from '@/utils/apiError';
import { payPurchases, type PurchasesPending } from '@/services/financeService';

const FIRST_ROWS = 5;

function dayBR(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export default function PendingPurchasesCard({ pending }: { pending: PurchasesPending }) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [target, setTarget] = useState<PurchasePayment>(NO_PURCHASE_PAYMENT);
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState('');

  // lista mudou (pagou, lançou outra compra): marca todas de novo
  const idsKey = pending.entries.map((e) => e.id).join(',');
  useEffect(() => { setSelected(new Set(pending.entries.map((e) => e.id))); setError(''); }, [idsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const chosen = useMemo(() => pending.entries.filter((e) => selected.has(e.id)), [pending.entries, selected]);
  const chosenTotal = chosen.reduce((s, e) => s + e.amount, 0);
  const rows = showAll ? pending.entries : pending.entries.slice(0, FIRST_ROWS);

  const save = useMutation({
    mutationFn: () => payPurchases(chosen.map((e) => e.id), { accountId: target.accountId, outside: target.outside }),
    onSuccess: () => {
      setTarget(NO_PURCHASE_PAYMENT);
      queryClient.invalidateQueries({ queryKey: ['finance'] });
      queryClient.invalidateQueries({ queryKey: ['stock-entries'] });
    },
    onError: (e) => setError(parseApiError(e)),
  });

  if (!pending.count) return null;
  const ready = chosen.length > 0 && (target.accountId !== null || target.outside);

  const toggle = (id: number) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <View style={styles.card} testID="pending-purchases">
      <Text style={styles.title}>Compras sem conta</Text>
      <Text style={styles.text}>
        {`${pending.count} compra(s) de mercadoria, ${formatCurrency(pending.total)}, ainda não saíram de nenhuma conta. `}
        O saldo acima ainda não desconta essas compras.
      </Text>
      <View>
        {rows.map((e) => (
          <Checkbox.Item
            key={e.id}
            label={`${e.entry_code} · ${dayBR(e.entry_date)} · ${e.supplier_name}   ${formatCurrency(e.amount)}`}
            status={selected.has(e.id) ? 'checked' : 'unchecked'}
            onPress={() => toggle(e.id)}
            position="leading"
            labelStyle={styles.rowLabel}
            style={styles.row}
          />
        ))}
        {pending.entries.length > FIRST_ROWS && (
          <AppButton variant="ghost" size="sm" label={showAll ? 'Mostrar menos' : `Mostrar as ${pending.entries.length} compras`} onPress={() => setShowAll((v) => !v)} />
        )}
      </View>
      <PurchasePaidFrom value={target} onChange={(v) => { setError(''); setTarget(v); }} amount={chosenTotal} />
      {!!error && <Text style={styles.error}>{error}</Text>}
      <AppButton
        variant="primary" size="md" fullWidth
        label={chosen.length > 0 ? `Descontar ${formatCurrency(chosenTotal)} (${chosen.length} compra${chosen.length > 1 ? 's' : ''})` : 'Escolha ao menos uma compra'}
        disabled={!ready} loading={save.isPending} onPress={() => save.mutate()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.light.card, borderRadius: theme.borderRadius.xl, padding: theme.spacing.md,
    borderWidth: 1, borderColor: Colors.light.warning, gap: theme.spacing.sm,
  },
  title: { fontSize: theme.fontSize.base, fontWeight: theme.fontWeight.extrabold, color: Colors.light.text },
  text: { fontSize: theme.fontSize.md, color: Colors.light.text },
  row: { paddingHorizontal: 0, paddingVertical: 0 },
  rowLabel: { fontSize: theme.fontSize.sm, textAlign: 'left' },
  error: { fontSize: theme.fontSize.sm, color: Colors.light.error },
});
