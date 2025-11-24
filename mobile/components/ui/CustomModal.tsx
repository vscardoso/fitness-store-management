import React from 'react';
import {
  Modal,
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  ScrollView,
} from 'react-native';
import { Text, IconButton } from 'react-native-paper';
import { Colors } from '@/constants/Colors';

interface CustomModalProps {
  visible: boolean;
  onDismiss: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  showCloseButton?: boolean;
  dismissOnBackdropPress?: boolean;
  maxHeight?: number;
}

export default function CustomModal({
  visible,
  onDismiss,
  title,
  subtitle,
  children,
  showCloseButton = true,
  dismissOnBackdropPress = true,
  maxHeight,
}: CustomModalProps) {
  const handleBackdropPress = () => {
    if (dismissOnBackdropPress) {
      onDismiss();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={handleBackdropPress}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <View style={[styles.container, maxHeight ? { maxHeight } : null]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text variant="titleLarge" style={styles.title}>
                {title}
              </Text>
              {subtitle && (
                <Text variant="bodyMedium" style={styles.subtitle}>
                  {subtitle}
                </Text>
              )}
            </View>
            {showCloseButton && (
              <IconButton
                icon="close"
                size={24}
                onPress={onDismiss}
                style={styles.closeButton}
              />
            )}
          </View>

          {/* Content */}
          <ScrollView
            style={styles.content}
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  container: {
    backgroundColor: '#fff',
    borderRadius: 16,
    width: '90%',
    maxWidth: 500,
    maxHeight: '80%',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontWeight: 'bold',
    color: '#000',
  },
  subtitle: {
    marginTop: 4,
    color: '#666',
  },
  closeButton: {
    margin: 0,
  },
  content: {
    maxHeight: 400,
  },
  contentContainer: {
    padding: 20,
  },
});
