/**
 * Resultado de "Descontar compras das contas": depois de pagar, o cartão "Compras sem conta" some e a tela ficava muda.
 * Aqui aparece, compra por compra, de onde saiu cada real (Gaveta e banco) e quanto ficou na gaveta. Fica até tocar em "Entendi".
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import AppButton from '@/components/ui/AppButton';
import { Colors, theme } from '@/constants/Colors';
import { formatCurrency } from '@/utils/format';
import type { PurchasesResult } from '@/services/financeService';

export const PURCHASE_RESULT_KEY = ['purchase-pay-result'];

function dayBR(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

/** Texto de uma compra: "R$ 400,00: R$ 150,00 da Gaveta + R$ 250,00 de Nubank". */
export function purchaseLine(i: PurchasesResult['items'][number], accountName: string | null): string {
  if (i.from_cash > 0 && i.from_account > 0) return `${formatCurrency(i.total)}: ${formatCurrency(i.from_cash)} da Gaveta + ${formatCurrency(i.from_account)} de ${accountName}`;
  if (i.from_cash > 0) return `${formatCurrency(i.total)}: tudo da Gaveta`;
  if (i.from_account > 0) return `${formatCurrency(i.total)}: tudo de ${accountName}`;
  return `${formatCurrency(i.total)}: não saiu de nenhuma conta`;
}

export default function PurchasePaymentResultCard() {
  const queryClient = useQueryClient();
  const { data } = useQuery<PurchasesResult | null>({ queryKey: PURCHASE_RESULT_KEY, queryFn: () => null, enabled: false, initialData: null });
  if (!data || data.items.length === 0) return null;

  const title = data.mode === 'undone' ? 'Compras voltaram para "Compras sem conta"'
    : data.mode === 'outside' ? 'Compras marcadas como pagas por fora das contas'
    : 'Compras descontadas das contas';

  return (
    <View style={styles.card} testID="purchase-pay-result">
      <Text style={styles.title}>{title}</Text>
      {data.mode === 'outside' && <Text style={styles.text}>Nenhum saldo mudou: o dinheiro não saiu das contas do app.</Text>}
      {data.mode === 'undone' && <Text style={styles.text}>O saldo das contas voltou a não descontar estas compras.</Text>}
      {data.items.map((i) => (
        <View key={i.id} style={styles.row}>
          <Text style={styles.code}>{`${i.entry_code} · ${dayBR(i.entry_date)} · ${i.supplier_name}`}</Text>
          <Text style={styles.text}>{data.mode === 'outside' || data.mode === 'undone' ? formatCurrency(i.total) : purchaseLine(i, data.account_name)}</Text>
        </View>
      ))}
      {(data.mode === 'with_cash' || data.mode === 'account') && (
        <View style={styles.sum}>
          <Text style={styles.text}>{`Total das compras: ${formatCurrency(data.total)}`}</Text>
          {data.from_cash > 0 && <Text style={styles.text}>{`Saiu da Gaveta: ${formatCurrency(data.from_cash)}`}</Text>}
          {data.from_account > 0 && <Text style={styles.text}>{`Saiu de ${data.account_name}: ${formatCurrency(data.from_account)}`}</Text>}
          {data.mode === 'with_cash' && data.cash_before !== null && (
            <Text style={styles.text}>
              {data.from_cash > 0
                ? `A Gaveta tinha ${formatCurrency(data.cash_before)} e ficou com ${formatCurrency(data.cash_after ?? 0)}.`
                : 'A Gaveta estava sem dinheiro, por isso tudo saiu do banco.'}
            </Text>
          )}
          {data.mode === 'with_cash' && data.items.length > 1 && (
            <Text style={styles.hint}>A gaveta paga primeiro a compra mais antiga; quando o dinheiro dela acaba, as outras saem do banco.</Text>
          )}
        </View>
      )}
      <AppButton variant="primary" size="md" fullWidth label="Entendi" onPress={() => queryClient.setQueryData(PURCHASE_RESULT_KEY, null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.light.card, borderRadius: theme.borderRadius.xl, padding: theme.spacing.md,
    borderWidth: 1, borderColor: Colors.light.success, gap: theme.spacing.sm,
  },
  title: { fontSize: theme.fontSize.base, fontWeight: theme.fontWeight.extrabold, color: Colors.light.text },
  row: { gap: 2 },
  code: { fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.semibold, color: Colors.light.text },
  text: { fontSize: theme.fontSize.md, color: Colors.light.text },
  hint: { fontSize: theme.fontSize.sm, color: Colors.light.textSecondary },
  sum: { gap: 2, paddingTop: theme.spacing.xs },
});
