import { useState } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Alert } from 'react-native';
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
      SELLER: 'Vendedor',
      EMPLOYEE: 'Funcionário',
    };
    return roles[role] || role;
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={[Colors.light.primary]}
        />
      }
    >
      {/* Profile Card com Gradiente */}
      <LinearGradient
        colors={[Colors.light.primary, Colors.light.secondary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.profileGradient}
      >
        <View style={styles.profileContent}>
          <View style={styles.avatarContainer}>
            <Avatar.Text
              size={72}
              label={user?.full_name?.charAt(0) || 'U'}
              style={styles.avatar}
              labelStyle={styles.avatarLabel}
            />
          </View>
          <Text variant="headlineSmall" style={styles.profileName}>
            {user?.full_name}
          </Text>
          <Text variant="bodyMedium" style={styles.profileEmail}>
            {user?.email}
          </Text>
          <View style={styles.roleChip}>
            <Ionicons name="shield-checkmark" size={16} color="#fff" />
            <Text style={styles.roleText}>{getRoleLabel(user?.role || '')}</Text>
          </View>
        </View>
      </LinearGradient>

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
            icon="swap-horizontal-outline"
            title="Estoque"
            subtitle="Movimentações e controle"
            onPress={() => Alert.alert('Em desenvolvimento', 'Tela de estoque será implementada em breve!')}
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
            onPress={() => Alert.alert('Em desenvolvimento', 'Relatórios serão implementados em breve!')}
            iconColor={Colors.light.success}
            iconBg={Colors.light.successLight}
          />
          <MenuItem
            icon="trending-up-outline"
            title="Produtos Mais Vendidos"
            subtitle="Análise de performance"
            onPress={() => Alert.alert('Em desenvolvimento', 'Relatórios serão implementados em breve!')}
            iconColor="#EC4899"
            iconBg="#FCE7F3"
          />
          <MenuItem
            icon="calendar-outline"
            title="Histórico"
            subtitle="Vendas e movimentações"
            onPress={() => Alert.alert('Em desenvolvimento', 'Relatórios serão implementados em breve!')}
            iconColor="#8B5CF6"
            iconBg="#EDE9FE"
          />
        </Card>
      </View>

      <View style={styles.section}>
        <Text variant="titleMedium" style={styles.sectionTitle}>
          Configurações
        </Text>
        <Card style={styles.menuCard}>
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
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.backgroundSecondary,
  },
  profileGradient: {
    paddingTop: 32,
    paddingBottom: 40,
    paddingHorizontal: 20,
  },
  profileContent: {
    alignItems: 'center',
  },
  avatarContainer: {
    marginBottom: 16,
  },
  avatar: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  avatarLabel: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
  },
  profileName: {
    color: '#fff',
    fontWeight: 'bold',
    marginBottom: 4,
  },
  profileEmail: {
    color: 'rgba(255, 255, 255, 0.9)',
    marginBottom: 12,
  },
  roleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: theme.borderRadius.full,
    gap: 6,
  },
  roleText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
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
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
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
});
