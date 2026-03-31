import { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Text,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/hooks/useAuth';
import EmptyState from '@/components/ui/EmptyState';
import FAB from '@/components/FAB';
import PageHeader from '@/components/layout/PageHeader';
import { getCustomers } from '@/services/customerService';
import { formatPhone } from '@/utils/format';
import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import type { Customer } from '@/types';

export default function CustomersScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const brandingColors = useBrandingColors();

  // ── Animação de entrada ──
  const headerOpacity  = useSharedValue(0);
  const headerScale    = useSharedValue(0.94);
  const contentOpacity = useSharedValue(0);
  const contentTransY  = useSharedValue(24);

  const {
    data: customers,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['customers'],
    queryFn: () => getCustomers(),
    enabled: isAuthenticated,
    retry: false,
  });

  useFocusEffect(
    useCallback(() => {
      if (isAuthenticated) refetch();

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
    }, [isAuthenticated, refetch])
  );

  const headerAnimStyle  = useAnimatedStyle(() => ({
    opacity: headerOpacity.value,
    transform: [{ scale: headerScale.value }],
  }));
  const contentAnimStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ translateY: contentTransY.value }],
  }));

  // ── Filtros ──
  const filteredCustomers = customers?.filter((customer: Customer) => {
    const search = searchQuery.toLowerCase();
    const matchesSearch =
      customer.full_name.toLowerCase().includes(search) ||
      customer.email?.toLowerCase().includes(search) ||
      customer.phone?.includes(search) ||
      customer.document_number?.includes(search);
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && customer.is_active) ||
      (statusFilter === 'inactive' && !customer.is_active);
    return matchesSearch && matchesStatus;
  });

  const activeCount   = customers?.filter((c: Customer) => c.is_active).length || 0;
  const inactiveCount = customers?.filter((c: Customer) => !c.is_active).length || 0;
  const totalCount    = customers?.length || 0;
  const customerCount = filteredCustomers?.length || 0;

  // ── Item de cliente ──
  const renderCustomer = ({ item }: { item: Customer }) => (
    <TouchableOpacity
      style={styles.cardWrapper}
      onPress={() => router.push(`/customers/${item.id}`)}
      activeOpacity={0.7}
    >
      <View style={styles.card}>
        {/* Avatar */}
        <View style={[styles.avatarContainer, { backgroundColor: brandingColors.primary + '15' }]}>
          <Ionicons name="person" size={24} color={brandingColors.primary} />
        </View>

        {/* Nome */}
        <Text style={styles.customerName} numberOfLines={2}>{item.full_name}</Text>

        {/* Email */}
        {item.email ? (
          <Text style={styles.customerEmail} numberOfLines={1}>{item.email}</Text>
        ) : null}

        {/* Telefone */}
        {item.phone ? (
          <View style={styles.infoRow}>
            <Ionicons name="call-outline" size={13} color={Colors.light.textSecondary} />
            <Text style={styles.infoText} numberOfLines={1}>{formatPhone(item.phone)}</Text>
          </View>
        ) : null}

        {/* Status */}
        <View style={styles.statusBadge}>
          <View style={[styles.statusDot, item.is_active ? styles.statusDotActive : styles.statusDotInactive]} />
          <Text style={[styles.statusText, item.is_active ? styles.statusTextActive : styles.statusTextInactive]}>
            {item.is_active ? 'Ativo' : 'Inativo'}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>

      {/* ── Header animado ── */}
      <Animated.View style={headerAnimStyle}>
        <PageHeader
          title="Clientes"
          subtitle={`${customerCount} ${customerCount === 1 ? 'cliente' : 'clientes'}`}
          rightActions={[
            { icon: 'person-outline', onPress: () => router.push('/(tabs)/more') },
          ]}
        />
      </Animated.View>

      {/* ── Conteúdo animado ── */}
      <Animated.View style={[{ flex: 1 }, contentAnimStyle]}>

        {isLoading && !isRefetching ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={brandingColors.primary} />
            <Text style={styles.loadingText}>Carregando clientes...</Text>
          </View>
        ) : isError ? (
          <EmptyState
            icon="alert-circle-outline"
            title="Erro ao carregar clientes"
            description="Verifique sua conexão e tente novamente"
          />
        ) : (
          <>
            {/* Stats */}
            <View style={styles.statsContainer}>
              {([
                { label: 'Ativos',   value: activeCount   },
                { label: 'Inativos', value: inactiveCount },
                { label: 'Total',    value: totalCount    },
              ] as const).map(({ label, value }) => (
                <View key={label} style={styles.statCard}>
                  <Text style={styles.statLabel}>{label}</Text>
                  <Text style={styles.statValue}>{value}</Text>
                </View>
              ))}
            </View>

            {/* Busca */}
            <View style={styles.searchRow}>
              <Ionicons name="search-outline" size={18} color={Colors.light.textTertiary} style={{ flexShrink: 0 }} />
              <TextInput
                style={styles.searchInput}
                placeholder="Buscar por nome, email, telefone..."
                placeholderTextColor={Colors.light.textTertiary}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCorrect={false}
                returnKeyType="search"
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity
                  onPress={() => setSearchQuery('')}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close-circle" size={18} color={Colors.light.textTertiary} />
                </TouchableOpacity>
              )}
            </View>

            {/* Filtros */}
            <View style={styles.filterContainer}>
              {([
                { key: 'active'   as const, label: 'Ativos',   icon: 'checkmark-circle-outline' as const, count: activeCount   },
                { key: 'inactive' as const, label: 'Inativos', icon: 'close-circle-outline'     as const, count: inactiveCount },
                { key: 'all'      as const, label: 'Todos',    icon: 'people-outline'            as const, count: totalCount   },
              ]).map(({ key, label, icon, count }) => {
                const isActive = statusFilter === key;
                return (
                  <TouchableOpacity
                    key={key}
                    style={[
                      styles.filterChip,
                      isActive && { backgroundColor: brandingColors.primary + '15', borderColor: brandingColors.primary },
                    ]}
                    onPress={() => setStatusFilter(key)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={icon}
                      size={16}
                      color={isActive ? brandingColors.primary : Colors.light.textSecondary}
                    />
                    <Text style={[styles.filterChipText, isActive && { color: brandingColors.primary }]}>
                      {label}
                    </Text>
                    <View style={[styles.filterBadge, isActive && { backgroundColor: brandingColors.primary }]}>
                      <Text style={[styles.filterBadgeText, isActive && { color: '#fff' }]}>{count}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Lista */}
            <FlatList
              data={filteredCustomers}
              renderItem={renderCustomer}
              keyExtractor={(item) => item.id.toString()}
              numColumns={2}
              contentContainerStyle={styles.listContent}
              columnWrapperStyle={styles.columnWrapper}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              refreshControl={
                <RefreshControl
                  refreshing={isRefetching}
                  onRefresh={refetch}
                  colors={[brandingColors.primary]}
                />
              }
              ListEmptyComponent={
                <EmptyState
                  icon="people-outline"
                  title={searchQuery ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado'}
                  description={searchQuery ? 'Tente outro termo de busca' : 'Toque no botão + para adicionar'}
                />
              }
            />
          </>
        )}
      </Animated.View>

      {/* FAB */}
      <FAB directRoute="/customers/add" />
    </View>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.backgroundSecondary,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.lg,
  },
  loadingText: {
    marginTop: theme.spacing.md,
    color: Colors.light.textSecondary,
    fontSize: theme.fontSize.sm,
  },

  // ── Stats ──
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.lg,
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.light.border,
    ...theme.shadows.sm,
  },
  statLabel: {
    fontSize: theme.fontSize.xxs,
    fontWeight: '600',
    color: Colors.light.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: theme.spacing.xs,
  },
  statValue: {
    fontSize: theme.fontSize.xl,
    fontWeight: '700',
    color: Colors.light.text,
    letterSpacing: -0.5,
  },

  // ── Busca ──
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: theme.spacing.md,
    marginVertical: theme.spacing.sm,
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing.sm,
    height: 44,
    gap: theme.spacing.sm,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  searchInput: {
    flex: 1,
    fontSize: theme.fontSize.base,
    color: Colors.light.text,
    paddingVertical: 0,
  },

  // ── Filtros ──
  filterContainer: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  filterChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 10,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: Colors.light.card,
    borderWidth: 1,
    borderColor: Colors.light.border,
    minHeight: 44,
  },
  filterChipText: {
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
    color: Colors.light.textSecondary,
    flexShrink: 1,
  },
  filterBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.light.backgroundSecondary,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 5,
  },
  filterBadgeText: {
    fontSize: theme.fontSize.xxs,
    fontWeight: '700',
    color: Colors.light.textSecondary,
  },

  // ── Lista ──
  listContent: {
    paddingTop: theme.spacing.xs,
    paddingBottom: theme.spacing.xxl,
  },
  columnWrapper: {
    justifyContent: 'flex-start',
    paddingHorizontal: theme.spacing.sm,
  },

  // ── Card ──
  cardWrapper: {
    width: '47%',
    marginHorizontal: 6,
    marginBottom: theme.spacing.sm,
  },
  card: {
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.light.border,
    ...theme.shadows.sm,
  },
  avatarContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  customerName: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: theme.spacing.xs,
    color: Colors.light.text,
  },
  customerEmail: {
    color: Colors.light.textSecondary,
    fontSize: theme.fontSize.xxs,
    textAlign: 'center',
    marginBottom: theme.spacing.xs,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.xs,
    width: '100%',
    gap: 4,
  },
  infoText: {
    color: Colors.light.textSecondary,
    fontSize: theme.fontSize.xxs,
    flex: 1,
    minWidth: 0,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing.xs,
    gap: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusDotActive: {
    backgroundColor: Colors.light.success,
  },
  statusDotInactive: {
    backgroundColor: Colors.light.error,
  },
  statusText: {
    fontSize: theme.fontSize.xxs,
    color: Colors.light.textSecondary,
  },
  statusTextActive: {
    color: Colors.light.success,
    fontWeight: '600',
  },
  statusTextInactive: {
    color: Colors.light.error,
    fontWeight: '600',
  },
});
