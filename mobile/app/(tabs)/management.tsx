import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useFocusEffect } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import { useQuery } from '@tanstack/react-query';
import { getLowStockProducts } from '@/services/productService';
import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import PageHeader from '@/components/layout/PageHeader';
import { useAuth } from '@/hooks/useAuth';

const { width } = Dimensions.get('window');

interface ManagementModule {
  id: string;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  colors: [string, string];
  route: string;
  badge?: number;
}

export default function ManagementScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const brandingColors = useBrandingColors();
  const [refreshing, setRefreshing] = useState(false);

  // ── Animação de entrada ──
  const headerOpacity  = useSharedValue(0);
  const headerScale    = useSharedValue(0.94);
  const contentOpacity = useSharedValue(0);
  const contentTransY  = useSharedValue(24);

  useFocusEffect(
    useCallback(() => {
      headerOpacity.value  = 0;
      headerScale.value    = 0.94;
      contentOpacity.value = 0;
      contentTransY.value  = 24;

      headerOpacity.value = withTiming(1, { duration: 380, easing: Easing.out(Easing.quad) });
      headerScale.value   = withSpring(1, { damping: 16, stiffness: 200 });
      const t = setTimeout(() => {
        contentOpacity.value = withTiming(1, { duration: 340 });
        contentTransY.value  = withSpring(0, { damping: 18, stiffness: 200 });
      }, 140);
      return () => clearTimeout(t);
    }, [])
  );

  const headerAnimStyle  = useAnimatedStyle(() => ({
    opacity: headerOpacity.value,
    transform: [{ scale: headerScale.value }],
  }));
  const contentAnimStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ translateY: contentTransY.value }],
  }));

  // Query para badge de low-stock
  const { data: lowStockProducts, refetch } = useQuery({
    queryKey: ['low-stock'],
    queryFn: () => getLowStockProducts(),
    enabled: !!user,
  });

  const lowStockCount = lowStockProducts?.length || 0;

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  // Módulos de Operações
  const operationsModules: ManagementModule[] = [
    {
      id: 'products',
      title: 'Produtos',
      subtitle: 'Catálogo completo',
      icon: 'cube',
      colors: [brandingColors.primary, brandingColors.secondary],
      route: '/(tabs)/products',
      badge: lowStockCount > 0 ? lowStockCount : undefined,
    },
    {
      id: 'customers',
      title: 'Clientes',
      subtitle: 'Gestão de clientes',
      icon: 'people',
      colors: ['#30cfd0', '#330867'],
      route: '/(tabs)/customers',
    },
    {
      id: 'inventory',
      title: 'Inventário',
      subtitle: 'Controle de estoque',
      icon: 'layers',
      colors: ['#4776e6', '#8e54e9'],
      route: '/(tabs)/inventory',
    },
  ];

  // Módulos de Controle
  const controlModules: ManagementModule[] = [
    {
      id: 'entries',
      title: 'Entradas',
      subtitle: 'Compras e recebimentos',
      icon: 'download',
      colors: ['#f093fb', '#f5576c'],
      route: '/(tabs)/entries',
    },
    {
      id: 'trips',
      title: 'Viagens',
      subtitle: 'Compras em viagem',
      icon: 'airplane',
      colors: ['#fa709a', '#fee140'],
      route: '/trips',
    },
    {
      id: 'categories',
      title: 'Categorias',
      subtitle: 'Organizar produtos',
      icon: 'pricetags',
      colors: ['#a8edea', '#fed6e3'],
      route: '/(tabs)/categories',
    },
  ];

  // Renderizar card de módulo
  const ModuleCard = ({ module }: { module: ManagementModule }) => (
    <TouchableOpacity
      style={styles.moduleCard}
      onPress={() => router.push(module.route as any)}
      activeOpacity={0.7}
    >
      <View style={styles.moduleCardInner}>
        <LinearGradient
          colors={module.colors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.moduleGradient}
        >
          {/* Badge */}
          {module.badge && (
            <View style={styles.moduleBadge}>
              <Text style={styles.moduleBadgeText}>{module.badge}</Text>
            </View>
          )}

          {/* Icon */}
          <View style={styles.moduleIconContainer}>
            <Ionicons name={module.icon} size={32} color="#fff" />
          </View>

          {/* Content */}
          <View style={styles.moduleContent}>
            <Text style={styles.moduleTitle}>{module.title}</Text>
            <Text style={styles.moduleSubtitle}>{module.subtitle}</Text>
          </View>

          {/* Arrow */}
          <View style={styles.moduleArrow}>
            <Ionicons name="chevron-forward" size={24} color="#fff" />
          </View>
        </LinearGradient>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* ── Header animado ── */}
      <Animated.View style={headerAnimStyle}>
        <PageHeader
          title="Gestão"
          subtitle={user?.store_name || 'Fitness Store Management'}
        />
      </Animated.View>

      <Animated.View style={[{ flex: 1 }, contentAnimStyle]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[brandingColors.primary]}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Seção: Operações */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons
              name="briefcase"
              size={20}
              color={brandingColors.primary}
            />
            <Text style={styles.sectionTitle}>Operações</Text>
          </View>
          <View style={styles.modulesGrid}>
            {operationsModules.map((module) => (
              <ModuleCard key={module.id} module={module} />
            ))}
          </View>
        </View>

        {/* Seção: Controle */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="settings" size={20} color={brandingColors.primary} />
            <Text style={styles.sectionTitle}>Controle</Text>
          </View>
          <View style={styles.modulesGrid}>
            {controlModules.map((module) => (
              <ModuleCard key={module.id} module={module} />
            ))}
          </View>
        </View>

        {/* Espaçamento */}
        <View style={styles.bottomSpacing} />
      </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.backgroundSecondary,
  },

  // Content
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
  },

  // Section
  section: {
    marginBottom: theme.spacing.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  sectionTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    color: Colors.light.text,
  },

  // Modules Grid
  modulesGrid: {
    gap: theme.spacing.sm + 2,
  },
  moduleCard: {
    width: '100%',
  },
  moduleCardInner: {
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    ...theme.shadows.md,
    overflow: 'hidden',
  },
  moduleGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    minHeight: 92,
    position: 'relative',
  },

  // Badge
  moduleBadge: {
    position: 'absolute',
    top: theme.spacing.sm,
    right: theme.spacing.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: theme.borderRadius.full,
    minWidth: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.sm,
    borderWidth: 2,
    borderColor: '#fff',
  },
  moduleBadgeText: {
    color: '#fff',
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
  },

  // Icon
  moduleIconContainer: {
    width: 58,
    height: 58,
    borderRadius: theme.borderRadius.xl,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.sm,
  },

  // Content
  moduleContent: {
    flex: 1,
  },
  moduleTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 2,
  },
  moduleSubtitle: {
    fontSize: theme.fontSize.sm,
    color: '#fff',
    opacity: 0.92,
    lineHeight: 17,
  },

  // Arrow
  moduleArrow: {
    width: 32,
    height: 32,
    borderRadius: theme.borderRadius.md,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Spacing
  bottomSpacing: {
    height: 100,
  },
});
