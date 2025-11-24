import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Button } from 'react-native-paper';
import { Colors } from '@/constants/Colors';

interface ModalActionsProps {
  onCancel: () => void;
  onConfirm: () => void;
  cancelText?: string;
  confirmText?: string;
  loading?: boolean;
  disabled?: boolean;
  confirmColor?: string;
  cancelDisabled?: boolean;
}

export default function ModalActions({
  onCancel,
  onConfirm,
  cancelText = 'Cancelar',
  confirmText = 'Confirmar',
  loading = false,
  disabled = false,
  confirmColor = Colors.light.primary,
  cancelDisabled = false,
}: ModalActionsProps) {
  return (
    <View style={styles.container}>
      <Button
        mode="outlined"
        onPress={onCancel}
        style={styles.button}
        disabled={loading || cancelDisabled}
      >
        {cancelText}
      </Button>
      <Button
        mode="contained"
        onPress={onConfirm}
        style={styles.button}
        buttonColor={confirmColor}
        loading={loading}
        disabled={loading || disabled}
      >
        {confirmText}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  button: {
    flex: 1,
  },
});
