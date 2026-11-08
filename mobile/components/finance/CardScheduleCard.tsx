/**
 * "Maquininha: quando cai no banco": previsão por dia (regra: próximo dia útil) e o repasse. Se a loja repassa a taxa para a
 * cliente, o valor que cai no banco é igual ao das vendas; qualquer diferença vira a despesa "Taxa da maquininha".
 * Números do servidor (`card_schedule` em GET /finance/accounts, repasse em POST /finance/card-settlement).
 */
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, TextInput } from 'react-native-paper';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import BottomSheet from '@/components/ui/BottomSheet';
import { Colors } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { formatCurrency } from '@/utils/format';
import { parseApiError } from '@/utils/apiError';
import { moneyInput, parseMoneyBr, toMoneyField } from '@/utils/cashMoney';
import { settleCard, type CardSchedule } from '@/services/financeService';

const dayLabel = (iso: string, weekday: string) => `${weekday}, ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const STATUS: Record<string, { text: string; color: string }> = {
  overdue: { text: 'já deveria ter caído', color: Colors.light.error },
  today: { text: 'cai hoje', color: Colors.light.warning },
  future: { text: '', color: Colors.light.textSecondary },
};

export default function CardScheduleCard({ schedule: s }: { schedule: CardSchedule }) {
  const brand = useBrandingColors();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<{ gross: string; received: string } | null>(null);
  const [error, setError] = useState('');

  const gross = parseMoneyBr(form?.gross ?? '') ?? 0;
  const received = parseMoneyBr(form?.received ?? '') ?? 0;
  const fee = Math.round((gross - received) * 100) / 100;
  const doSettle = useMutation({
    mutationFn: () => settleCard({ gross, received }),
    onSuccess: async () => { setForm(null); await queryClient.invalidateQueries(); },
    onError: (e) => setError(parseApiError(e) || 'Não foi possível lançar o repasse.'),
  });

  if (!s || s.balance <= 0.004) return null;
  const open = () => {
    const start = s.due_now > 0 ? s.due_now : s.balance;
    setError('');
    setForm({ gross: toMoneyField(start), received: toMoneyField(start) });
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Maquininha: quando cai no banco (previsão)</Text>
      <Text style={styles.note}>{s.rule}</Text>
      {s.previous > 0.004 && (
        <View style={styles.line}>
          <Text style={styles.label}>Saldo anterior da maquininha</Text>
          <Text style={styles.value}>{formatCurrency(s.previous)}</Text>
        </View>
      )}
      {s.items.map((i) => (
        <View key={i.expected_on} style={styles.line}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Cai {dayLabel(i.expected_on, i.weekday)}</Text>
            {!!STATUS[i.status].text && <Text style={[styles.small, { color: STATUS[i.status].color, fontWeight: '700' }]}>{STATUS[i.status].text}</Text>}
          </View>
          <Text style={styles.value}>{formatCurrency(i.amount)}</Text>
        </View>
      ))}
      <View style={styles.line}>
        <Text style={[styles.label, { fontWeight: '800' }]}>Total a receber da maquininha</Text>
        <Text style={[styles.value, { fontWeight: '800' }]}>{formatCurrency(s.balance)}</Text>
      </View>
      <Button mode="contained" buttonColor={brand.primary} icon="swap-horizontal" style={styles.left} onPress={open}>Fazer repasse</Button>

      <BottomSheet
        visible={!!form}
        onDismiss={() => setForm(null)}
        title="Repasse da maquininha"
        subtitle={`Do cartão para ${s.bank_name ?? 'o banco'}`}
        icon="swap-horizontal"
        actions={[{
          label: 'Confirmar repasse', variant: 'primary', loading: doSettle.isPending,
          disabled: gross <= 0 || received <= 0 || received > gross,
          onPress: () => { setError(''); doSettle.mutate(); },
        }]}
      >
        {!!form && (
          <View style={{ gap: 10 }}>
            {!!error && <Text style={styles.error}>{error}</Text>}
            <TextInput mode="outlined" label="Valor das vendas que caíram" value={form.gross} keyboardType="decimal-pad"
              left={<TextInput.Affix text="R$" />} activeOutlineColor={brand.primary}
              onChangeText={(t) => setForm({ gross: moneyInput(t), received: form.received === form.gross ? moneyInput(t) : form.received })} />
            <TextInput mode="outlined" label="Valor que caiu no banco" value={form.received} keyboardType="decimal-pad"
              left={<TextInput.Affix text="R$" />} activeOutlineColor={brand.primary}
              onChangeText={(t) => setForm({ ...form, received: moneyInput(t) })} />
            <Text style={styles.note}>
              Se a taxa da maquininha é repassada para a cliente, o valor que cai no banco é igual ao das vendas. Se caiu menos, a diferença vira a despesa “Taxa da maquininha”.
            </Text>
            {received > gross && <Text style={styles.error}>O que caiu no banco não pode ser maior que o valor das vendas.</Text>}
            {gross > 0 && received > 0 && received <= gross && (
              <Text style={[styles.note, fee > 0 && { color: Colors.light.warning, fontWeight: '700' }]}>
                {fee > 0 ? `Taxa descontada: ${formatCurrency(fee)} (vira despesa).` : 'Sem taxa: o valor que caiu é igual ao das vendas.'}
              </Text>
            )}
          </View>
        )}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: Colors.light.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.light.border, gap: 8 },
  title: { fontSize: 15, fontWeight: '800', color: Colors.light.text },
  note: { fontSize: 12, lineHeight: 17, color: Colors.light.textSecondary },
  small: { fontSize: 12 },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  label: { fontSize: 14, color: Colors.light.text },
  value: { fontSize: 14, fontWeight: '700', color: Colors.light.text },
  left: { alignSelf: 'flex-start' },
  error: { color: Colors.light.error, fontWeight: '600' },
});
