/**
 * WelcomeTutorialModal
 * Modal de boas-vindas que aparece no primeiro acesso
 * Oferece ao usuário a opção de fazer o tour pelo app
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
  Dimensions,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '@/constants/Colors';
import { TUTORIAL_COLORS } from '@/constants/tutorials';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface WelcomeTutorialModalProps {
  visible: boolean;
  onStartTutorial: () => void;
  onDismiss: () => void;
  userName?: string;
}

export function WelcomeTutorialModal({
  visible,
  onStartTutorial,
  onDismiss,
  userName,
}: WelcomeTutorialModalProps) {
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 8,
          tension: 40,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      scaleAnim.setValue(0.9);
      opacityAnim.setValue(0);
    }
  }, [visible]);

  const handleStartTutorial = () => {
    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: 0.9,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onStartTutorial();
    });
  };

  const handleDismiss = () => {
    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: 0.9,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onDismiss();
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <Animated.View
          style={[
            styles.container,
            {
              opacity: opacityAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          {/* Header com gradiente */}
          <LinearGradient
            colors={[Colors.light.primary, Colors.light.secondary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.header}
          >
            <View style={styles.iconContainer}>
              <Ionicons name="rocket" size={48} color="#fff" />
            </View>
            <Text style={styles.welcomeText}>
              Bem-vindo{userName ? `, ${userName}` : ''}!
            </Text>
          </LinearGradient>

          {/* Conteúdo */}
          <View style={styles.content}>
            <Text style={styles.title}>Pronto para começar?</Text>
            <Text style={styles.description}>
              Preparamos um tour rápido pelo app para você conhecer todas as funcionalidades e aproveitar ao máximo o sistema.
            </Text>

            {/* Features highlight */}
            <View style={styles.features}>
              <FeatureItem
                icon="cart"
                color="#10B981"
                text="Vendas rápidas e intuitivas"
              />
              <FeatureItem
                icon="cube"
                color="#8B5CF6"
                text="Controle total do estoque"
              />
              <FeatureItem
                icon="people"
                color="#3B82F6"
                text="Gestão de clientes"
              />
              <FeatureItem
                icon="bar-chart"
                color="#F59E0B"
                text="Relatórios e insights"
              />
            </View>

            {/* Botões */}
            <View style={styles.buttons}>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={handleStartTutorial}
                activeOpacity={0.8}
              >
                <Text style={styles.primaryButtonText}>Sim, me mostre!</Text>
                <Ionicons name="arrow-forward" size={18} color="#fff" />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={handleDismiss}
                activeOpacity={0.7}
              >
                <Text style={styles.secondaryButtonText}>Talvez depois</Text>
              </TouchableOpacity>
            </View>

            {/* Dica */}
            <View style={styles.hint}>
              <Ionicons name="information-circle" size={16} color="#9CA3AF" />
              <Text style={styles.hintText}>
                Você pode acessar o tutorial a qualquer momento pelo botão ? no topo das telas
              </Text>
            </View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

// Componente auxiliar para items de feature
function FeatureItem({
  icon,
  color,
  text,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  text: string;
}) {
  return (
    <View style={styles.featureItem}>
      <View style={[styles.featureIcon, { backgroundColor: color + '15' }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={styles.featureText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  container: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#fff',
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 15,
  },
  header: {
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  welcomeText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
  },
  content: {
    padding: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: TUTORIAL_COLORS.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    color: TUTORIAL_COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
  },
  features: {
    marginBottom: 24,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  featureIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  featureText: {
    fontSize: 14,
    color: TUTORIAL_COLORS.text,
    fontWeight: '500',
  },
  buttons: {
    gap: 12,
    marginBottom: 20,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TUTORIAL_COLORS.accent,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    gap: 8,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  secondaryButtonText: {
    color: '#9CA3AF',
    fontSize: 14,
    fontWeight: '500',
  },
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    padding: 12,
    borderRadius: 10,
    gap: 8,
  },
  hintText: {
    flex: 1,
    fontSize: 12,
    color: '#9CA3AF',
    lineHeight: 16,
  },
});

export default WelcomeTutorialModal;
