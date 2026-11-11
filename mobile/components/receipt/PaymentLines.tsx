/**
 * Formas de pagamento da venda, uma por linha: o nome (e as parcelas embaixo) à esquerda e o valor à direita.
 * O nome quebra de linha se precisar; o valor nunca passa da borda da tela.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Colors, theme } from '@/constants/Colors';
import { formatCurrency } from '@/utils/format';
import { paymentLine } from '@/utils/paymentLabel';

interface Props {
  payments: Array<{ method?: unknown; payment_method?: unknown; amount: number | string; installments?: number | null }>;
  /** Forma usada quando a venda não trouxe a lista de pagamentos (vendas antigas) */
  fallbackMethod?: unknown;
  fallbackAmount?: number;
}

export default function PaymentLines({ payments, fallbackMethod, fallbackAmount }: Props) {
  const rows = payments.length > 0
    ? payments
    : fallbackMethod ? [{ method: fallbackMethod, amount: fallbackAmount ?? 0 }] : [];
  if (rows.length === 0) return <Text style={styles.detail}>Forma de pagamento não informada</Text>;
  return (
    <View style={styles.list}>
      {rows.map((p, i) => {
        const line = paymentLine(p, formatCurrency);
        return (
          <View key={i} style={styles.row}>
            <View style={styles.left}>
              <Text style={styles.label}>{line.label}</Text>
              {!!line.detail && <Text style={styles.detail}>{line.detail}</Text>}
            </View>
            <Text style={styles.amount}>{line.amount}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: theme.spacing.sm },
  row: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: theme.spacing.md },
  left: { flex: 1, minWidth: 0 },
  label: { fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.medium, color: Colors.light.text },
  detail: { fontSize: theme.fontSize.sm, color: Colors.light.textSecondary },
  amount: { fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.semibold, color: Colors.light.text, flexShrink: 0 },
});
