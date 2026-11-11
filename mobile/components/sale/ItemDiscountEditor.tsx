/**
 * Desconto por peça no carrinho (Black Friday: cada peça da mesma venda com o seu desconto).
 *
 * Quem vende digita o desconto, em % ou em R$ POR PEÇA. Não há valores prontos. Enquanto digita, mostra como a peça fica
 * (preço de cada, desconto da linha). A conta fica em `utils/itemDiscount.ts` (centavos exatos, igual ao servidor) e o
 * carrinho guarda o desconto por peça, então mudar a quantidade depois mantém o desconto de cada peça.
 */
import React, { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { Text } from 'react-native-paper';
import AppButton from '@/components/ui/AppButton';
import { Colors, theme } from '@/constants/Colors';
import { formatCurrency } from '@/utils/format';
import {
  discountFromInput, lineDiscount, lineNet, percentLabel, unitNet, type DiscountKind,
} from '@/utils/itemDiscount';

interface Props {
  unitPrice: number;
  quantity: number;
  /** Desconto por peça que já está no carrinho (0 ou ausente = sem desconto). */
  unitDiscount?: number;
  /** Recebe o desconto POR PEÇA em reais (já em centavos exatos). */
  onApply: (unitDiscount: number) => void;
  onClear: () => void;
  /** Mais compacto (carrinho do notebook). */
  dense?: boolean;
}

export default function ItemDiscountEditor({ unitPrice, quantity, unitDiscount = 0, onApply, onClear, dense }: Props) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<DiscountKind>('percent');
  const [text, setText] = useState('');
  const [touched, setTouched] = useState(false);

  const has = unitDiscount > 0;
  const parsed = text.trim() ? discountFromInput(kind, text, unitPrice) : null;
  const error = touched && parsed && !parsed.ok ? parsed.message : '';

  const openEditor = () => { setText(''); setTouched(false); setOpen(true); };
  const close = () => { setOpen(false); setText(''); setTouched(false); };

  const apply = () => {
    setTouched(true);
    const r = discountFromInput(kind, text, unitPrice);
    if (!r.ok) return;
    onApply(r.unitDiscount);
    close();
  };

  if (!open) {
    if (!has) {
      return (
        <AppButton variant="text" size="sm" icon="pricetag-outline" label="Dar desconto" onPress={openEditor}
          style={dense ? styles.linkDense : styles.link} />
      );
    }
    const pct = percentLabel((unitDiscount / unitPrice) * 100);
    return (
      <View style={styles.appliedRow}>
        <Text style={[styles.applied, dense && styles.appliedDense]} numberOfLines={2}>
          {pct} de desconto: {formatCurrency(unitNet(unitPrice, unitDiscount))} {quantity > 1 ? 'cada' : ''}
          {quantity > 1 ? ` (${formatCurrency(lineNet(unitPrice, quantity, unitDiscount))})` : ''}
        </Text>
        <AppButton variant="text" size="sm" label="Mudar" onPress={openEditor} />
      </View>
    );
  }

  return (
    <View style={styles.editor}>
      <View style={styles.row}>
        <AppButton size="sm" label="%" variant={kind === 'percent' ? 'primary' : 'outlined'}
          onPress={() => { setKind('percent'); setTouched(false); }} />
        <AppButton size="sm" label="R$" variant={kind === 'value' ? 'primary' : 'outlined'}
          onPress={() => { setKind('value'); setTouched(false); }} />
        <TextInput
          value={text}
          onChangeText={(v) => { setText(v); setTouched(false); }}
          keyboardType="decimal-pad"
          autoFocus
          placeholder={kind === 'percent' ? '% por peça' : 'R$ por peça'}
          placeholderTextColor={Colors.light.textTertiary}
          style={styles.input}
          returnKeyType="done"
          onSubmitEditing={apply}
          accessibilityLabel={kind === 'percent' ? 'Desconto da peça em porcentagem' : 'Desconto da peça em reais por peça'}
        />
        <AppButton label="Aplicar desconto da peça" icon="checkmark" iconOnly size="sm" onPress={apply} />
        <AppButton label="Fechar" icon="close" iconOnly size="sm" variant="outlined" onPress={close} />
      </View>
      {parsed && parsed.ok ? (
        <Text style={styles.preview}>
          Fica {formatCurrency(unitNet(unitPrice, parsed.unitDiscount))} {quantity > 1 ? 'cada' : 'a peça'}
          {' · '}desconto de {formatCurrency(lineDiscount(parsed.unitDiscount, quantity))}
          {' '}({percentLabel(parsed.percent)})
        </Text>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {has ? <AppButton variant="text" size="sm" label="Tirar o desconto desta peça" onPress={() => { onClear(); close(); }} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  link: { alignSelf: 'flex-start' },
  linkDense: { alignSelf: 'flex-start', height: 28 },
  appliedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.xs },
  applied: { flex: 1, fontSize: theme.fontSize.xs, color: Colors.light.successDark },
  appliedDense: { fontSize: 11 },
  editor: { gap: 4, marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  input: {
    flex: 1,
    minWidth: 0,
    height: 36,
    fontSize: theme.fontSize.sm,
    backgroundColor: Colors.light.backgroundSecondary,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: Colors.light.border,
    paddingHorizontal: theme.spacing.sm,
    color: Colors.light.text,
  },
  preview: { fontSize: theme.fontSize.xs, color: Colors.light.successDark },
  error: { fontSize: theme.fontSize.xs, color: Colors.light.errorDark },
});
