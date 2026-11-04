/**
 * KeyboardSafeView
 * Substitui o <View style={styles.container}> raiz de telas que têm inputs.
 * Wrapper de compatibilidade que delega para KeyboardAwareScreen.
 * Mantido para evitar quebrar imports legados.
 *
 * Uso:
 *   import KeyboardSafeView from '@/components/ui/KeyboardSafeView';
 *   <KeyboardSafeView style={styles.container}>...</KeyboardSafeView>
 */

import React from 'react';
import { StyleSheet, ViewStyle } from 'react-native';
import KeyboardAwareScreen from '@/components/ui/KeyboardAwareScreen';
import { useIsDesktop } from '@/hooks/useLayout';

interface Props {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
}

export default function KeyboardSafeView({ children, style }: Props) {
  // 140 px é o espaço da barra de abas do celular; no notebook não há barra embaixo
  const isDesktop = useIsDesktop();
  return (
    <KeyboardAwareScreen
      style={style}
      contentContainerStyle={styles.content}
      bottomPadding={isDesktop ? 0 : 140}
    >
      {children}
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
  },
});
