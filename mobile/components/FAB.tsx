import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Animated,
  Dimensions,
  Pressable,
} from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Colors, theme } from '@/constants/Colors';

const { width } = Dimensions.get('window');

interface QuickAction {
  id: string;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  colors: [string, string];
  route: string;
}

export default function FAB() {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [scaleAnim] = useState(new Animated.Value(0));
  const [rotateAnim] = useState(new Animated.Value(0));

  const quickActions: QuickAction[] = [
    {
      id: 'new-sale',
      title: 'Nova Venda',
      subtitle: 'Registrar venda no PDV',
      icon: 'cart',
      colors: ['#11998e', '#38ef7d'],
      route: '/(tabs)/sale',
    },
    {
      id: 'new-customer',
      title: 'Novo Cliente',
      subtitle: 'Cadastrar cliente',
      icon: 'person-add',
      colors: ['#667eea', '#764ba2'],
      route: '/customers/add',
    },
    {
      id: 'new-product',
      title: 'Novo Produto',
      subtitle: 'Adicionar ao catálogo',
      icon: 'cube',
      colors: ['#4776e6', '#8e54e9'],
      route: '/products/add',
    },
    {
      id: 'new-entry',
      title: 'Nova Entrada',
      subtitle: 'Registrar compra',
      icon: 'layers',
      colors: ['#f093fb', '#f5576c'],
      route: '/entries/add',
    },
    {
      id: 'new-trip',
      title: 'Nova Viagem',
      subtitle: 'Planejar viagem',
      icon: 'car',
      colors: ['#fa709a', '#fee140'],
      route: '/trips/add',
    },
  ];

  const openModal = () => {
    setVisible(true);
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const closeModal = () => {
    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(rotateAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => setVisible(false));
  };

  const handleActionPress = (route: string) => {
    closeModal();
    setTimeout(() => {
      router.push(route as any);
    }, 300);
  };

  const rotation = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '45deg'],
  });

  return (
    <>
      {/* Botão FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={openModal}
        activeOpacity={0.8}
      >
        <LinearGradient
          colors={[Colors.light.primary, Colors.light.secondary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fabGradient}
        >
          <Animated.View style={{ transform: [{ rotate: rotation }] }}>
            <Ionicons name="add" size={32} color="#fff" />
          </Animated.View>
        </LinearGradient>
      </TouchableOpacity>

      {/* Modal de Ações */}
      <Modal
        visible={visible}
        transparent
        animationType="none"
        onRequestClose={closeModal}
        statusBarTranslucent
      >
        <Pressable style={styles.modalOverlay} onPress={closeModal}>
          <Animated.View
            style={[
              styles.modalContent,
              {
                transform: [{ scale: scaleAnim }],
                opacity: scaleAnim,
              },
            ]}
          >
            <Pressable onPress={(e) => e.stopPropagation()}>
              {/* Header */}
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>Ações Rápidas</Text>
                  <Text style={styles.modalSubtitle}>Escolha uma operação</Text>
                </View>
                <TouchableOpacity onPress={closeModal} style={styles.closeButton}>
                  <Ionicons name="close" size={24} color={Colors.light.textSecondary} />
                </TouchableOpacity>
              </View>

              {/* Actions Grid */}
              <View style={styles.actionsGrid}>
                {quickActions.map((action) => (
                  <TouchableOpacity
                    key={action.id}
                    style={styles.actionCard}
                    onPress={() => handleActionPress(action.route)}
                    activeOpacity={0.7}
                  >
                    <LinearGradient
                      colors={action.colors}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.actionGradient}
                    >
                      <View style={styles.actionIconContainer}>
                        <Ionicons name={action.icon} size={32} color="#fff" />
                      </View>
                      <Text style={styles.actionTitle}>{action.title}</Text>
                      <Text style={styles.actionSubtitle}>{action.subtitle}</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Footer */}
              <Text style={styles.modalFooter}>Toque fora para fechar</Text>
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: 90,
    right: 20,
    width: 64,
    height: 64,
    borderRadius: 32,
    elevation: 8,
    shadowColor: Colors.light.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    zIndex: 1000,
  },
  fabGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: theme.borderRadius.xxl,
    width: '100%',
    maxWidth: 400,
    padding: theme.spacing.xl,
    elevation: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
  },

  // Header
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.xl,
  },
  modalTitle: {
    fontSize: theme.fontSize.xxl,
    fontWeight: '700',
    color: Colors.light.text,
    marginBottom: theme.spacing.xs,
  },
  modalSubtitle: {
    fontSize: theme.fontSize.md,
    color: Colors.light.textSecondary,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: theme.borderRadius.full,
    backgroundColor: Colors.light.backgroundSecondary,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Actions Grid
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  actionCard: {
    width: (width - theme.spacing.lg * 2 - theme.spacing.xl * 2 - theme.spacing.md) / 2,
    aspectRatio: 1,
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    elevation: 4,
  },
  actionGradient: {
    flex: 1,
    padding: theme.spacing.md,
    justifyContent: 'space-between',
  },
  actionIconContainer: {
    width: 56,
    height: 56,
    borderRadius: theme.borderRadius.xl,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  actionTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 2,
  },
  actionSubtitle: {
    fontSize: theme.fontSize.xs,
    color: '#fff',
    opacity: 0.9,
  },

  // Footer
  modalFooter: {
    textAlign: 'center',
    fontSize: theme.fontSize.sm,
    color: Colors.light.textTertiary,
  },
});
