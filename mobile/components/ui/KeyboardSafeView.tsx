/**
 * KeyboardSafeView
 * Substitui o <View style={styles.container}> raiz de telas que têm inputs.
 * Usa KeyboardAvoidingView com o behavior correto por plataforma.
 *
 * Uso:
 *   import KeyboardSafeView from '@/components/ui/KeyboardSafeView';
 *   <KeyboardSafeView style={styles.container}>...</KeyboardSafeView>
 */

import React from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, ViewStyle } from 'react-native';

interface Props {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
}

export default function KeyboardSafeView({ children, style }: Props) {
  return (
    <KeyboardAvoidingView
      style={[styles.root, style]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {children}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
