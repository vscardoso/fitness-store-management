import { useState } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Alert, StatusBar } from 'react-native';
import { Text, Card, Avatar, Button } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'expo-router';
import { Colors, theme } from '@/constants/Colors';

interface MenuItemProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  onPress: () => void;
  badge?: string | number;
  iconColor?: string;
  iconBg?: string;
}

function MenuItem({ icon, title, subtitle, onPress, badge, iconColor, iconBg }: MenuItemProps) {
  return (
    <TouchableOpacity
      style={styles.menuItem}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View
        style={[
          styles.menuIconContainer,
          { backgroundColor: iconBg || Colors.light.primaryLight },
        ]}
      >
        <Ionicons name={icon} size={24} color={iconColor || Colors.light.primary} />
      </View>
      <View style={styles.menuItemContent}>
        <Text variant="bodyLarge" style={styles.menuItemTitle}>
          {title}
        </Text>
        {subtitle && (
          <Text variant="bodySmall" style={styles.menuItemSubtitle}>
            {subtitle}
          </Text>
        )}
      </View>
      {badge && (
        <View style={styles.menuBadge}>
          <Text style={styles.menuBadgeText}>{badge}</Text>
        </View>
      )}
      <Ionicons name="chevron-forward" size={20} color={Colors.light.textTertiary} />
    </TouchableOpacity>
  );
}

export default function MoreScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    setRefreshing(false);
  };

  const handleLogout = async () => {
    Alert.alert(
      'Sair',
      'Tem certeza que deseja sair do aplicativo?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sair',
          style: 'destructive',
          onPress: async () => {
            await logout();
            router.replace('/(auth)/login');
          },
        },
      ]
    );
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

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      
      {/* Header Premium */}
      <View style={styles.headerContainer}>
        <LinearGradient
          colors={[Colors.light.primary, Colors.light.secondary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerGradient}
        >
          <View style={styles.headerContent}>
            <View style={styles.avatarContainer}>
              <Avatar.Text
                size={64}
                label={user?.full_name?.charAt(0) || 'U'}
                style={styles.avatar}
                labelStyle={styles.avatarLabel}
              />
            </View>
            <View style={styles.userInfo}>
              <Text style={styles.greeting}>{user?.full_name}</Text>
              <Text style={styles.headerSubtitle}>{user?.email}</Text>
              <View style={styles.roleChip}>
                <Ionicons name="shield-checkmark" size={14} color="#fff" />
                <Text style={styles.roleText}>{getRoleLabel(user?.role || '')}</Text>
              </View>
            </View>
          </View>
        </LinearGradient>
      </View>

      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[Colors.light.primary]}
          />
        }
      >


      {/* Quick Actions */}
      <View style={styles.section}>
        <Text variant="titleMedium" style={styles.sectionTitle}>
          ⚡ Ações Rápidas
        </Text>
        <View style={styles.quickActionsGrid}>
          <TouchableOpacity
            style={[styles.quickActionCard, { backgroundColor: '#10B981' }]}
            onPress={() => router.push('/(tabs)/sale')}
            activeOpacity={0.8}
          >
            <View style={styles.quickActionIcon}>
              <Ionicons name="cart" size={28} color="#fff" />
            </View>
            <Text style={styles.quickActionTitle}>Nova Venda</Text>
            <Text style={styles.quickActionSubtitle}>Registrar no PDV</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.quickActionCard, { backgroundColor: '#3B82F6' }]}
            onPress={() => router.push('/customers/new')}
            activeOpacity={0.8}
          >
            <View style={styles.quickActionIcon}>
              <Ionicons name="person-add" size={28} color="#fff" />
            </View>
            <Text style={styles.quickActionTitle}>Novo Cliente</Text>
            <Text style={styles.quickActionSubtitle}>Cadastrar</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.quickActionCard, { backgroundColor: '#8B5CF6' }]}
            onPress={() => router.push('/products/new')}
            activeOpacity={0.8}
          >
            <View style={styles.quickActionIcon}>
              <Ionicons name="cube" size={28} color="#fff" />
            </View>
            <Text style={styles.quickActionTitle}>Novo Produto</Text>
            <Text style={styles.quickActionSubtitle}>Adicionar ao catálogo</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.quickActionCard, { backgroundColor: '#EC4899' }]}
            onPress={() => router.push('/entries/new')}
            activeOpacity={0.8}
          >
            <View style={styles.quickActionIcon}>
              <Ionicons name="download" size={28} color="#fff" />
            </View>
            <Text style={styles.quickActionTitle}>Nova Entrada</Text>
            <Text style={styles.quickActionSubtitle}>Registrar compra</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Menu Items */}
      <View style={styles.section}>
        <Text variant="titleMedium" style={styles.sectionTitle}>
          Gestão
        </Text>
        <Card style={styles.menuCard}>
          <MenuItem
            icon="cube-outline"
            title="Produtos"
            subtitle="Catálogo e gerenciamento"
            onPress={() => router.push('/(tabs)/products')}
            iconColor={Colors.light.primary}
            iconBg={Colors.light.primaryLight}
          />
          <MenuItem
            icon="people-outline"
            title="Clientes"
            subtitle="Gerenciar clientes e fidelidade"
            onPress={() => router.push('/(tabs)/customers')}
            iconColor={Colors.light.info}
            iconBg={Colors.light.infoLight}
          />
          <MenuItem
            icon="layers-outline"
            title="Entradas"
            subtitle="Compras e controle de entradas"
            onPress={() => router.push('/entries')}
            iconColor="#9333EA"
            iconBg="#F3E8FF"
          />
          <MenuItem
            icon="pricetags-outline"
            title="Categorias"
            subtitle="Organizar produtos por categoria"
            onPress={() => Alert.alert('Em desenvolvimento', 'Tela de categorias será implementada em breve!')}
            iconColor="#9333EA"
            iconBg="#F3E8FF"
          />
          <MenuItem
            icon="layers-outline"
            title="Inventário"
            subtitle="Dashboard de estoque e alertas"
            onPress={() => router.push('/(tabs)/inventory')}
            iconColor={Colors.light.warning}
            iconBg={Colors.light.warningLight}
          />
        </Card>
      </View>

      <View style={styles.section}>
        <Text variant="titleMedium" style={styles.sectionTitle}>
          Relatórios
        </Text>
        <Card style={styles.menuCard}>
          <MenuItem
            icon="bar-chart-outline"
            title="Vendas"
            subtitle="Relatório de vendas e faturamento"
            onPress={() => router.push('/reports/sales')}
            iconColor={Colors.light.success}
            iconBg={Colors.light.successLight}
          />
          <MenuItem
            icon="trending-up"
            title="Produtos Mais Vendidos"
            subtitle="Ranking e análise de performance"
            onPress={() => router.push('/reports/top-products')}
            iconColor="#EC4899"
            iconBg="#FCE7F3"
          />
          <MenuItem
            icon="calendar-outline"
            title="Histórico"
            subtitle="Vendas, entradas e movimentações"
            onPress={() => router.push('/reports/history')}
            iconColor="#8B5CF6"
            iconBg="#EDE9FE"
          />
        </Card>
      </View>

      {/* Viagens - Apenas ADMIN/MANAGER */}
      {(user?.role === 'admin' || user?.role === 'ADMIN' || user?.role === 'manager' || user?.role === 'MANAGER') && (
        <View style={styles.section}>
          <Text variant="titleMedium" style={styles.sectionTitle}>
            🚚 Viagens
          </Text>
          <Card style={styles.menuCard}>
            <MenuItem
              icon="airplane-outline"
              title="Gerenciar Viagens"
              subtitle="Compras em viagem e envios"
              onPress={() => router.push('/trips')}
              iconColor="#F97316"
              iconBg="#FFEDD5"
            />
          </Card>
        </View>
      )}

      <View style={styles.section}>
        <Text variant="titleMedium" style={styles.sectionTitle}>
          Configurações
        </Text>
        <Card style={styles.menuCard}>
          {/* Descontos - Apenas ADMIN */}
          {(user?.role === 'admin' || user?.role === 'ADMIN') && (
            <MenuItem
              icon="cash-outline"
              title="Descontos de Pagamento"
              subtitle="Configure descontos por forma de pagamento"
              onPress={() => router.push('/settings/payment-discounts')}
              iconColor="#10B981"
              iconBg="#D1FAE5"
            />
          )}
          <MenuItem
            icon="person-circle-outline"
            title="Meu Perfil"
            subtitle="Dados pessoais e preferências"
            onPress={() => Alert.alert('Em desenvolvimento', 'Tela de perfil será implementada em breve!')}
            iconColor={Colors.light.primary}
            iconBg={Colors.light.primaryLight}
          />
          <MenuItem
            icon="notifications-outline"
            title="Notificações"
            subtitle="Alertas e lembretes"
            onPress={() => Alert.alert('Em desenvolvimento', 'Configurações serão implementadas em breve!')}
            iconColor="#F97316"
            iconBg="#FFEDD5"
          />
          <MenuItem
            icon="help-circle-outline"
            title="Ajuda e Suporte"
            subtitle="Central de ajuda"
            onPress={() => Alert.alert('Em desenvolvimento', 'Seção de ajuda será implementada em breve!')}
            iconColor="#06B6D4"
            iconBg="#CFFAFE"
          />
        </Card>
      </View>

      {/* Logout Button */}
      <View style={styles.logoutSection}>
        <Button
          mode="outlined"
          onPress={handleLogout}
          icon="logout"
          textColor={Colors.light.error}
          style={styles.logoutButton}
          contentStyle={styles.logoutButtonContent}
        >
          Sair da Conta
        </Button>
      </View>

      {/* App Version */}
      <Text variant="bodySmall" style={styles.version}>
        Versão 1.0.0 • Fitness Store Management
      </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.backgroundSecondary,
  },
  headerContainer: {
    overflow: 'hidden',
  },
  headerGradient: {
    paddingTop: theme.spacing.xl + 32,
    paddingBottom: theme.spacing.xl,
    paddingHorizontal: theme.spacing.lg,
    borderBottomLeftRadius: theme.borderRadius.xl,
    borderBottomRightRadius: theme.borderRadius.xl,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  avatarContainer: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  avatar: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  avatarLabel: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  userInfo: {
    flex: 1,
  },
  greeting: {
    fontSize: theme.fontSize.xl,
    fontWeight: '700',
    color: '#fff',
    marginBottom: theme.spacing.xxs,
  },
  headerSubtitle: {
    fontSize: theme.fontSize.sm,
    color: 'rgba(255, 255, 255, 0.9)',
    marginBottom: theme.spacing.xs,
  },
  roleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.full,
    gap: 4,
  },
  roleText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 12,
  },
  scrollView: {
    flex: 1,
  },
  section: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontWeight: '700',
    marginBottom: 12,
    color: Colors.light.text,
  },
  menuCard: {
    borderRadius: theme.borderRadius.lg,
    elevation: 1,
    backgroundColor: Colors.light.background,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.light.border,
  },
  menuIconContainer: {
    width: 48,
    height: 48,
    borderRadius: theme.borderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  menuItemContent: {
    flex: 1,
  },
  menuItemTitle: {
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: 2,
  },
  menuItemSubtitle: {
    color: Colors.light.textSecondary,
    fontSize: 13,
  },
  menuBadge: {
    backgroundColor: Colors.light.error,
    borderRadius: theme.borderRadius.full,
    minWidth: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
    marginRight: 8,
  },
  menuBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  logoutSection: {
    marginTop: 32,
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  logoutButton: {
    borderColor: Colors.light.error,
    borderWidth: 1.5,
  },
  logoutButtonContent: {
    paddingVertical: 6,
  },
  version: {
    textAlign: 'center',
    color: Colors.light.textTertiary,
    marginBottom: 32,
  },
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  quickActionCard: {
    flex: 1,
    minWidth: '47%',
    borderRadius: theme.borderRadius.lg,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  quickActionIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  quickActionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
    textAlign: 'center',
  },
  quickActionSubtitle: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
  },
});
