import { Colors } from '@/constants/Colors';
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
      <Text style={styles.text}>Versão nova do app. Toque em Atualizar: o que você já contou ou salvou continua.</Text>
      <TouchableOpacity style={styles.button} onPress={reload} activeOpacity={0.85}>
        <Text style={[styles.buttonText, { color: brand.primary }]}>Atualizar</Text>
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
  text: { flex: 1, color: Colors.light.white, fontSize: 13, fontWeight: '600' },
  button: { backgroundColor: Colors.light.white, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12 },
  buttonText: { fontSize: 13, fontWeight: '700' },
});
