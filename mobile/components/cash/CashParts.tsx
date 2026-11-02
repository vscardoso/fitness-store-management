/** Peças do caixa usadas na tela do caixa e no histórico: linha de valor, cor da diferença e o resumo de um caixa fechado. */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/Colors';
import { formatCurrency } from '@/utils/format';
import { differenceText } from '@/utils/cashMoney';
import type { CashSession } from '@/services/cashService';

export const diffColor = (kind: 'ok' | 'over' | 'short') =>
  kind === 'ok' ? Colors.light.success : kind === 'over' ? Colors.light.warning : Colors.light.error;

export function Line({ label, value, plus, minus }: { label: string; value: number; plus?: boolean; minus?: boolean }) {
  const sign = plus ? '+ ' : minus ? '- ' : '';
  return (
    <View style={styles.line}>
      <Text style={styles.lineLabel}>{label}</Text>
      <Text style={styles.lineValue}>
        {sign}
        {formatCurrency(value)}
      </Text>
    </View>
  );
}

/** Fotografia de um caixa fechado: diferença em destaque e de onde veio cada valor. */
export function ClosedSummary({ s, title }: { s: CashSession; title?: string }) {
  const d = differenceText(s.difference ?? 0, formatCurrency);
  return (
    <View>
      {!!title && <Text style={styles.title}>{title}</Text>}
      <Text style={[styles.diff, { color: diffColor(d.kind) }]}>{d.text}</Text>
      <Line label="Dinheiro ao abrir" value={s.opening_amount} />
      <Line label="Vendas em dinheiro" value={s.cash_sales} plus />
      <Line label="Devoluções em dinheiro" value={s.cash_refunds} minus />
      <Line label="Dinheiro colocado" value={s.supplies} plus />
      <Line label="Dinheiro retirado" value={s.withdrawals} minus />
      <Line label="Esperado na gaveta" value={s.expected_amount} />
      <Line label="Contado" value={s.counted_amount ?? 0} />
      <Text style={styles.note}>{s.sales_count} venda{s.sales_count === 1 ? '' : 's'} no turno (todas as formas de pagamento).</Text>
      {!!s.closing_note && <Text style={styles.note}>Observação: {s.closing_note}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 16, fontWeight: '700', color: Colors.light.text },
  note: { fontSize: 13, lineHeight: 19, color: Colors.light.textSecondary, marginTop: 8 },
  diff: { fontSize: 20, fontWeight: '800', marginTop: 8, marginBottom: 4 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7, borderTopWidth: 1, borderTopColor: Colors.light.border },
  lineLabel: { flex: 1, fontSize: 14, color: Colors.light.text },
  lineValue: { fontSize: 14, fontWeight: '700', color: Colors.light.text },
});
