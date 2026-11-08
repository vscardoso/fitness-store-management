/** "E se eu receber o fiado?": só uma suposição (nada é lançado). Os números vêm de `GET /finance/accounts` (projection). */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/Colors';
import { formatCurrency } from '@/utils/format';
import type { FinanceProjection } from '@/services/financeService';

function Line({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <View style={styles.line}>
      <Text style={[styles.lineLabel, bold && { fontWeight: '800' }]}>{label}</Text>
      <Text style={[styles.lineValue, bold && { fontWeight: '800' }, value < 0 && { color: Colors.light.error }]}>{formatCurrency(value)}</Text>
    </View>
  );
}

export default function FiadoProjectionCard({ projection: p }: { projection: FinanceProjection }) {
  if (!p || p.fiado_open <= 0) return null;
  return (
    <View style={styles.card}>
      <Text style={styles.title}>E se eu receber o fiado? (é só uma suposição)</Text>
      <Line label="Dinheiro hoje em todas as contas" value={p.money_now} />
      <Line label={`Fiado a receber (${p.fiado_customers} cliente(s))`} value={p.fiado_open} />
      {p.fiado_overdue > 0 && <Line label="Dinheiro se receber só o fiado já vencido" value={p.if_overdue_received} />}
      <Line label="Dinheiro se receber todo o fiado" value={p.if_all_received} bold />
      {p.payables_open > 0 && <Line label="Despesas e contas a pagar em aberto" value={-p.payables_open} />}
      {p.payables_open > 0 && <Line label="Sobraria se receber todo o fiado e pagar tudo" value={p.after_paying_everything} bold />}
      <Text style={styles.note}>Nada é lançado aqui: o fiado só entra nas contas quando a cliente pagar.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: Colors.light.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.light.border, gap: 8 },
  title: { fontSize: 15, fontWeight: '800', color: Colors.light.text },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  lineLabel: { flex: 1, fontSize: 14, color: Colors.light.text },
  lineValue: { fontSize: 14, fontWeight: '700', color: Colors.light.text },
  note: { fontSize: 12, lineHeight: 17, color: Colors.light.textSecondary },
});
