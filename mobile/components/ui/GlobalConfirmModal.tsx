import React, { useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { Modal, Portal, Text, Button } from 'react-native-paper';
import { Colors, theme } from '@/constants/Colors';

type AlertButton = {
  text?: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
};

type AlertPayload = {
  title: string;
  message?: string;
  buttons?: AlertButton[];
};

type AlertListener = (payload: AlertPayload) => void;

let alertListener: AlertListener | null = null;
let originalAlertImpl: typeof Alert.alert | null = null;
let isOverrideInstalled = false;

function emitGlobalAlert(payload: AlertPayload) {
  if (alertListener) {
    alertListener(payload);
    return;
  }

  if (originalAlertImpl) {
    originalAlertImpl(payload.title, payload.message, payload.buttons as any);
  }
}

export function installGlobalAlertOverride() {
  if (isOverrideInstalled) return;

  originalAlertImpl = Alert.alert.bind(Alert);
  Alert.alert = ((title: string, message?: string, buttons?: AlertButton[]) => {
    emitGlobalAlert({ title, message, buttons });
  }) as typeof Alert.alert;

  isOverrideInstalled = true;
}

function buttonColor(style?: AlertButton['style']) {
  if (style === 'destructive') return Colors.light.error;
  return Colors.light.primary;
}

export default function GlobalConfirmModalHost() {
  const [payload, setPayload] = useState<AlertPayload | null>(null);

  useEffect(() => {
    alertListener = (nextPayload: AlertPayload) => {
      setPayload(nextPayload);
    };

    return () => {
      alertListener = null;
    };
  }, []);

  const actions = useMemo(() => {
    const fallback: AlertButton[] = [{ text: 'OK', style: 'default' }];
    return payload?.buttons && payload.buttons.length > 0 ? payload.buttons : fallback;
  }, [payload]);

  const close = () => setPayload(null);

  return (
    <Portal>
      <Modal
        visible={!!payload}
        onDismiss={close}
        contentContainerStyle={styles.modalContainer}
      >
        <View style={styles.card}>
          <Text variant="titleMedium" style={styles.title}>
            {payload?.title}
          </Text>

          {!!payload?.message && (
            <Text variant="bodyMedium" style={styles.message}>
              {payload.message}
            </Text>
          )}

          <View style={styles.actions}>
            {actions.map((action, index) => (
              <Button
                key={`${action.text ?? 'btn'}-${index}`}
                mode={action.style === 'cancel' ? 'outlined' : 'contained'}
                buttonColor={action.style === 'cancel' ? Colors.light.card : buttonColor(action.style)}
                textColor={action.style === 'cancel' ? Colors.light.text : '#fff'}
                style={styles.button}
                onPress={() => {
                  close();
                  action.onPress?.();
                }}
              >
                {action.text ?? 'OK'}
              </Button>
            ))}
          </View>
        </View>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    marginHorizontal: theme.spacing.lg,
  },
  card: {
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    ...theme.shadows.md,
  },
  title: {
    color: Colors.light.text,
    fontWeight: '700',
  },
  message: {
    color: Colors.light.textSecondary,
    lineHeight: 20,
  },
  actions: {
    gap: theme.spacing.sm,
  },
  button: {
    borderRadius: theme.borderRadius.lg,
  },
});
