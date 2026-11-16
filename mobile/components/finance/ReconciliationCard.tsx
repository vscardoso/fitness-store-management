/**
 * "A conta do mês fecha?": começou com X, entrou Y (vendas, fiado recebido), saiu Z (despesas, compras, contas pagas, devoluções),
 * então deveria ter W. Se as contas mostram outro valor, a diferença é o que foi corrigido à mão (Corrigir saldo, contagem do
 * caixa): o cartão avisa "a conta não fecha" e lista cada correção, quem fez e por quê. Dados: `GET /finance/reconciliation`.
 */
import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';

import { Colors, theme } from '@/constants/Colors';
import { formatCurrency, formatDate } from '@/utils/format';
import { getReconciliation } from '@/services/financeService';

function Row({ label, value, tone, bold }: { label: string; value: string; tone?: string; bold?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.label, bold && styles.bold]}>{label}</Text>
      <Text style={[styles.value, bold && styles.bold, tone ? { color: tone } : null]}>{value}</Text>
    </View>
  );
}

export default function ReconciliationCard() {
  const { data } = useQuery({ queryKey: ['finance-reconciliation'], queryFn: () => getReconciliation(), refetchInterval: 60_000 });
  const [open, setOpen] = useState(false);
  if (!data?.started || data.status === 'empty' || data.should_have === undefined) return null;
  const ok = data.status === 'ok';
  const color = ok ? Colors.light.success : Colors.light.warningDark;
  const adjustments = data.adjustments ?? [];
  const diff = data.difference ?? 0;

  return (
    <View style={[styles.card, { borderColor: color }]} testID="finance-reconciliation">
      <View style={styles.head}>
        <Ionicons name={ok ? 'checkmark-circle' : 'alert-circle'} size={22} color={color} />
        <Text style={styles.title}>{ok ? 'A conta do mês fecha' : 'A conta do mês não fecha'}</Text>
      </View>
      <Text style={styles.message}>{data.message}</Text>
      <Row label="Começou o mês com" value={formatCurrency(data.opening ?? 0)} />
      <Row label="+ Entrou (vendas e fiado recebido)" value={formatCurrency(data.entered ?? 0)} tone={Colors.light.success} />
      <Row label="− Saiu (despesas, compras, contas pagas)" value={formatCurrency(data.left ?? 0)} tone={Colors.light.error} />
      {Math.abs(data.cash_net ?? 0) > 0.004 && <Row label="± Caixa (colocado menos tirado)" value={formatCurrency(data.cash_net ?? 0)} />}
      <Row label="= Deveria ter" value={formatCurrency(data.should_have)} bold />
      <Row label="As contas mostram" value={formatCurrency(data.have ?? 0)} bold />
      {!ok && <Row label="Diferença (corrigida à mão)" value={`${diff > 0 ? '+' : '-'} ${formatCurrency(Math.abs(diff))}`} tone={color} bold />}
      {!!data.pending_approvals && <Text style={styles.note}>{`${data.pending_approvals} pedido(s) de correção esperando aprovação.`}</Text>}
      {adjustments.length > 0 && (
        <>
          <TouchableOpacity onPress={() => setOpen((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={styles.toggle}>
            <Text style={styles.toggleText}>{open ? 'Esconder as correções' : `Ver as ${adjustments.length} correç${adjustments.length > 1 ? 'ões' : 'ão'}`}</Text>
            <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.light.textSecondary} />
          </TouchableOpacity>
          {open && adjustments.map((a) => (
            <View key={a.id} style={styles.adj}>
              <Text style={styles.adjTitle}>{`${formatDate(a.date)} · ${a.account} · ${a.amount > 0 ? '+' : '-'} ${formatCurrency(Math.abs(a.amount))}`}</Text>
              <Text style={styles.adjText}>{`${a.reason}${a.by ? ` (${a.by})` : ''}`}</Text>
            </View>
          ))}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: Colors.light.card, borderRadius: 16, borderWidth: 1.5, padding: 14, gap: 6 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 15, fontWeight: theme.fontWeight.extrabold, color: Colors.light.text },
  message: { fontSize: 13, lineHeight: 19, color: Colors.light.textSecondary, marginBottom: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  label: { flex: 1, fontSize: 13, color: Colors.light.textSecondary },
  value: { fontSize: 13, fontWeight: theme.fontWeight.bold, color: Colors.light.text, flexShrink: 0 },
  bold: { fontWeight: theme.fontWeight.extrabold, color: Colors.light.text },
  note: { fontSize: 12, color: Colors.light.textSecondary },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 6 },
  toggleText: { fontSize: 13, fontWeight: theme.fontWeight.bold, color: Colors.light.textSecondary },
  adj: { borderLeftWidth: 2, borderLeftColor: Colors.light.border, paddingLeft: 10, gap: 2 },
  adjTitle: { fontSize: 13, fontWeight: theme.fontWeight.bold, color: Colors.light.text },
  adjText: { fontSize: 12, lineHeight: 18, color: Colors.light.textSecondary },
});
