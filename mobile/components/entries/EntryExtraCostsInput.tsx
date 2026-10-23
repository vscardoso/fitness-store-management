/**
 * Custos da compra lançados junto com a entrada (frete, pedágio, almoço da viagem...).
 * Texto em linguagem simples: o lojista só precisa saber que isso soma no custo das peças.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { TextInput } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';

import { Colors, VALUE_COLORS } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { formatCurrency } from '@/utils/format';
import { maskCurrencyBR, unmaskCurrency } from '@/utils/priceFormatter';

export interface EntryExtraCostInput {
  description: string;
  amount: number;
}

interface Props {
  costs: EntryExtraCostInput[];
  onChange: (costs: EntryExtraCostInput[]) => void;
  /** Entrada do tipo Viagem: o gasto é da viagem e é dividido entre as entradas dela. */
  isTrip: boolean;
}

export default function EntryExtraCostsInput({ costs, onChange, isTrip }: Props) {
  const brand = useBrandingColors();
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');

  const total = costs.reduce((s, c) => s + c.amount, 0);

  const add = () => {
    const value = unmaskCurrency(amount);
    if (!description.trim()) return setError('Diga o que foi esse gasto (ex.: frete).');
    if (value <= 0) return setError('Informe quanto custou.');
    setError('');
    onChange([...costs, { description: description.trim(), amount: value }]);
    setDescription('');
    setAmount('');
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.iconWrap, { backgroundColor: `${brand.primary}14` }]}>
          <Ionicons name="cash-outline" size={20} color={brand.primary} />
        </View>
        <Text style={styles.title}>{isTrip ? 'Gastos desta viagem' : 'Frete e outros custos desta compra'}</Text>
      </View>

      <Text style={styles.help}>
        {isTrip
          ? 'Combustível, pedágio, almoço, hospedagem... Esses gastos são divididos entre as entradas da viagem e somam no custo de cada peça. Se a viagem já tem esses custos cadastrados, não repita aqui.'
          : 'Frete, embalagem, taxa... Esses gastos somam no custo das peças desta compra. Assim o lucro de cada venda já desconta o frete. É opcional: dá para lançar depois na tela da entrada.'}
      </Text>

      {costs.map((c, i) => (
        <View key={`${c.description}-${i}`} style={styles.row}>
          <Text style={[styles.rowText, { flex: 1 }]} numberOfLines={2}>{c.description}</Text>
          <Text style={styles.rowValue}>{formatCurrency(c.amount)}</Text>
          <TouchableOpacity
            onPress={() => onChange(costs.filter((_, idx) => idx !== i))}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel={`Remover ${c.description}`}
          >
            <Ionicons name="trash-outline" size={18} color={Colors.light.textSecondary} style={{ marginLeft: 10 }} />
          </TouchableOpacity>
        </View>
      ))}

      <TextInput
        label={isTrip ? 'O que foi? (ex.: combustível)' : 'O que foi? (ex.: frete)'}
        value={description}
        onChangeText={setDescription}
        mode="outlined"
        style={styles.input}
      />
      <TextInput
        label="Quanto custou?"
        value={amount}
        onChangeText={(t) => setAmount(maskCurrencyBR(t))}
        mode="outlined"
        keyboardType="numeric"
        placeholder="0,00"
        left={<TextInput.Affix text="R$" />}
        style={styles.input}
      />
      {!!error && <Text style={styles.error}>{error}</Text>}

      <TouchableOpacity style={[styles.addButton, { borderColor: brand.primary }]} onPress={add}>
        <Ionicons name="add-circle-outline" size={18} color={brand.primary} />
        <Text style={[styles.addText, { color: brand.primary }]}>Adicionar este gasto</Text>
      </TouchableOpacity>

      {costs.length > 0 && (
        <View style={[styles.row, styles.totalRow]}>
          <Text style={[styles.rowText, styles.bold, { flex: 1 }]}>Total de gastos extras</Text>
          <Text style={[styles.rowValue, styles.bold]}>{formatCurrency(total)}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.light.card,
    borderRadius: 16,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  iconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '700', color: Colors.light.text, flex: 1 },
  help: { fontSize: 13, lineHeight: 19, color: Colors.light.textSecondary, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  rowText: { fontSize: 14, color: Colors.light.text, paddingRight: 8 },
  rowValue: { fontSize: 14, fontWeight: '600', color: Colors.light.text },
  totalRow: { borderTopWidth: 1, borderTopColor: Colors.light.border, marginTop: 8, paddingTop: 10 },
  bold: { fontWeight: '700' },
  input: { marginTop: 10, backgroundColor: Colors.light.card },
  error: { color: VALUE_COLORS.negative, marginTop: 8, fontSize: 13 },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    marginTop: 12,
  },
  addText: { fontSize: 14, fontWeight: '600' },
});
