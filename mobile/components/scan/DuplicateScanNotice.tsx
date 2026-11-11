/** Aviso "peça duplicada" abaixo da barra de bipe: não conta até a pessoa confirmar que é outra peça igual. */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import AppButton from '@/components/ui/AppButton';
import { Colors, theme } from '@/constants/Colors';
import type { DuplicateScan } from '@/hooks/useDuplicateScan';

export default function DuplicateScanNotice({ dup }: { dup: DuplicateScan }) {
  if (!dup.pending) return null;
  return (
    <View style={styles.box} accessibilityLiveRegion="assertive" accessibilityRole="alert">
      <View style={styles.head}>
        <Ionicons name="copy-outline" size={18} color={Colors.light.warningDarker} />
        <Text style={styles.text}>{dup.pending.message}</Text>
      </View>
      <View style={styles.actions}>
        <AppButton variant="primary" size="md" label="Não contar" onPress={dup.dismiss} />
        <AppButton variant="outlined" size="md" label="É outra peça: contar mais uma" onPress={dup.confirm} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: Colors.light.warningLight, borderRadius: 12, padding: 12, gap: 10, borderWidth: 1, borderColor: Colors.light.warningDark },
  head: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  text: { flex: 1, fontSize: 13, fontWeight: theme.fontWeight.bold, color: Colors.light.warningDarker },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
