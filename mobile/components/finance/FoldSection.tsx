/**
 * Bloco recolhível das telas do Financeiro (fechamento, relatório mensal): o cabeçalho diz o nome e o número principal
 * (resumo), e o detalhe só aparece quando a pessoa abre. Serve para o resumo ficar no topo e a conta completa ficar à mão.
 */
import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Colors, theme } from '@/constants/Colors';

interface Props {
  title: string;
  /** Número ou frase curta que aparece no cabeçalho, com o bloco fechado ou aberto. */
  summary?: string;
  /** Cor do resumo quando é negativo (ex.: vermelho). */
  summaryColor?: string;
  defaultOpen?: boolean;
  testID?: string;
  children: React.ReactNode;
}

export default function FoldSection({ title, summary, summaryColor, defaultOpen = false, testID, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={styles.card} testID={testID}>
      <TouchableOpacity style={styles.head} onPress={() => setOpen((v) => !v)} activeOpacity={0.8}
        accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`${title}${summary ? `, ${summary}` : ''}`}>
        <Text style={styles.title} numberOfLines={2}>{title}</Text>
        {!!summary && <Text style={[styles.summary, !!summaryColor && { color: summaryColor }]}>{summary}</Text>}
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.light.textSecondary} />
      </TouchableOpacity>
      {open && <View style={styles.body}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: Colors.light.card, borderRadius: theme.borderRadius.xl, borderWidth: 1, borderColor: Colors.light.border, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  title: { flex: 1, fontSize: theme.fontSize.base, fontWeight: theme.fontWeight.extrabold, color: Colors.light.text },
  summary: { fontSize: theme.fontSize.base, fontWeight: theme.fontWeight.extrabold, color: Colors.light.text },
  body: { paddingHorizontal: 14, paddingBottom: 14, gap: 8 },
});
