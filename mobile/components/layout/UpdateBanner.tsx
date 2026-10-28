import React from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useAppUpdate } from '@/hooks/useAppUpdate';
import { useBrandingColors } from '@/store/brandingStore';

/** Aviso "Há uma versão nova": aparece só no app web quando existe versão nova publicada. */
export default function UpdateBanner() {
  const { updateAvailable, reload } = useAppUpdate();
  const brand = useBrandingColors();
  if (Platform.OS !== 'web' || !updateAvailable) return null;
  return (
    <View style={[styles.bar, { backgroundColor: brand.primary }]} accessibilityRole="alert">
      <Text style={styles.text}>Versão nova pronta. Continue o que está fazendo: ela entra sozinha quando você terminar esta tela.</Text>
      <TouchableOpacity style={styles.button} onPress={reload} activeOpacity={0.85}>
        <Text style={[styles.buttonText, { color: brand.primary }]}>Atualizar agora</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 96,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    zIndex: 9999,
    elevation: 12,
  },
  text: { flex: 1, color: '#fff', fontSize: 13, fontWeight: '600' },
  button: { backgroundColor: '#fff', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12 },
  buttonText: { fontSize: 13, fontWeight: '700' },
});
