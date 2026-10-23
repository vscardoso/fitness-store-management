/**
 * Devoluções ao fornecedor: peças com defeito (devolvidas por clientes) e peças de condicional que voltam para
 * o fornecedor trocar por outra ou creditar. Mostra o que está esperando envio e o que está com o fornecedor.
 */
import React, { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, TextInput } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import PageHeader from '@/components/layout/PageHeader';
import SuppliersTabs from '@/components/suppliers/SuppliersTabs';
import { Colors } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import {
  createSupplierReturn,
  getDefectivePending,
  listSupplierReturns,
  resolveSupplierReturn,
  SupplierReturn,
} from '@/services/supplierReturnService';
import { formatCurrency } from '@/utils/format';
import { parseApiError } from '@/utils/apiError';
import { maskCurrencyBR, unmaskCurrency } from '@/utils/priceFormatter';

const STATUS_LABEL: Record<string, string> = {
  sent: 'Com o fornecedor',
  exchanged: 'Trocada pelo fornecedor',
  credited: 'Creditada',
  rejected: 'Recusada',
};

export default function SupplierReturnsScreen() {
  const router = useRouter();
  const brand = useBrandingColors();
  const qc = useQueryClient();
  const [error, setError] = useState('');
  const [creditFor, setCreditFor] = useState<number | null>(null);
  const [credit, setCredit] = useState('');

  const pending = useQuery({ queryKey: ['supplier-returns-defective'], queryFn: getDefectivePending });
  const all = useQuery({ queryKey: ['supplier-returns'], queryFn: () => listSupplierReturns() });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['supplier-returns'] });
    qc.invalidateQueries({ queryKey: ['supplier-returns-defective'] });
    qc.invalidateQueries({ queryKey: ['stock-entry'] });
    qc.invalidateQueries({ queryKey: ['products'] });
  };

  const send = useMutation({
    mutationFn: (p: { return_item_id: number; quantity: number }) =>
      createSupplierReturn({ return_item_id: p.return_item_id, quantity: p.quantity, reason: 'Peça com defeito devolvida por cliente' }),
    onSuccess: () => { setError(''); refresh(); },
    onError: (e: any) => setError(parseApiError(e) || 'Não foi possível enviar.'),
  });

  const resolve = useMutation({
    mutationFn: (p: { id: number; outcome: 'exchanged' | 'credited' | 'rejected'; credit_amount?: number }) =>
      resolveSupplierReturn(p.id, { outcome: p.outcome, credit_amount: p.credit_amount }),
    onSuccess: () => { setError(''); setCreditFor(null); setCredit(''); refresh(); },
    onError: (e: any) => setError(parseApiError(e) || 'Não foi possível salvar.'),
  });

  const open: SupplierReturn[] = (all.data || []).filter((r) => r.status === 'sent');
  const done: SupplierReturn[] = (all.data || []).filter((r) => r.status !== 'sent');

  return (
    <View style={styles.container}>
      <PageHeader title="Devoluções ao fornecedor" subtitle="Defeitos e condicional" showBackButton onBack={() => router.back()} />
      <SuppliersTabs active="returns" />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={all.isFetching} onRefresh={refresh} />}
        keyboardShouldPersistTaps="handled"
      >
        {!!error && <Text style={styles.error}>{error}</Text>}

        <Text style={styles.section}>Peças com defeito para enviar</Text>
        {(pending.data || []).length === 0 ? (
          <Text style={styles.note}>Nenhuma peça com defeito esperando envio.</Text>
        ) : (
          (pending.data || []).map((d) => (
            <View key={d.return_item_id} style={styles.card}>
              <Text style={styles.cardTitle}>{d.quantity_pending} peça(s) com defeito</Text>
              <Text style={styles.note}>Custo de cada uma: {formatCurrency(d.unit_cost)}</Text>
              <Button
                mode="contained"
                compact
                buttonColor={brand.primary}
                style={{ marginTop: 8 }}
                loading={send.isPending}
                onPress={() => send.mutate({ return_item_id: d.return_item_id, quantity: d.quantity_pending })}
              >
                Enviar ao fornecedor
              </Button>
            </View>
          ))
        )}
        <Text style={styles.note}>
          Peça de condicional que está no estoque? Abra a entrada e use Devolver ao fornecedor no item.
        </Text>

        <Text style={styles.section}>Com o fornecedor, esperando resposta</Text>
        {open.length === 0 ? (
          <Text style={styles.note}>Nada esperando resposta.</Text>
        ) : (
          open.map((r) => (
            <View key={r.id} style={styles.card}>
              <Text style={styles.cardTitle}>{r.quantity} peça(s), {formatCurrency(r.unit_cost)} cada</Text>
              <Text style={styles.note}>{r.reason}</Text>
              <View style={styles.actions}>
                <Button compact mode="outlined" onPress={() => resolve.mutate({ id: r.id, outcome: 'exchanged' })}>Fornecedor trocou</Button>
                <Button compact mode="outlined" onPress={() => { setCreditFor(r.id); setCredit(''); }}>Creditou</Button>
                <Button compact mode="outlined" textColor={Colors.light.error} onPress={() => resolve.mutate({ id: r.id, outcome: 'rejected' })}>Recusou</Button>
              </View>
              {creditFor === r.id && (
                <View style={{ marginTop: 8 }}>
                  <TextInput
                    mode="outlined"
                    label="Valor creditado pelo fornecedor"
                    value={credit}
                    onChangeText={(t) => setCredit(maskCurrencyBR(t))}
                    keyboardType="numeric"
                    left={<TextInput.Affix text="R$" />}
                  />
                  <Button
                    mode="contained"
                    compact
                    buttonColor={brand.primary}
                    style={{ marginTop: 8 }}
                    onPress={() => {
                      const v = unmaskCurrency(credit);
                      if (v <= 0) return setError('Informe o valor creditado.');
                      resolve.mutate({ id: r.id, outcome: 'credited', credit_amount: v });
                    }}
                  >
                    Confirmar crédito
                  </Button>
                  <Text style={styles.note}>O valor abate o custo das peças da entrada de origem.</Text>
                </View>
              )}
            </View>
          ))
        )}

        {done.length > 0 && <Text style={styles.section}>Já resolvidas</Text>}
        {done.map((r) => (
          <View key={r.id} style={styles.card}>
            <Text style={styles.cardTitle}>{STATUS_LABEL[r.status] || r.status}: {r.quantity} peça(s)</Text>
            {r.credit_amount ? <Text style={styles.note}>Crédito de {formatCurrency(r.credit_amount)}</Text> : null}
            {r.resolution_note ? <Text style={styles.note}>{r.resolution_note}</Text> : null}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  content: { padding: 16, paddingBottom: 48 },
  section: { fontSize: 16, fontWeight: '700', color: Colors.light.text, marginTop: 16, marginBottom: 8 },
  card: { backgroundColor: Colors.light.card, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: Colors.light.border },
  cardTitle: { fontSize: 15, fontWeight: '700', color: Colors.light.text },
  note: { fontSize: 13, lineHeight: 19, color: Colors.light.textSecondary, marginTop: 4 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  error: { color: Colors.light.error, marginBottom: 8 },
});
