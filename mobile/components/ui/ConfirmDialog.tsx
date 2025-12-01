/**
 * ConfirmDialog - Diálogo de confirmação melhorado
 *
 * Componente reutilizável para confirmações de ações importantes
 * com melhor UI/UX que o Alert.alert padrão.
 */

import React from 'react';
import { View, StyleSheet, ScrollView, Animated } from 'react-native';
import { Portal, Modal, Text, Button, Surface, IconButton } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';

export interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  type?: 'danger' | 'warning' | 'info' | 'success';
  details?: string[];
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
}

export default function ConfirmDialog({
  visible,
  title,
  message,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  onConfirm,
  onCancel,
  type = 'warning',
  details = [],
  icon,
  loading = false,
}: ConfirmDialogProps) {
  const getTypeConfig = () => {
    switch (type) {
      case 'danger':
        return {
          color: '#d32f2f',
          backgroundColor: '#ffebee',
          icon: icon || 'alert-circle',
          confirmButtonColor: '#d32f2f',
        };
      case 'warning':
        return {
          color: '#f57c00',
          backgroundColor: '#fff3e0',
          icon: icon || 'warning',
          confirmButtonColor: '#f57c00',
        };
      case 'info':
        return {
          color: Colors.light.primary,
          backgroundColor: '#e3f2fd',
          icon: icon || 'information-circle',
          confirmButtonColor: Colors.light.primary,
        };
      case 'success':
        return {
          color: '#388e3c',
          backgroundColor: '#e8f5e9',
          icon: icon || 'checkmark-circle',
          confirmButtonColor: '#388e3c',
        };
    }
  };

  const config = getTypeConfig();

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onCancel}
        contentContainerStyle={styles.modalContainer}
      >
        <Surface style={styles.dialog} elevation={3}>
          {/* Close button */}
          <IconButton
            icon="close"
            size={20}
            onPress={onCancel}
            style={styles.closeButton}
            disabled={loading}
          />

          {/* Icon */}
          <View style={[styles.iconContainer, { backgroundColor: config.backgroundColor }]}>
            <Ionicons name={config.icon as any} size={48} color={config.color} />
          </View>

          {/* Title */}
          <Text variant="headlineSmall" style={styles.title}>
            {title}
          </Text>

          {/* Message */}
          <Text variant="bodyMedium" style={styles.message}>
            {message}
          </Text>

          {/* Details list */}
          {details.length > 0 && (
            <ScrollView style={styles.detailsContainer}>
              <Surface style={styles.detailsSurface} elevation={0}>
                {details.map((detail, index) => (
                  <View key={index} style={styles.detailRow}>
                    <Ionicons
                      name="chevron-forward"
                      size={16}
                      color={config.color}
                      style={styles.detailIcon}
                    />
                    <Text variant="bodySmall" style={styles.detailText}>
                      {detail}
                    </Text>
                  </View>
                ))}
              </Surface>
            </ScrollView>
          )}

          {/* Actions */}
          <View style={[
            styles.actions,
            (!cancelText || cancelText.trim() === '') && styles.actionsCenter
          ]}>
            {cancelText && cancelText.trim() !== '' && (
              <Button
                mode="outlined"
                onPress={onCancel}
                style={styles.cancelButton}
                disabled={loading}
              >
                {cancelText}
              </Button>
            )}
            <Button
              mode="contained"
              onPress={onConfirm}
              style={[
                cancelText && cancelText.trim() !== '' ? styles.confirmButton : styles.confirmButtonFull,
                { backgroundColor: config.confirmButtonColor }
              ]}
              loading={loading}
              disabled={loading}
            >
              {confirmText}
            </Button>
          </View>
        </Surface>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  dialog: {
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingVertical: 32,
    paddingHorizontal: 24,
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 12,
  },
  closeButton: {
    position: 'absolute',
    right: 8,
    top: 8,
    zIndex: 1,
    margin: 0,
  },
  iconContainer: {
    width: 88,
    height: 88,
    borderRadius: 44,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  title: {
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
    color: Colors.light.text,
    fontSize: 22,
    lineHeight: 28,
  },
  message: {
    textAlign: 'center',
    color: Colors.light.textSecondary,
    marginBottom: 20,
    lineHeight: 24,
    fontSize: 15,
    paddingHorizontal: 8,
  },
  detailsContainer: {
    maxHeight: 200,
    marginBottom: 24,
  },
  detailsSurface: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.06)',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  detailIcon: {
    marginRight: 10,
    marginTop: 3,
  },
  detailText: {
    flex: 1,
    color: Colors.light.text,
    lineHeight: 22,
    fontSize: 14,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  actionsCenter: {
    justifyContent: 'center',
  },
  cancelButton: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  confirmButton: {
    flex: 1,
    borderRadius: 12,
    elevation: 2,
  },
  confirmButtonFull: {
    borderRadius: 12,
    elevation: 2,
    alignSelf: 'center',
    minWidth: '70%',
    height: 48,
    justifyContent: 'center',
  },
});
