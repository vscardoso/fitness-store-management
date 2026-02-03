import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Text, Card, Avatar } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { Colors, theme } from '@/constants/Colors';

interface ReportItem {
  id: string;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  iconBg: string;
  route?: string;
  onPress?: () => void;
}

interface ConfigItem {
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
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
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
      EMPLOYEE: 'Funcionário',
      CASHIER: 'Caixa',
      cashier: 'Caixa',
    };
    return roles[role] || role;
  };

  // Relatórios
  const reports: ReportItem[] = [
    {
      id: 'sales',
      title: 'Relatório de Vendas',
      subtitle: 'Análise completa de vendas, lucro e margem',
      icon: 'bar-chart',
      iconColor: Colors.light.success,
      iconBg: Colors.light.successLight,
      route: '/reports/sales',
    },
    {
      id: 'best-sellers',
      title: 'Produtos Mais Vendidos',
      subtitle: 'Análise de performance',
      icon: 'trending-up',
      iconColor: '#EC4899',
      iconBg: '#FCE7F3',
      onPress: () =>
        Alert.alert(
          'Em desenvolvimento',
          'Análise de produtos será implementada em breve!'
        ),
    },
    {
      id: 'history',
      title: 'Histórico',
      subtitle: 'Vendas e movimentações',
      icon: 'calendar',
      iconColor: '#8B5CF6',
      iconBg: '#EDE9FE',
      onPress: () =>
        Alert.alert(
          'Em desenvolvimento',
          'Histórico será implementado em breve!'
        ),
    },
    {
      id: 'inventory-report',
      title: 'Relatório de Inventário',
      subtitle: 'Movimentações de estoque',
      icon: 'file-tray-stacked',
      iconColor: '#F97316',
      iconBg: '#FFEDD5',
      onPress: () =>
        Alert.alert(
          'Em desenvolvimento',
          'Relatório de inventário será implementado em breve!'
        ),
    },
  ];

  // Configurações
  const configs: ConfigItem[] = [
    {
      id: 'profile',
      title: 'Meu Perfil',
      subtitle: 'Dados pessoais e preferências',
      icon: 'person-circle',
      iconColor: Colors.light.primary,
      iconBg: Colors.light.primaryLight,
      onPress: () =>
        Alert.alert(
          'Em desenvolvimento',
          'Tela de perfil será implementada em breve!'
        ),
    },
    {
      id: 'notifications',
      title: 'Notificações',
      subtitle: 'Alertas e lembretes',
      icon: 'notifications',
      iconColor: '#F97316',
      iconBg: '#FFEDD5',
      onPress: () =>
        Alert.alert(
          'Em desenvolvimento',
          'Configurações serão implementadas em breve!'
        ),
    },
    {
      id: 'help',
      title: 'Ajuda e Suporte',
      subtitle: 'Central de ajuda',
      icon: 'help-circle',
      iconColor: '#06B6D4',
      iconBg: '#CFFAFE',
      onPress: () =>
        Alert.alert(
          'Em desenvolvimento',
          'Seção de ajuda será implementada em breve!'
        ),
    },
  ];

  // Renderizar item
  const MenuItem = ({
    item,
  }: {
    item: ReportItem | ConfigItem;
  }) => (
    <TouchableOpacity
      style={styles.menuItem}
      onPress={() => {
        if (item.route) {
          router.push(item.route as any);
        } else if (item.onPress) {
          item.onPress();
        }
      }}
      activeOpacity={0.7}
    >
      <View
        style={[styles.menuIconContainer, { backgroundColor: item.iconBg }]}
      >
        <Ionicons name={item.icon} size={24} color={item.iconColor} />
      </View>
      <View style={styles.menuItemContent}>
        <Text style={styles.menuItemTitle}>{item.title}</Text>
        <Text style={styles.menuItemSubtitle}>{item.subtitle}</Text>
      </View>
      <Ionicons
        name="chevron-forward"
        size={20}
        color={Colors.light.textTertiary}
      />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Header com Profile */}
      <LinearGradient
        colors={[Colors.light.primary, Colors.light.secondary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <View style={styles.profileContent}>
          <View style={styles.avatarContainer}>
            <Avatar.Text
              size={64}
              label={user?.full_name?.charAt(0) || 'U'}
              style={styles.avatar}
              labelStyle={styles.avatarLabel}
            />
          </View>
          <Text style={styles.profileName}>{user?.full_name}</Text>
          <Text style={styles.profileEmail}>{user?.email}</Text>
          <View style={styles.roleChip}>
            <Ionicons name="shield-checkmark" size={14} color="#fff" />
            <Text style={styles.roleText}>
              {getRoleLabel(user?.role || '')}
            </Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[Colors.light.primary]}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Seção: Relatórios */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons
              name="analytics"
              size={20}
              color={Colors.light.primary}
            />
            <Text style={styles.sectionTitle}>Relatórios</Text>
          </View>
          <Card style={styles.menuCard}>
            {reports.map((report, index) => (
              <View key={report.id}>
                <MenuItem item={report} />
                {index < reports.length - 1 && <View style={styles.divider} />}
              </View>
            ))}
          </Card>
        </View>

        {/* Seção: Configurações */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="settings" size={20} color={Colors.light.primary} />
            <Text style={styles.sectionTitle}>Configurações</Text>
          </View>
          <Card style={styles.menuCard}>
            {configs.map((config, index) => (
              <View key={config.id}>
                <MenuItem item={config} />
                {index < configs.length - 1 && <View style={styles.divider} />}
              </View>
            ))}
          </Card>
        </View>

        {/* Logout Button */}
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
          activeOpacity={0.7}
        >
          <LinearGradient
            colors={['#ef4444', '#dc2626']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.logoutGradient}
          >
            <Ionicons name="log-out" size={24} color="#fff" />
            <Text style={styles.logoutText}>Sair da Conta</Text>
          </LinearGradient>
        </TouchableOpacity>

        {/* App Version */}
        <Text style={styles.version}>
          Versão 1.0.1 • Fitness Store Management
        </Text>

        {/* Espaçamento */}
        <View style={styles.bottomSpacing} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.backgroundSecondary,
  },

  // Header
  header: {
    paddingTop: theme.spacing.xl + 20,
    paddingBottom: theme.spacing.xl,
    paddingHorizontal: theme.spacing.lg,
    borderBottomLeftRadius: theme.borderRadius.xxl,
    borderBottomRightRadius: theme.borderRadius.xxl,
  },
  profileContent: {
    alignItems: 'center',
  },
  avatarContainer: {
    marginBottom: theme.spacing.md,
  },
  avatar: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  avatarLabel: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  profileName: {
    fontSize: theme.fontSize.xl,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  profileEmail: {
    fontSize: theme.fontSize.md,
    color: 'rgba(255, 255, 255, 0.9)',
    marginBottom: theme.spacing.md,
  },
  roleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 6,
    borderRadius: theme.borderRadius.full,
    gap: 6,
  },
  roleText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },

  // Content
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.xl,
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

  // Menu Card
  menuCard: {
    borderRadius: theme.borderRadius.xl,
    elevation: 2,
    backgroundColor: Colors.light.background,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.lg,
  },
  menuIconContainer: {
    width: 48,
    height: 48,
    borderRadius: theme.borderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.md,
  },
  menuItemContent: {
    flex: 1,
  },
  menuItemTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: 2,
  },
  menuItemSubtitle: {
    fontSize: theme.fontSize.sm,
    color: Colors.light.textSecondary,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.light.border,
    marginLeft: theme.spacing.lg + 48 + theme.spacing.md,
  },

  // Logout
  logoutButton: {
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.xl,
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    elevation: 4,
  },
  logoutGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  logoutText: {
    fontSize: theme.fontSize.md,
    fontWeight: '700',
    color: '#fff',
  },

  // Version
  version: {
    textAlign: 'center',
    fontSize: theme.fontSize.sm,
    color: Colors.light.textTertiary,
    marginBottom: theme.spacing.lg,
  },

  // Spacing
  bottomSpacing: {
    height: 100,
  },
});
