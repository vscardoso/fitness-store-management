/**
 * Barra lateral do modo notebook (app web com 1024 px ou mais; ver hooks/useLayout.ts).
 * Substitui as abas de baixo e o menu "Mais": mesmos destinos e mesmas regras de papel do app/(tabs)/more.tsx
 * (caixa e vendedor não veem entradas, fornecedores, dinheiro nem relatórios).
 */
import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { usePathname, useRouter } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { useUnreadCount } from '@/hooks/useNotificationInbox';
import { useBrandingColors } from '@/store/brandingStore';
import { isAdminRole, isManagerRole } from '@/utils/roles';
import { ProvadorLogo } from '@/components/branding/ProvadorLogo';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { BRAND } from '@/constants/Brand';
import { SIDEBAR_WIDTH } from '@/hooks/useLayout';

type Icon = keyof typeof Ionicons.glyphMap;

interface NavItem {
  label: string;
  icon: Icon;
  href: string;
  /** Rotas que deixam o item marcado (prefixos) */
  match: string[];
  shortcut?: string;
  badge?: number;
}

interface NavGroup {
  key: string;
  title: string;
  items: NavItem[];
  /** Começa fechado (abre sozinho quando a tela atual está dentro dele) */
  collapsed?: boolean;
}

const ROLE_LABEL: Record<string, string> = {
  admin: 'Administrador', manager: 'Gerente', seller: 'Vendedor', cashier: 'Caixa', employee: 'Funcionário',
};

function isActive(pathname: string, item: NavItem): boolean {
  return item.match.some((m) => (m === '/' ? pathname === '/' : pathname === m || pathname.startsWith(m + '/')));
}

export default function DesktopSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const colors = useBrandingColors();
  const { data: unread = 0 } = useUnreadCount();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [confirmLogout, setConfirmLogout] = useState(false);
  const manager = isManagerRole(user?.role);
  const admin = isAdminRole(user?.role);

  const groups = useMemo<NavGroup[]>(() => {
    const g: NavGroup[] = [
      {
        key: 'vender', title: 'Vender', items: [
          { label: 'Início', icon: 'home-outline', href: '/(tabs)', match: ['/'] },
          { label: 'Ponto de venda', icon: 'cart-outline', href: '/(tabs)/sale', match: ['/sale', '/checkout'], shortcut: 'F2' },
          { label: 'Vendas', icon: 'receipt-outline', href: '/(tabs)/sales', match: ['/sales'] },
          { label: 'Condicionais', icon: 'swap-horizontal-outline', href: '/(tabs)/conditional', match: ['/conditional'] },
          { label: 'Pagamentos pendentes', icon: 'time-outline', href: '/(tabs)/pdv/', match: ['/pdv'] },
        ],
      },
      {
        key: 'estoque', title: 'Estoque', items: [
          { label: 'Produtos', icon: 'cube-outline', href: '/(tabs)/products', match: ['/products'] },
          ...(manager ? [{ label: 'Entradas', icon: 'download-outline' as Icon, href: '/entries', match: ['/entries'] }] : []),
          { label: 'Categorias', icon: 'pricetags-outline', href: '/(tabs)/categories', match: ['/categories'] },
          { label: 'Inventário', icon: 'layers-outline', href: '/(tabs)/inventory', match: ['/inventory'] },
          ...(manager ? [
            { label: 'Fornecedores', icon: 'business-outline' as Icon, href: '/suppliers', match: ['/suppliers'] },
            { label: 'Viagens', icon: 'airplane-outline' as Icon, href: '/trips', match: ['/trips'] },
          ] : []),
        ],
      },
      {
        key: 'clientes', title: 'Clientes', items: [
          { label: 'Clientes', icon: 'people-outline', href: '/(tabs)/customers', match: ['/customers'] },
          ...(manager ? [
            { label: 'Lookbook', icon: 'shirt-outline' as Icon, href: '/looks', match: ['/looks'] },
            { label: 'Demanda wishlist', icon: 'heart-outline' as Icon, href: '/(tabs)/demand', match: ['/demand', '/wishlist'] },
          ] : []),
        ],
      },
    ];
    if (manager) {
      g.push(
        {
          key: 'dinheiro', title: 'Dinheiro', items: [
            { label: 'Resultado do mês', icon: 'stats-chart-outline', href: '/(tabs)/expenses/resultado', match: ['/expenses/resultado'] },
            { label: 'Despesas', icon: 'wallet-outline', href: '/(tabs)/expenses', match: ['/expenses'] },
            { label: 'Prejuízos', icon: 'warning-outline', href: '/(tabs)/stock-losses', match: ['/stock-losses'] },
          ],
        },
        {
          key: 'relatorios', title: 'Relatórios', collapsed: true, items: [
            { label: 'Vendas', icon: 'bar-chart-outline', href: '/reports/sales', match: ['/reports/sales'] },
            { label: 'Conferência de estoque', icon: 'checkbox-outline', href: '/reports/stock-check', match: ['/reports/stock-check'] },
            { label: 'Lucro por lote', icon: 'layers-outline', href: '/reports/lots', match: ['/reports/lots'] },
            { label: 'Mais vendidos', icon: 'trending-up', href: '/reports/top-products', match: ['/reports/top-products'] },
            { label: 'Histórico', icon: 'calendar-outline', href: '/reports/history', match: ['/reports/history'] },
          ],
        },
      );
    }
    g.push({
      key: 'loja', title: 'Loja', collapsed: true, items: [
        ...(admin ? [
          { label: 'Identidade da loja', icon: 'color-palette-outline' as Icon, href: '/settings/branding', match: ['/settings/branding'] },
          { label: 'Equipe', icon: 'people-circle-outline' as Icon, href: '/team', match: ['/team'] },
          { label: 'Descontos de pagamento', icon: 'cash-outline' as Icon, href: '/settings/payment-discounts', match: ['/settings/payment-discounts'] },
          { label: 'Chave PIX', icon: 'qr-code-outline' as Icon, href: '/settings/pix-key', match: ['/settings/pix-key'] },
          { label: 'Prazo de troca', icon: 'swap-horizontal-outline' as Icon, href: '/settings/returns', match: ['/settings/returns'] },
        ] : []),
        { label: 'Terminais', icon: 'hardware-chip-outline', href: '/(tabs)/pdv/terminals', match: ['/pdv/terminals'] },
        { label: 'Ajuda e tutoriais', icon: 'help-circle-outline', href: '/(tabs)/help', match: ['/help'] },
      ],
    });
    return g;
  }, [manager, admin]);

  const isGroupOpen = (group: NavGroup) => {
    if (open[group.key] !== undefined) return open[group.key];
    if (!group.collapsed) return true;
    return group.items.some((it) => isActive(pathname, it));
  };

  // Só o item mais específico fica marcado (ex.: "Resultado do mês" e não "Despesas")
  const activeHref = useMemo(() => {
    let best: { href: string; len: number } | null = null;
    for (const group of groups) {
      for (const it of group.items) {
        for (const m of it.match) {
          const hit = m === '/' ? pathname === '/' : pathname === m || pathname.startsWith(m + '/');
          if (hit && (!best || m.length > best.len)) best = { href: it.href, len: m.length };
        }
      }
    }
    return best?.href;
  }, [groups, pathname]);

  const role = String(user?.role ?? '').toLowerCase();

  return (
    <View style={[styles.bar, { width: SIDEBAR_WIDTH }]} {...({ role: "navigation" } as any)} accessibilityLabel="Menu principal">
      <View style={styles.brand}>
        <ProvadorLogo size={34} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.brandName}>Provador</Text>
          <Text style={styles.storeName} numberOfLines={1}>{user?.store_name || 'Sua loja'}</Text>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {groups.map((group) => {
          const groupOpen = isGroupOpen(group);
          return (
            <View key={group.key} style={styles.group}>
              <TouchableOpacity
                onPress={() => setOpen((o) => ({ ...o, [group.key]: !groupOpen }))}
                style={styles.groupHeader}
                accessibilityRole="button"
                accessibilityState={{ expanded: groupOpen }}
              >
                <Text style={styles.groupTitle}>{group.title.toUpperCase()}</Text>
                <Ionicons name={groupOpen ? 'chevron-up' : 'chevron-down'} size={13} color="#A79FC0" />
              </TouchableOpacity>
              {groupOpen && group.items.map((it) => {
                const active = activeHref === it.href;
                return (
                  <TouchableOpacity
                    key={it.href}
                    onPress={() => router.push(it.href as any)}
                    style={[styles.item, active && { backgroundColor: colors.primary }]}
                    accessibilityRole="link"
                    accessibilityState={{ selected: active }}
                  >
                    <Ionicons name={it.icon} size={18} color={active ? '#FFFFFF' : '#D9D4E8'} />
                    <Text style={[styles.itemText, active && styles.itemTextActive]} numberOfLines={1}>{it.label}</Text>
                    {it.shortcut ? <Text style={styles.shortcut}>{it.shortcut}</Text> : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.footer}>
        <View style={[styles.avatar, { backgroundColor: BRAND.magenta }]}>
          <Text style={styles.avatarText}>{(user?.full_name || '?').trim().slice(0, 1).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.userName} numberOfLines={1}>{user?.full_name || 'Usuário'}</Text>
          <Text style={styles.userRole} numberOfLines={1}>{ROLE_LABEL[role] || role}</Text>
        </View>
        <TouchableOpacity
          onPress={() => router.push('/notifications' as any)}
          style={styles.iconBtn}
          accessibilityLabel={unread > 0 ? `Notificações, ${unread} sem ler` : 'Notificações'}
        >
          <Ionicons name="notifications-outline" size={18} color="#E7E3F1" />
          {unread > 0 && (
            <View style={styles.badge}><Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text></View>
          )}
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setConfirmLogout(true)} style={styles.iconBtn} accessibilityLabel="Sair da conta">
          <Ionicons name="log-out-outline" size={18} color="#E7E3F1" />
        </TouchableOpacity>
      </View>

      <ConfirmDialog
        visible={confirmLogout}
        title="Sair da conta?"
        message="Tem certeza que deseja sair do aplicativo?"
        confirmText="Sair"
        cancelText="Cancelar"
        type="danger"
        icon="log-out-outline"
        onConfirm={async () => {
          setConfirmLogout(false);
          await logout();
          router.replace('/(auth)/login');
        }}
        onCancel={() => setConfirmLogout(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: BRAND.ink,
    paddingTop: 16,
    paddingBottom: 12,
    paddingHorizontal: 10,
    height: '100%',
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 6, paddingBottom: 14 },
  brandName: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', letterSpacing: -0.2 },
  storeName: { color: '#C9C2DD', fontSize: 12 },
  scroll: { paddingBottom: 12, gap: 6 },
  group: { gap: 1 },
  groupHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingTop: 10, paddingBottom: 5 },
  groupTitle: { color: '#A79FC0', fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8 },
  itemText: { flex: 1, color: '#E7E3F1', fontSize: 14 },
  itemTextActive: { color: '#FFFFFF', fontWeight: '600' },
  shortcut: { color: '#C9C2DD', fontSize: 11 },
  footer: {
    flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)', marginTop: 8,
  },
  avatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  userName: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  userRole: { color: '#C9C2DD', fontSize: 12 },
  iconBtn: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute', top: 2, right: 0, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 3,
    backgroundColor: BRAND.magenta, alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
});
