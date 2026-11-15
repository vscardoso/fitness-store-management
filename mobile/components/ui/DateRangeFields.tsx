/**
 * Duas datas digitadas (De, Até) e o botão que aplica. Usado onde a pessoa escolhe um período livre: extrato e relatório de vendas.
 * Digitação com máscara dia/mês/ano; a conferência (datas que existem, de antes de até, no máximo 1 ano) é de `utils/periodRange.ts`.
 */
import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import AppButton from '@/components/ui/AppButton';
import { Colors, theme } from '@/constants/Colors';
import { maskDate } from '@/utils/dateBr';
import { checkRange, isoToBr } from '@/utils/periodRange';

interface Props {
  /** Datas já escolhidas (AAAA-MM-DD), para reabrir a tela com elas preenchidas. */
  start?: string;
  end?: string;
  applyLabel?: string;
  onApply: (start: string, end: string) => void;
}

export default function DateRangeFields({ start, end, applyLabel = 'Ver período', onApply }: Props) {
  const [from, setFrom] = useState(start ? isoToBr(start) : '');
  const [to, setTo] = useState(end ? isoToBr(end) : '');
  const [error, setError] = useState('');

  const apply = () => {
    const r = checkRange(from, to);
    if (!r.ok) { setError(r.error); return; }
    setError('');
    setTo(isoToBr(r.end));   // data final no futuro vira hoje: mostra o que valeu
    onApply(r.start, r.end);
  };

  return (
    <View style={styles.box} testID="date-range-fields">
      <View style={styles.row}>
        <View style={styles.field}>
          <Text style={styles.label}>De</Text>
          <TextInput value={from} onChangeText={(v) => { setFrom(maskDate(v)); setError(''); }} placeholder="dd/mm/aaaa"
            placeholderTextColor={Colors.light.textSecondary} keyboardType="numeric" maxLength={10} style={styles.input}
            accessibilityLabel="Data inicial do período" onSubmitEditing={apply} />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Até</Text>
          <TextInput value={to} onChangeText={(v) => { setTo(maskDate(v)); setError(''); }} placeholder="dd/mm/aaaa"
            placeholderTextColor={Colors.light.textSecondary} keyboardType="numeric" maxLength={10} style={styles.input}
            accessibilityLabel="Data final do período" onSubmitEditing={apply} />
        </View>
      </View>
      {!!error && <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text>}
      <AppButton variant="primary" size="md" fullWidth icon="calendar-outline" label={applyLabel} onPress={apply} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 10, backgroundColor: Colors.light.card, borderRadius: 14, borderWidth: 1, borderColor: Colors.light.border, padding: 12 },
  row: { flexDirection: 'row', gap: 10 },
  field: { flex: 1, minWidth: 0, gap: 4 },
  label: { fontSize: 12, fontWeight: theme.fontWeight.bold, color: Colors.light.textSecondary },
  input: { borderWidth: 1, borderColor: Colors.light.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: Colors.light.text, backgroundColor: Colors.light.background },
  error: { fontSize: 13, color: Colors.light.error },
});
