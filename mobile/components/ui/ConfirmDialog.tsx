/**
 * ConfirmDialog - Diálogo de confirmação melhorado
 *
 * Componente reutilizável para confirmações de ações importantes
 * com melhor UI/UX que o Alert.alert padrão.
 */

import React from 'react';
import { View, StyleSheet, ScrollView, Animated, Platform } from 'react-native';
import { Portal, Modal, Text, Button, Surface, IconButton } from 'react-native-paper';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { useDesktopDialogStyle } from '@/hooks/useLayout';
import WebDialogLayer from '@/components/ui/WebDialogLayer';
import { MagnifierLoader } from '@/components/ui/MagnifierLoader';

export interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel?: () => void;
  /** Fechar pelo X ou clicando fora. Padrão: onCancel. Use quando o botão de cancelar faz outra coisa (ex.: "Excluir foto"). */
  onDismiss?: () => void;
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
  onCancel = () => {},
  onDismiss,
  type = 'warning',
  details = [],
  icon,
  loading = false,
}: ConfirmDialogProps) {
  const brand = useBrandingColors();
  const dialogDesktop = useDesktopDialogStyle();
  const isWeb = Platform.OS === 'web';
  const getTypeConfig = () => {
    switch (type) {
      case 'danger':
        return {
          color: Colors.light.error,
          backgroundColor: Colors.light.errorLight,
          icon: icon || 'alert-circle',
          confirmButtonColor: Colors.light.error,
        };
      case 'warning':
        return {
          color: Colors.light.warning,
          backgroundColor: Colors.light.warningLight,
          icon: icon || 'warning',
          confirmButtonColor: Colors.light.warning,
        };
      case 'info':
        return {
          // informativo usa a cor da loja (azul solto destoava do resto do app)
          color: brand.primary,
          backgroundColor: brand.primary + '18',
          icon: icon || 'information-circle',
          confirmButtonColor: brand.primary,
        };
      case 'success':
        return {
          color: Colors.light.success,
          backgroundColor: Colors.light.successLight,
          icon: icon || 'checkmark-circle',
          confirmButtonColor: Colors.light.success,
        };
    }
  };

  const config = getTypeConfig();

  const dismiss = onDismiss ?? onCancel;
  const card = (
        <Surface style={styles.dialog} elevation={3}>
          {/* Close button */}
          <IconButton
            icon="close"
            size={20}
            onPress={onDismiss ?? onCancel}
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
            {!!cancelText && cancelText.trim() !== '' && (
              <Button
                mode="outlined"
                onPress={onCancel}
                style={styles.cancelButton}
                textColor={Colors.light.textSecondary}
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
              textColor={Colors.light.white}
              loading={loading && !isWeb}
              disabled={loading}
            >
              {confirmText}
            </Button>
          </View>

          {/* Na web a janela é do navegador e fica por cima do carregamento global: o logo aparece aqui dentro */}
          {loading && isWeb && (
            <View style={styles.loadingVeil} pointerEvents="auto">
              <MagnifierLoader size={96} alwaysShow />
            </View>
          )}
        </Surface>
  );

  // Web: janela própria do navegador, sempre POR CIMA de qualquer folha ou janela aberta atrás (a versão com o Portal do
  // Paper ficava presa dentro da folha de baixo e saía cortada no notebook).
  if (Platform.OS === 'web') {
    return <WebDialogLayer visible={visible} onDismiss={dismiss}>{card}</WebDialogLayer>;
  }

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={dismiss}
        contentContainerStyle={[styles.modalContainer, dialogDesktop]}
      >
        {card}
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
    backgroundColor: Colors.light.white,
    borderRadius: theme.borderRadius.xxl,
    paddingVertical: theme.spacing.xl,
    paddingHorizontal: theme.spacing.lg,
    position: 'relative',
    shadowColor: Colors.light.black,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: theme.elevation.xl,
  },
  loadingVeil: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: theme.borderRadius.xxl,
    backgroundColor: 'rgba(255, 255, 255, 0.82)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
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
    borderRadius: theme.borderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: theme.spacing.md,
    ...theme.shadows.md,
  },
  title: {
    fontWeight: theme.fontWeight.bold,
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
    color: Colors.light.text,
    fontSize: theme.fontSize.xxl,
    lineHeight: 30,
  },
  message: {
    textAlign: 'center',
    color: Colors.light.textSecondary,
    marginBottom: theme.spacing.md,
    lineHeight: 24,
    fontSize: theme.fontSize.base,
    paddingHorizontal: theme.spacing.sm,
  },
  detailsContainer: {
    maxHeight: 200,
    marginBottom: 24,
  },
  detailsSurface: {
    backgroundColor: Colors.light.backgroundSecondary,
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
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.card,
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
