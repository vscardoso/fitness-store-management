/**
 * Duas datas escolhidas no CALENDÁRIO (De, Até) e o botão que aplica. Usado onde a pessoa escolhe um período livre:
 * resultado, extrato e relatório de vendas. Ninguém digita data: no app web abre o calendário do aparelho, no celular o seletor.
 * A conferência (de antes de até, no máximo 1 ano, data final no futuro vira hoje) é de `utils/periodRange.ts`.
 */
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import AppButton from '@/components/ui/AppButton';
import DateTimeInput from '@/components/ui/DateTimeInput';
import { Colors } from '@/constants/Colors';
import { checkRange } from '@/utils/periodRange';

interface Props {
  /** Datas já escolhidas (AAAA-MM-DD), para reabrir a tela com elas preenchidas. */
  start?: string;
  end?: string;
  applyLabel?: string;
  onApply: (start: string, end: string) => void;
}

/** AAAA-MM-DD -> Date no dia local (meio-dia: não vira o dia anterior por fuso). */
function isoToDate(iso?: string): Date | undefined {
  const m = String(iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0) : undefined;
}

/** Date -> DD/MM/AAAA, o formato que `checkRange` confere. */
function dateToBr(d?: Date): string {
  if (!d) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export default function DateRangeFields({ start, end, applyLabel = 'Ver período', onApply }: Props) {
  const [from, setFrom] = useState<Date | undefined>(isoToDate(start));
  const [to, setTo] = useState<Date | undefined>(isoToDate(end));
  const [error, setError] = useState('');
  const today = new Date();

  const apply = () => {
    if (!from || !to) { setError(!from ? 'Escolha a data inicial.' : 'Escolha a data final.'); return; }
    const r = checkRange(dateToBr(from), dateToBr(to));
    if (!r.ok) { setError(r.error); return; }
    setError('');
    setTo(isoToDate(r.end));   // data final no futuro vira hoje: mostra o que valeu
    onApply(r.start, r.end);
  };

  return (
    <View style={styles.box} testID="date-range-fields">
      <View style={styles.row}>
        <View style={styles.field}>
          <DateTimeInput label="De" mode="date" modern value={from} maximumDate={today}
            onChange={(d) => { setFrom(d); setError(''); }} />
        </View>
        <View style={styles.field}>
          <DateTimeInput label="Até" mode="date" modern value={to} maximumDate={today} minimumDate={from}
            onChange={(d) => { setTo(d); setError(''); }} />
        </View>
      </View>
      {!!error && <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text>}
      <AppButton variant="primary" size="md" fullWidth icon="calendar-outline" label={applyLabel} onPress={apply} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 10, backgroundColor: Colors.light.card, borderRadius: 14, borderWidth: 1, borderColor: Colors.light.border, padding: 12 },
  // cada data ocupa a largura toda no celular (a data não cabe pela metade) e fica lado a lado em tela larga
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  field: { flexGrow: 1, flexBasis: 220, minWidth: 0 },
  error: { fontSize: 13, color: Colors.light.error },
});
