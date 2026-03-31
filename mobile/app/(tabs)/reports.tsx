import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Alert,
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
import { useAuth } from '@/hooks/useAuth';
import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import PageHeader from '@/components/layout/PageHeader';

interface MenuItem {
  id: string;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  iconBg: string;
  route?: string;
  onPress?: () => void;
}

export default function ReportsScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();
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

  const onRefresh = async () => {
    setRefreshing(true);
    await new Promise((resolve) => setTimeout(resolve, 900));
    setRefreshing(false);
  };

  const handleLogout = async () => {
    Alert.alert('Sair', 'Tem certeza que deseja sair do aplicativo?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sair',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/(auth)/login');
        },
      },
    ]);
  };

  const getRoleLabel = (role: string) => {
    const roles: Record<string, string> = {
      ADMIN: 'Administrador',
      admin: 'Administrador',
      SELLER: 'Vendedor',
      seller: 'Vendedor',
      MANAGER: 'Gerente',
      manager: 'Gerente',
      EMPLOYEE: 'Funcionario',
      CASHIER: 'Caixa',
      cashier: 'Caixa',
    };
    return roles[role] || role;
  };

  const reports: MenuItem[] = [
    {
      id: 'sales',
      title: 'Relatorio de Vendas',
      subtitle: 'Analise completa de vendas, lucro e margem',
      icon: 'bar-chart-outline',
      iconColor: Colors.light.success,
      iconBg: Colors.light.successLight,
      route: '/reports/sales',
    },
    {
      id: 'best-sellers',
      title: 'Produtos Mais Vendidos',
      subtitle: 'Ranking com indicadores de desempenho',
      icon: 'trending-up-outline',
      iconColor: Colors.light.info,
      iconBg: Colors.light.infoLight,
      route: '/reports/top-products',
    },
    {
      id: 'history',
      title: 'Historico',
      subtitle: 'Timeline de vendas e movimentacoes',
      icon: 'time-outline',
      iconColor: brandingColors.primary,
      iconBg: brandingColors.primary + '14',
      route: '/reports/history',
    },
    {
      id: 'inventory-report',
      title: 'Relatorio de Inventario',
      subtitle: 'Movimentacoes de estoque',
      icon: 'file-tray-stacked-outline',
      iconColor: Colors.light.warning,
      iconBg: Colors.light.warning + '14',
      onPress: () => Alert.alert('Em desenvolvimento', 'Relatorio de inventario sera implementado em breve!'),
    },
  ];

  const configs: MenuItem[] = [
    {
      id: 'profile',
      title: 'Meu Perfil',
      subtitle: 'Dados pessoais e preferencias',
      icon: 'person-circle-outline',
      iconColor: brandingColors.primary,
      iconBg: brandingColors.primary + '14',
      onPress: () => Alert.alert('Em desenvolvimento', 'Tela de perfil sera implementada em breve!'),
    },
    {
      id: 'notifications',
      title: 'Notificacoes',
      subtitle: 'Alertas e lembretes',
      icon: 'notifications-outline',
      iconColor: Colors.light.warning,
      iconBg: Colors.light.warning + '14',
      onPress: () => Alert.alert('Em desenvolvimento', 'Configuracoes serao implementadas em breve!'),
    },
    {
      id: 'help',
      title: 'Ajuda e Suporte',
      subtitle: 'Central de ajuda',
      icon: 'help-circle-outline',
      iconColor: Colors.light.info,
      iconBg: Colors.light.infoLight,
      onPress: () => Alert.alert('Em desenvolvimento', 'Secao de ajuda sera implementada em breve!'),
    },
  ];

  const renderMenuCard = (item: MenuItem) => (
    <TouchableOpacity
      key={item.id}
      style={styles.menuCard}
      onPress={() => {
        if (item.route) {
          router.push(item.route as any);
        } else if (item.onPress) {
          item.onPress();
        }
      }}
      activeOpacity={0.75}
    >
      <View style={[styles.menuIconContainer, { backgroundColor: item.iconBg }]}> 
        <Ionicons name={item.icon} size={20} color={item.iconColor} />
      </View>

      <View style={styles.menuItemContent}>
        <Text style={styles.menuItemTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.menuItemSubtitle} numberOfLines={2}>{item.subtitle}</Text>
      </View>

      <View style={styles.menuActionPill}>
        <Text style={styles.menuActionText}>Abrir</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={Colors.light.textTertiary} />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* ── Header animado ── */}
      <Animated.View style={headerAnimStyle}>
        <PageHeader
          title={user?.full_name || 'Perfil'}
          subtitle={getRoleLabel(user?.role || '')}
        />
      </Animated.View>

      <Animated.View style={[styles.contentAnimation, contentAnimStyle]}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[brandingColors.primary]}
              tintColor={brandingColors.primary}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="analytics-outline" size={16} color={brandingColors.primary} />
              <Text style={styles.sectionTitle}>Relatorios</Text>
            </View>
            <View style={styles.sectionCards}>{reports.map(renderMenuCard)}</View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="settings-outline" size={16} color={brandingColors.primary} />
              <Text style={styles.sectionTitle}>Configuracoes</Text>
            </View>
            <View style={styles.sectionCards}>{configs.map(renderMenuCard)}</View>
          </View>

          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.75}>
            <LinearGradient
              colors={['#EF4444', '#DC2626']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.logoutGradient}
            >
              <Ionicons name="log-out-outline" size={18} color="#fff" />
              <Text style={styles.logoutText}>Sair da Conta</Text>
            </LinearGradient>
          </TouchableOpacity>

          <Text style={styles.version}>Versao 1.0.1 • Fitness Store Management</Text>
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
  contentAnimation: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.xxl,
    gap: theme.spacing.lg,
  },
  section: {
    gap: theme.spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingHorizontal: 2,
  },
  sectionTitle: {
    fontSize: theme.fontSize.xs,
    fontWeight: '800',
    color: Colors.light.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionCards: {
    gap: theme.spacing.xs + 2,
  },
  menuCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs + 2,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.card,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    minHeight: 76,
    ...theme.shadows.sm,
  },
  menuIconContainer: {
    width: 40,
    height: 40,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  menuItemContent: {
    flex: 1,
    minWidth: 0,
  },
  menuItemTitle: {
    fontSize: theme.fontSize.base - 1,
    fontWeight: '800',
    color: Colors.light.text,
    marginBottom: 2,
  },
  menuItemSubtitle: {
    fontSize: theme.fontSize.xs,
    color: Colors.light.textSecondary,
    lineHeight: 16,
  },
  menuActionPill: {
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: theme.spacing.xs + 2,
    paddingVertical: 4,
    backgroundColor: Colors.light.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.light.border,
    marginRight: 2,
  },
  menuActionText: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.light.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  logoutButton: {
    marginTop: theme.spacing.xs,
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
  },
  logoutGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.md,
  },
  logoutText: {
    fontSize: theme.fontSize.sm,
    fontWeight: '800',
    color: '#fff',
  },
  version: {
    textAlign: 'center',
    fontSize: theme.fontSize.xs,
    color: Colors.light.textTertiary,
    marginTop: theme.spacing.xs,
  },
});
