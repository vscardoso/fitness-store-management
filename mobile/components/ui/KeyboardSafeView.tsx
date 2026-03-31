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

interface Props {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
}

export default function KeyboardSafeView({ children, style }: Props) {
  return (
    <KeyboardAwareScreen
      style={style}
      contentContainerStyle={styles.content}
      bottomPadding={140}
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
