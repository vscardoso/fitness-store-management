/**
 * "O dinheiro do mês bate?": começou com X, entrou Y, saiu Z, mais as correções feitas à mão, igual ao que as contas mostram
 * (a soma das linhas fecha na tela, `utils/reconciliationView.ts`). O título diz a situação em uma frase; as correções e "para onde
 * foi o dinheiro" ficam recolhidas. Dados: `GET /finance/reconciliation`.
 */
import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';

import { Colors, theme } from '@/constants/Colors';
import { formatCurrency, formatDate } from '@/utils/format';
import { plural } from '@/utils/plural';
import { buildReconView, type ReconRow } from '@/utils/reconciliationView';
import { getReconciliation } from '@/services/financeService';

function Row({ label, value, tone, bold }: { label: string; value: string; tone?: string; bold?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.label, bold && styles.bold]}>{label}</Text>
      <Text style={[styles.value, bold && styles.bold, tone ? { color: tone } : null]}>{value}</Text>
    </View>
  );
}

function toneOf(r: ReconRow): string | undefined {
  if (r.kind === 'plus') return Colors.light.success;
  if (r.kind === 'minus') return Colors.light.error;
  if (r.kind === 'signed') return r.value > 0 ? Colors.light.success : r.value < 0 ? Colors.light.error : undefined;
  return undefined;
}

export default function ReconciliationCard() {
  const { data } = useQuery({ queryKey: ['finance-reconciliation'], queryFn: () => getReconciliation(), refetchInterval: 60_000 });
  const [open, setOpen] = useState(false);
  const [showBridge, setShowBridge] = useState(false);
  const view = data ? buildReconView(data, formatCurrency) : null;
  if (!data || !view) return null;
  const color = view.tone === 'ok' ? Colors.light.success : Colors.light.warningDark;
  const adjustments = data.adjustments ?? [];
  const bridge = data.bridge;
  const money = (r: ReconRow) => (r.kind === 'signed' ? `${r.value > 0 ? '+' : r.value < 0 ? '−' : ''} ${formatCurrency(Math.abs(r.value))}`.trim() : formatCurrency(r.value));

  return (
    <View style={[styles.card, { borderColor: color }]} testID="finance-reconciliation">
      <View style={styles.head}>
        <Ionicons name={view.tone === 'ok' ? 'checkmark-circle' : 'alert-circle'} size={22} color={color} />
        <Text style={styles.title}>{view.title}</Text>
      </View>
      <Text style={styles.note}>{`Mês até ${formatDate(data.end ?? '')}`}</Text>
      {!!view.hint && <Text style={[styles.message, { color: Colors.light.warningDark }]}>{view.hint}</Text>}
      {view.rows.map((r) => (
        r.key === 'adjustments' && adjustments.length > 0 ? (
          <View key={r.key}>
            <TouchableOpacity onPress={() => setOpen((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={styles.row}>
              <Text style={[styles.label, styles.link]}>{`${r.label} (${adjustments.length})`}</Text>
              <Text style={[styles.value, toneOf(r) ? { color: toneOf(r) } : null]}>{money(r)}</Text>
              <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.light.textSecondary} />
            </TouchableOpacity>
            {open && adjustments.map((a) => (
              <View key={a.id} style={styles.adj}>
                <Text style={styles.adjTitle}>{`${formatDate(a.date)} · ${a.account} · ${a.amount > 0 ? '+' : '-'} ${formatCurrency(Math.abs(a.amount))}`}</Text>
                <Text style={styles.adjText}>{`${a.reason}${a.by ? ` (${a.by})` : ''}`}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Row key={r.key} label={r.label} value={money(r)} tone={toneOf(r)} bold={r.kind === 'total'} />
        )
      ))}
      {!!bridge && (
        <>
          <TouchableOpacity onPress={() => setShowBridge((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: showBridge }} style={styles.toggle}>
            <Text style={styles.toggleText}>{showBridge ? 'Esconder' : 'Ver para onde foi o dinheiro'}</Text>
            <Ionicons name={showBridge ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.light.textSecondary} />
          </TouchableOpacity>
          {showBridge && (
            <View style={styles.bridge} testID="finance-bridge">
              <Row label="Vendeu no mês (menos devoluções)" value={formatCurrency(bridge.sold)} />
              <Row label="− Gastou (despesas, compras, contas pagas)" value={formatCurrency(bridge.spent)} tone={Colors.light.error} />
              <Row label="= Sobraria" value={formatCurrency(bridge.should_be_left)} bold />
              {bridge.lines.map((l) => (
                <Row key={l.key} label={`${l.amount > 0 ? '+' : '−'} ${l.label}`} value={formatCurrency(Math.abs(l.amount))}
                  tone={l.amount > 0 ? Colors.light.success : Colors.light.error} />
              ))}
              {Math.abs(bridge.residual) > 0.004 && <Row label="± Sobra sem explicação" value={`${bridge.residual > 0 ? '+' : '-'} ${formatCurrency(Math.abs(bridge.residual))}`} tone={Colors.light.warningDark} bold />}
              <Row label="= Aumento nas contas desde o começo do mês" value={formatCurrency(bridge.change_in_accounts)} bold />
              <Text style={styles.note}>
                {`Das contas, ${formatCurrency(bridge.available)} está disponível (gaveta e bancos) e ${formatCurrency(bridge.card_receivable)} ainda está na maquininha.`}
              </Text>
            </View>
          )}
        </>
      )}
      {!!data.pending_approvals && <Text style={styles.note}>{`${plural(data.pending_approvals, 'pedido de correção espera', 'pedidos de correção esperam')} aprovação.`}</Text>}
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
  link: { color: Colors.light.text, textDecorationLine: 'underline' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 6 },
  toggleText: { fontSize: 13, fontWeight: theme.fontWeight.bold, color: Colors.light.textSecondary },
  bridge: { gap: 6, paddingTop: 4 },
  adj: { borderLeftWidth: 2, borderLeftColor: Colors.light.border, paddingLeft: 10, gap: 2 },
  adjTitle: { fontSize: 13, fontWeight: theme.fontWeight.bold, color: Colors.light.text },
  adjText: { fontSize: 12, lineHeight: 18, color: Colors.light.textSecondary },
});
