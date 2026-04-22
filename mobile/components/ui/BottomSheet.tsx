/**
 * BottomSheet — Modal deslizante de baixo para cima
 *
 * Uso ideal para formulários com múltiplos campos.
 * Diferenças vs CustomModal:
 *  - Sobe da base da tela (animationType="slide")
 *  - Rounded apenas nos cantos superiores
 *  - Header com faixa colorida + ícone opcional
 *  - Botões de ação fixos fora do scroll (nunca somem)
 *  - KeyboardAvoidingView correto para iOS e Android
 *  - Handle indicador de arraste no topo
 */

import React, { useEffect, useRef } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';

interface BottomSheetAction {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
}

interface BottomSheetProps {
  visible: boolean;
  onDismiss: () => void;
  title: string;
  subtitle?: string;
  /** Nome do ícone Ionicons exibido no header */
  icon?: keyof typeof Ionicons.glyphMap;
  /** Ações exibidas na barra fixa de rodapé */
  actions?: BottomSheetAction[];
  children: React.ReactNode;
  /** Fechar ao tocar no backdrop (padrão: true) */
  dismissOnBackdrop?: boolean;
}

function ActionLoading({ color }: { color: string }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: 1100,
        useNativeDriver: true,
      })
    );

    loop.start();
    return () => loop.stop();
  }, [progress]);

  return (
    <View style={styles.loadingWrap}>
      <ActivityIndicator size="small" color={color} />
      <Text style={[styles.loadingText, { color }]}>Processando</Text>
      <View style={styles.loadingDotsRow}>
        {[0, 1, 2].map((index) => {
          const delay = index * 0.2;
          const opacity = progress.interpolate({
            inputRange: [delay, Math.min(delay + 0.25, 1), Math.min(delay + 0.5, 1), 1],
            outputRange: [0.35, 1, 0.35, 0.35],
            extrapolate: 'clamp',
          });

          const translateY = progress.interpolate({
            inputRange: [delay, Math.min(delay + 0.25, 1), Math.min(delay + 0.5, 1), 1],
            outputRange: [0, -2, 0, 0],
            extrapolate: 'clamp',
          });

          return (
            <Animated.View
              key={index}
              style={[
                styles.loadingDot,
                {
                  backgroundColor: color,
                  opacity,
                  transform: [{ translateY }],
                },
              ]}
            />
          );
        })}
      </View>
    </View>
  );
}

export default function BottomSheet({
  visible,
  onDismiss,
  title,
  subtitle,
  icon,
  actions = [],
  children,
  dismissOnBackdrop = true,
}: BottomSheetProps) {
  const insets = useSafeAreaInsets();
  const brandingColors = useBrandingColors();

  const getActionStyle = (variant: BottomSheetAction['variant'] = 'primary') => {
    switch (variant) {
      case 'secondary': return styles.actionSecondary;
      case 'danger':    return styles.actionDanger;
      default:          return null;
    }
  };

  const getActionTextStyle = (variant: BottomSheetAction['variant'] = 'primary') => {
    switch (variant) {
      case 'secondary': return styles.actionTextSecondary;
      case 'danger':    return styles.actionTextDanger;
      default:          return null;
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      {/* Backdrop */}
      <TouchableWithoutFeedback onPress={dismissOnBackdrop ? onDismiss : undefined}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.kavContainer}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
      >
        <View style={[styles.sheet, { paddingBottom: insets.bottom }]}>

          {/* Header com gradiente — cobre os cantos arredondados do sheet */}
          <LinearGradient
            colors={[brandingColors.primary, brandingColors.secondary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.header}
          >
            {/* Handle dentro do gradiente (branco translúcido) */}
            <View style={styles.handleContainer}>
              <View style={styles.handle} />
            </View>

            {/* Linha de conteúdo: ícone + textos + botão fechar */}
            <View style={styles.headerRow}>
              <View style={styles.headerLeft}>
                {icon && (
                  <View style={styles.headerIconWrap}>
                    <Ionicons name={icon} size={20} color="#fff" />
                  </View>
                )}
                <View style={styles.headerText}>
                  <Text style={styles.headerTitle}>{title}</Text>
                  {subtitle && (
                    <Text style={styles.headerSubtitle} numberOfLines={1}>{subtitle}</Text>
                  )}
                </View>
              </View>

              <TouchableOpacity onPress={onDismiss} style={styles.closeBtn} hitSlop={12}>
                <Ionicons name="close" size={20} color="rgba(255,255,255,0.9)" />
              </TouchableOpacity>
            </View>
          </LinearGradient>

          {/* Conteúdo scrollável */}
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>

          {/* Barra de ações fixa */}
          {actions.length > 0 && (
            <View style={styles.actionsBar}>
              {actions.map((action, i) => (
                <TouchableOpacity
                  key={i}
                  onPress={action.onPress}
                  disabled={action.disabled || action.loading}
                  activeOpacity={0.75}
                  style={[
                    styles.actionBtn,
                    { backgroundColor: brandingColors.primary },
                    getActionStyle(action.variant),
                    (action.disabled || action.loading) && styles.actionDisabled,
                    actions.length === 1 && styles.actionFull,
                  ]}
                >
                  {action.loading ? (
                    action.variant === 'secondary' ? (
                      <ActionLoading color={brandingColors.primary} />
                    ) : (
                      <LinearGradient
                        colors={[
                          'rgba(255,255,255,0.08)',
                          'rgba(255,255,255,0.18)',
                          'rgba(255,255,255,0.08)',
                        ]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.loadingGradientSurface}
                      >
                        <ActionLoading color="#fff" />
                      </LinearGradient>
                    )
                  ) : (
                    <>
                      {action.icon && (
                        <Ionicons
                          name={action.icon}
                          size={16}
                          color={action.variant === 'secondary' ? brandingColors.primary : '#fff'}
                        />
                      )}
                      <Text
                        style={[
                          styles.actionText,
                          getActionTextStyle(action.variant),
                          { color: action.variant === 'secondary' ? brandingColors.primary : '#fff' },
                        ]}
                      >
                        {action.label}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  kavContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.light.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 16,
  },
  handleContainer: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 8,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  header: {
    flexDirection: 'column',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 12,
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    fontSize: theme.fontSize.base,
    fontWeight: '700',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: theme.fontSize.sm,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 1,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flexShrink: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 8,
  },
  actionsBar: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
    backgroundColor: Colors.light.card,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 13,
    borderRadius: theme.borderRadius.xl,
  },
  actionFull: {
    flex: 1,
  },
  actionSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: Colors.light.border,
  },
  actionDanger: {
    backgroundColor: Colors.light.error ?? '#EF4444',
  },
  actionDisabled: {
    opacity: 0.45,
  },
  actionText: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: '#fff',
  },
  actionTextSecondary: {
    color: Colors.light.text,
  },
  actionTextDanger: {
    color: '#fff',
  },
  loadingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  loadingText: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  loadingDotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  loadingDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  loadingGradientSurface: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.borderRadius.xl,
  },
});
