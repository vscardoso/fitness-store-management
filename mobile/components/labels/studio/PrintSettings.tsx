/** Passo 2 da tela de etiquetas: tamanho do adesivo e papel, os dois em lista de escolha (padrão do app). */
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import OptionListField, { type OptionItem } from '@/components/ui/OptionListField';
import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { cmText, parseCm, sizeDims, STICKER_SIZES, stickersPerSheet, type StickerSize, type TagLabelLayout } from '@/services/labelService';
import { sizeFrom } from './useLabelPrint';

interface Props {
  size: StickerSize;
  onSize: (s: StickerSize) => void;
  paper: TagLabelLayout;
  onPaper: (p: TagLabelLayout) => void;
  perA4: number;
  perThermal: number;
}

const CUSTOM = '__custom__';

export default function PrintSettings({ size, onSize, paper, onPaper, perA4, perThermal }: Props) {
  const brand = useBrandingColors();
  const styles = useMemo(() => makeStyles(brand.primary), [brand.primary]);
  const [editing, setEditing] = useState(false);
  const [wText, setWText] = useState('');
  const [hText, setHText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const sizes = [...STICKER_SIZES, ...(size.id === 'custom' ? [size] : [])];
  const sizeOptions: OptionItem<string>[] = [
    ...sizes.map((s) => ({
      value: s.id,
      label: `${s.name}${s.note ? ` (${s.note})` : ''}`,
      description: `${sizeDims(s.widthMm, s.heightMm)} · ${stickersPerSheet(s.widthMm, s.heightMm)} por folha A4`,
    })),
    { value: CUSTOM, label: 'Outro tamanho...', description: 'Digite a largura e a altura em centímetros', icon: 'resize-outline' as const },
  ];

  const paperOptions: OptionItem<TagLabelLayout>[] = [
    { value: 'sheet', label: 'Folha 10 × 15', description: perThermal > 0 ? `${perThermal} etiquetas por folha térmica, para cortar` : 'Esta etiqueta não cabe: use uma menor' },
    { value: 'a4', label: 'Folha A4', description: `${perA4} etiquetas por folha, com linha de corte` },
    { value: 'roll', label: 'Uma por página', description: 'Cada página é uma etiqueta (gráfica ou impressora de rolo)' },
  ];

  const pickSize = (id: string) => {
    if (id === CUSTOM) {
      setWText(cmText(size.widthMm));
      setHText(cmText(size.heightMm));
      setError(null);
      setEditing(true);
      return;
    }
    setEditing(false);
    const s = sizes.find((x) => x.id === id);
    if (s) onSize(s);
  };

  const applyCustom = () => {
    const w = parseCm(wText);
    const h = parseCm(hText);
    if (w == null || h == null) {
      setError('Digite largura e altura em centímetros, de 3 a 10 (ex.: 6 e 5, ou 6,5 e 5,5).');
      return;
    }
    onSize(sizeFrom(w, h));
    setEditing(false);
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>2. Como imprimir</Text>
      <OptionListField label="Tamanho do adesivo" value={size.id} options={sizeOptions} onChange={pickSize} sheetTitle="Tamanho do adesivo" icon="resize-outline" />
      {editing ? (
        <View style={styles.box}>
          <Text style={styles.muted}>Medida da etiqueta em centímetros (de 3 a 10). Largura é o lado de cima.</Text>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.inputLabel}>Largura (cm)</Text>
              <TextInput style={styles.input} value={wText} onChangeText={setWText} keyboardType="decimal-pad" placeholder="6" accessibilityLabel="Largura em centímetros" />
            </View>
            <Text style={styles.times}>×</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.inputLabel}>Altura (cm)</Text>
              <TextInput style={styles.input} value={hText} onChangeText={setHText} keyboardType="decimal-pad" placeholder="5" accessibilityLabel="Altura em centímetros" />
            </View>
          </View>
          {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
          <TouchableOpacity style={styles.useBtn} onPress={applyCustom} accessibilityRole="button">
            <Text style={styles.useText}>Usar esta medida</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      <OptionListField label="Papel" value={paper} options={paperOptions} onChange={onPaper} sheetTitle="Papel" icon="document-outline" />
    </View>
  );
}

const makeStyles = (primary: string) => StyleSheet.create({
  wrap: { gap: theme.spacing.sm },
  title: { fontSize: theme.fontSize.base, fontWeight: '800', color: Colors.light.text },
  muted: { fontSize: theme.fontSize.sm, color: Colors.light.textSecondary },
  box: { backgroundColor: Colors.light.card, borderRadius: theme.borderRadius.xl, borderWidth: 1, borderColor: Colors.light.border, padding: theme.spacing.md, gap: theme.spacing.md },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: theme.spacing.sm },
  inputLabel: { fontSize: theme.fontSize.xs, fontWeight: '700', color: Colors.light.textSecondary, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: Colors.light.border, borderRadius: theme.borderRadius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: Colors.light.text, backgroundColor: Colors.light.background },
  times: { fontSize: theme.fontSize.lg, fontWeight: '800', color: Colors.light.textSecondary, paddingBottom: 10 },
  error: { color: '#b91c1c', fontSize: theme.fontSize.sm },
  useBtn: { borderRadius: theme.borderRadius.xl, borderWidth: 1.5, borderColor: primary, paddingVertical: 13, alignItems: 'center' },
  useText: { color: primary, fontWeight: '800', fontSize: theme.fontSize.sm },
});
