import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/hooks/useAuth';
import { UserRole } from '@/types';
import { useRouter } from 'expo-router';
import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import PageHeader from '@/components/layout/PageHeader';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

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
      <View style={[styles.menuIconContainer, { backgroundColor: iconBg || Colors.light.backgroundSecondary }]}>
        <Ionicons name={icon} size={22} color={iconColor || Colors.light.primary} />
      </View>
      <View style={styles.menuItemContent}>
        <Text style={styles.menuItemTitle}>{title}</Text>
        {subtitle && <Text style={styles.menuItemSubtitle}>{subtitle}</Text>}
      </View>
      <View style={styles.menuOpenTag}>
        <Text style={styles.menuOpenTagText}>Abrir</Text>
      </View>
      {badge && (
        <View style={styles.menuBadge}>
          <Text style={styles.menuBadgeText}>{badge}</Text>
        </View>
      )}
      <Ionicons name="chevron-forward" size={18} color={Colors.light.textTertiary} />
    </TouchableOpacity>
  );
}

export default function MoreScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const brandingColors = useBrandingColors();
  const [refreshing, setRefreshing] = useState(false);
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const [showDevDialog, setShowDevDialog] = useState(false);
  const [devDialogTitle, setDevDialogTitle] = useState('');

  const onRefresh = async () => {
    setRefreshing(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    setRefreshing(false);
  };

  const handleLogout = () => setShowLogoutDialog(true);

  const showDev = (title: string) => {
    setDevDialogTitle(title);
    setShowDevDialog(true);
  };

  const getRoleLabel = (role: string) => {
    const roles: Record<string, string> = {
      ADMIN: 'Administrador', admin: 'Administrador',
      SELLER: 'Vendedor', seller: 'Vendedor',
      MANAGER: 'Gerente', manager: 'Gerente',
      EMPLOYEE: 'Funcionário',
      CASHIER: 'Caixa', cashier: 'Caixa',
    };
    return roles[role] || role;
  };

  return (
    <View style={styles.container}>
      <PageHeader
        title={user?.full_name || 'Perfil'}
        subtitle={getRoleLabel(user?.role || '')}
      />

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[brandingColors.primary]} />
        }
      >
        {/* Ações Rápidas */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ações Rápidas</Text>
          <View style={styles.quickActionsGrid}>
            <TouchableOpacity
              style={[styles.quickActionCard, { backgroundColor: '#10B981' }]}
              onPress={() => router.push('/(tabs)/sale')}
              activeOpacity={0.8}
            >
              <View style={styles.quickActionIcon}>
                <Ionicons name="cart" size={26} color="#fff" />
              </View>
              <Text style={styles.quickActionTitle}>Nova Venda</Text>
              <Text style={styles.quickActionSubtitle}>Registrar no PDV</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.quickActionCard, { backgroundColor: '#3B82F6' }]}
              onPress={() => router.push('/customers/add')}
              activeOpacity={0.8}
            >
              <View style={styles.quickActionIcon}>
                <Ionicons name="person-add" size={26} color="#fff" />
              </View>
              <Text style={styles.quickActionTitle}>Novo Cliente</Text>
              <Text style={styles.quickActionSubtitle}>Cadastrar</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.quickActionCard, { backgroundColor: '#8B5CF6' }]}
              onPress={() => router.push('/products/wizard')}
              activeOpacity={0.8}
            >
              <View style={styles.quickActionIcon}>
                <Ionicons name="cube" size={26} color="#fff" />
              </View>
              <Text style={styles.quickActionTitle}>Novo Produto</Text>
              <Text style={styles.quickActionSubtitle}>Adicionar ao catálogo</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.quickActionCard, { backgroundColor: '#EC4899' }]}
              onPress={() => router.push('/entries/add')}
              activeOpacity={0.8}
            >
              <View style={styles.quickActionIcon}>
                <Ionicons name="download" size={26} color="#fff" />
              </View>
              <Text style={styles.quickActionTitle}>Nova Entrada</Text>
              <Text style={styles.quickActionSubtitle}>Registrar compra</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Gestão */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Gestão</Text>
          <View style={styles.menuCard}>
            <MenuItem icon="cube-outline" title="Produtos" subtitle="Catálogo e gerenciamento" onPress={() => router.push('/(tabs)/products')} iconColor={Colors.light.primary} iconBg={Colors.light.primaryLight} />
            <MenuItem icon="people-outline" title="Clientes" subtitle="Gerenciar clientes e fidelidade" onPress={() => router.push('/(tabs)/customers')} iconColor={Colors.light.info} iconBg={Colors.light.infoLight} />
            <MenuItem icon="layers-outline" title="Entradas" subtitle="Compras e controle de entradas" onPress={() => router.push('/entries')} iconColor="#9333EA" iconBg="#F3E8FF" />
            <MenuItem icon="business-outline" title="Fornecedores" subtitle="Catálogo de fornecedores" onPress={() => router.push('/suppliers' as any)} iconColor="#F97316" iconBg="#FFEDD5" />
            <MenuItem icon="pricetags-outline" title="Categorias" subtitle="Organizar produtos por categoria" onPress={() => router.push('/(tabs)/categories')} iconColor="#9333EA" iconBg="#F3E8FF" />
            <MenuItem icon="layers-outline" title="Inventário" subtitle="Dashboard de estoque e alertas" onPress={() => router.push('/(tabs)/inventory')} iconColor={Colors.light.warning} iconBg={Colors.light.warningLight} />
          </View>
        </View>

        {/* Financeiro */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Financeiro</Text>
          <View style={styles.menuCard}>
            <MenuItem icon="receipt-outline" title="Despesas" subtitle="Registrar e gerenciar despesas operacionais" onPress={() => router.push('/(tabs)/expenses')} iconColor={Colors.light.error} iconBg="#FFEBEE" />
            <MenuItem icon="stats-chart-outline" title="Resultado do Mês (P&L)" subtitle="Receita − CMV − Despesas = Lucro Líquido" onPress={() => router.push('/(tabs)/expenses/resultado')} iconColor="#7C3AED" iconBg="#EDE9FE" />
          </View>
        </View>

        {/* Relatórios */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Relatórios</Text>
          <View style={styles.menuCard}>
            <MenuItem icon="bar-chart-outline" title="Vendas" subtitle="Relatório de vendas e faturamento" onPress={() => router.push('/reports/sales')} iconColor={Colors.light.success} iconBg={Colors.light.successLight} />
            <MenuItem icon="trending-up" title="Produtos Mais Vendidos" subtitle="Ranking e análise de performance" onPress={() => router.push('/reports/top-products')} iconColor="#EC4899" iconBg="#FCE7F3" />
            <MenuItem icon="calendar-outline" title="Histórico" subtitle="Vendas, entradas e movimentações" onPress={() => router.push('/reports/history')} iconColor="#8B5CF6" iconBg="#EDE9FE" />
          </View>
        </View>

        {/* Looks & Wishlist */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Looks & Wishlist</Text>
          <View style={styles.menuCard}>
            <MenuItem icon="shirt-outline" title="Lookbook" subtitle="Montar e gerenciar looks" onPress={() => router.push('/looks')} iconColor="#EC4899" iconBg="#FCE7F3" />
            <MenuItem icon="heart-outline" title="Demanda Wishlist" subtitle="Produtos mais desejados por clientes" onPress={() => router.push('/(tabs)/demand')} iconColor="#8B5CF6" iconBg="#EDE9FE" />
          </View>
        </View>

        {/* Viagens - Apenas ADMIN/MANAGER */}
        {(user?.role === UserRole.ADMIN || user?.role === UserRole.MANAGER) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Viagens</Text>
            <View style={styles.menuCard}>
              <MenuItem icon="airplane-outline" title="Gerenciar Viagens" subtitle="Compras em viagem e envios" onPress={() => router.push('/trips')} iconColor="#F97316" iconBg="#FFEDD5" />
            </View>
          </View>
        )}

        {/* Configurações */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Configurações</Text>
          <View style={styles.menuCard}>
            {user?.role === UserRole.ADMIN && (
              <MenuItem icon="color-palette-outline" title="Identidade da Loja" subtitle="Cores, logo e personalização" onPress={() => router.push('/settings/branding')} iconColor="#667eea" iconBg="#E0E7FF" />
            )}
            {user?.role === UserRole.ADMIN && (
              <MenuItem icon="people-outline" title="Gerenciar Equipe" subtitle="Usuários e permissões da loja" onPress={() => router.push('/team')} iconColor="#8B5CF6" iconBg="#EDE9FE" />
            )}
            {user?.role === UserRole.ADMIN && (
              <MenuItem icon="cash-outline" title="Descontos de Pagamento" subtitle="Configure descontos por forma de pagamento" onPress={() => router.push('/settings/payment-discounts')} iconColor="#10B981" iconBg="#D1FAE5" />
            )}
            <MenuItem icon="person-circle-outline" title="Meu Perfil" subtitle="Dados pessoais e preferências" onPress={() => showDev('Meu Perfil')} iconColor={Colors.light.primary} iconBg={Colors.light.primaryLight} />
            <MenuItem icon="notifications-outline" title="Notificações" subtitle="Alertas e lembretes" onPress={() => showDev('Notificações')} iconColor="#F97316" iconBg="#FFEDD5" />
            <MenuItem icon="help-circle-outline" title="Ajuda e Tutoriais" subtitle="Aprenda a usar o app" onPress={() => router.push('/help')} iconColor="#06B6D4" iconBg="#CFFAFE" />
          </View>
        </View>

        {/* Botão Sair */}
        <View style={styles.logoutSection}>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.75}>
            <Ionicons name="log-out-outline" size={20} color={Colors.light.error} />
            <Text style={styles.logoutText}>Sair da Conta</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.version}>Versão 1.0.0 · Fitness Store Management</Text>
      </ScrollView>

      {/* Dialog de Logout */}
      <ConfirmDialog
        visible={showLogoutDialog}
        title="Sair da conta?"
        message="Tem certeza que deseja sair do aplicativo?"
        confirmText="Sair"
        cancelText="Cancelar"
        type="danger"
        icon="log-out-outline"
        onConfirm={async () => {
          setShowLogoutDialog(false);
          await logout();
          router.replace('/(auth)/login');
        }}
        onCancel={() => setShowLogoutDialog(false)}
      />

      {/* Dialog Em Desenvolvimento */}
      <ConfirmDialog
        visible={showDevDialog}
        title={devDialogTitle}
        message="Esta funcionalidade será implementada em breve!"
        confirmText="OK"
        type="info"
        icon="construct-outline"
        onConfirm={() => setShowDevDialog(false)}
        onCancel={() => setShowDevDialog(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.backgroundSecondary,
  },
  scrollView: {
    flex: 1,
  },
  section: {
    marginTop: theme.spacing.lg,
    paddingHorizontal: theme.spacing.md,
  },
  sectionTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: Colors.light.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: theme.spacing.sm,
  },
  menuCard: {
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    overflow: 'hidden',
    ...theme.shadows.sm,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.sm + 2,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.light.border,
  },
  menuIconContainer: {
    width: 44,
    height: 44,
    borderRadius: theme.borderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.sm,
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
  menuOpenTag: {
    borderRadius: theme.borderRadius.full,
    backgroundColor: Colors.light.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.light.border,
    paddingHorizontal: theme.spacing.xs + 2,
    paddingVertical: 4,
    marginRight: theme.spacing.xs,
  },
  menuOpenTagText: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.light.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  menuBadge: {
    backgroundColor: Colors.light.error,
    borderRadius: theme.borderRadius.full,
    minWidth: 22,
    height: 22,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    marginRight: theme.spacing.sm,
  },
  menuBadgeText: {
    color: '#fff',
    fontSize: theme.fontSize.xxs,
    fontWeight: '700',
  },
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  quickActionCard: {
    flex: 1,
    minWidth: '47%',
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.md,
    alignItems: 'center',
    ...theme.shadows.sm,
  },
  quickActionIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  quickActionTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 2,
    textAlign: 'center',
  },
  quickActionSubtitle: {
    fontSize: theme.fontSize.xs,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
  },
  logoutSection: {
    marginTop: theme.spacing.xl,
    marginBottom: theme.spacing.lg,
    paddingHorizontal: theme.spacing.md,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    borderWidth: 1.5,
    borderColor: Colors.light.error,
    borderRadius: theme.borderRadius.xl,
    paddingVertical: 14,
  },
  logoutText: {
    fontSize: theme.fontSize.base - 1,
    fontWeight: '700',
    color: Colors.light.error,
  },
  version: {
    textAlign: 'center',
    fontSize: theme.fontSize.xs,
    color: Colors.light.textTertiary,
    marginBottom: theme.spacing.xl,
  },
});
