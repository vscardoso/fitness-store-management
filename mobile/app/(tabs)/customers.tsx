import { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Searchbar, Text, Card } from 'react-native-paper';
import { useRouter, useFocusEffect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/hooks/useAuth';
import EmptyState from '@/components/ui/EmptyState';
import FAB from '@/components/FAB';
import { getCustomers } from '@/services/customerService';
import { formatPhone } from '@/utils/format';
import { Colors, theme } from '@/constants/Colors';
import type { Customer } from '@/types';

export default function CustomersScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  // Query: Lista de clientes
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

  // Auto-refresh quando a tela recebe foco
  useFocusEffect(
    useCallback(() => {
      if (isAuthenticated) {
        refetch();
      }
    }, [isAuthenticated, refetch])
  );

  /**
   * Filtrar clientes por busca e status
   */
  const filteredCustomers = customers?.filter((customer: Customer) => {
    // Filtro de busca
    const search = searchQuery.toLowerCase();
    const matchesSearch =
      customer.full_name.toLowerCase().includes(search) ||
      customer.email?.toLowerCase().includes(search) ||
      customer.phone?.includes(search) ||
      customer.document_number?.includes(search);

    // Filtro de status
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && customer.is_active) ||
      (statusFilter === 'inactive' && !customer.is_active);

    return matchesSearch && matchesStatus;
  });

  /**
   * Contar clientes por status
   */
  const activeCount = customers?.filter((c: Customer) => c.is_active).length || 0;
  const inactiveCount = customers?.filter((c: Customer) => !c.is_active).length || 0;
  const totalCount = customers?.length || 0;

  /**
   * Renderizar card de cliente (layout compacto)
   */
  const renderCustomer = ({ item }: { item: Customer }) => (
    <TouchableOpacity
      style={styles.cardWrapper}
      onPress={() => router.push(`/customers/${item.id}`)}
      activeOpacity={0.7}
    >
      <Card style={styles.card}>
        <Card.Content style={styles.cardContent}>
          {/* Avatar */}
          <View style={styles.avatarContainer}>
            <Ionicons name="person" size={24} color={Colors.light.primary} />
          </View>

          {/* Nome */}
          <Text variant="titleSmall" style={styles.customerName} numberOfLines={2}>
            {item.full_name}
          </Text>

          {/* Email */}
          {item.email && (
            <Text variant="bodySmall" style={styles.customerEmail} numberOfLines={1}>
              {item.email}
            </Text>
          )}

          {/* Telefone */}
          {item.phone && (
            <View style={styles.infoRow}>
              <Ionicons name="call-outline" size={14} color={Colors.light.textSecondary} />
              <Text variant="bodySmall" style={styles.infoText} numberOfLines={1}>
                {formatPhone(item.phone)}
              </Text>
            </View>
          )}

          {/* Status badge */}
          <View style={styles.statusBadge}>
            <View
              style={[
                styles.statusDot,
                item.is_active ? styles.statusDotActive : styles.statusDotInactive,
              ]}
            />
            <Text
              variant="bodySmall"
              style={[
                styles.statusText,
                item.is_active ? styles.statusTextActive : styles.statusTextInactive,
              ]}
            >
              {item.is_active ? 'Ativo' : 'Inativo'}
            </Text>
          </View>
        </Card.Content>
      </Card>
    </TouchableOpacity>
  );

  /**
   * Renderizar loading
   */
  if (isLoading && !isRefetching) {
    return (
      <View style={styles.container}>
        {/* Header Premium */}
        <View style={styles.headerContainer}>
          <LinearGradient
            colors={[Colors.light.primary, Colors.light.secondary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerGradient}
          >
            <View style={styles.headerContent}>
              <View style={styles.headerInfo}>
                <Text style={styles.greeting}>
                  Clientes
                </Text>
                <Text style={styles.headerSubtitle}>
                  0 clientes
                </Text>
              </View>
              <TouchableOpacity
                style={styles.profileButton}
                onPress={() => router.push('/(tabs)/more')}
              >
                <View style={styles.profileIcon}>
                  <Ionicons name="person" size={24} color="#fff" />
                </View>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </View>

        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.light.primary} />
          <Text style={styles.loadingText}>Carregando clientes...</Text>
        </View>
      </View>
    );
  }

  /**
   * Renderizar erro
   */
  if (isError) {
    return (
      <View style={styles.container}>
        {/* Header Premium */}
        <View style={styles.headerContainer}>
          <LinearGradient
            colors={[Colors.light.primary, Colors.light.secondary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerGradient}
          >
            <View style={styles.headerContent}>
              <View style={styles.headerInfo}>
                <Text style={styles.greeting}>
                  Clientes
                </Text>
                <Text style={styles.headerSubtitle}>
                  0 clientes
                </Text>
              </View>
              <TouchableOpacity
                style={styles.profileButton}
                onPress={() => router.push('/(tabs)/more')}
              >
                <View style={styles.profileIcon}>
                  <Ionicons name="person" size={24} color="#fff" />
                </View>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </View>

        <EmptyState
          icon="alert-circle-outline"
          title="Erro ao carregar clientes"
          description="Verifique sua conexão e tente novamente"
        />
      </View>
    );
  }

  const customerCount = filteredCustomers?.length || 0;

  return (
    <View style={styles.container}>
      {/* Header Premium */}
      <View style={styles.headerContainer}>
        <LinearGradient
          colors={[Colors.light.primary, Colors.light.secondary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerGradient}
        >
          <View style={styles.headerContent}>
            <View style={styles.headerInfo}>
              <Text style={styles.greeting}>
                Clientes
              </Text>
              <Text style={styles.headerSubtitle}>
                {customerCount} {customerCount === 1 ? 'cliente' : 'clientes'}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.profileButton}
              onPress={() => router.push('/(tabs)/more')}
            >
              <View style={styles.profileIcon}>
                <Ionicons name="person" size={24} color="#fff" />
              </View>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </View>

      {/* Estatísticas */}
      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Ativos</Text>
          <Text style={styles.statValue}>{activeCount}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Inativos</Text>
          <Text style={styles.statValue}>{inactiveCount}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Total</Text>
          <Text style={styles.statValue}>{totalCount}</Text>
        </View>
      </View>

      {/* Barra de busca */}
      <Searchbar
        placeholder="Buscar por nome, email, telefone..."
        value={searchQuery}
        onChangeText={setSearchQuery}
        style={styles.searchbar}
      />

      {/* Filtros */}
      <View style={styles.filterContainer}>
        <TouchableOpacity
          style={[
            styles.filterChip,
            statusFilter === 'active' && styles.filterChipActive,
          ]}
          onPress={() => setStatusFilter('active')}
          activeOpacity={0.7}
        >
          <Ionicons
            name="checkmark-circle-outline"
            size={16}
            color={statusFilter === 'active' ? Colors.light.primary : Colors.light.textSecondary}
          />
          <Text
            style={[
              styles.filterChipText,
              statusFilter === 'active' && styles.filterChipTextActive,
            ]}
          >
            Ativos
          </Text>
          <View
            style={[
              styles.filterBadge,
              statusFilter === 'active' && styles.filterBadgeActive,
            ]}
          >
            <Text
              style={[
                styles.filterBadgeText,
                statusFilter === 'active' && styles.filterBadgeTextActive,
              ]}
            >
              {activeCount}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.filterChip,
            statusFilter === 'inactive' && styles.filterChipActive,
          ]}
          onPress={() => setStatusFilter('inactive')}
          activeOpacity={0.7}
        >
          <Ionicons
            name="close-circle-outline"
            size={16}
            color={statusFilter === 'inactive' ? Colors.light.primary : Colors.light.textSecondary}
          />
          <Text
            style={[
              styles.filterChipText,
              statusFilter === 'inactive' && styles.filterChipTextActive,
            ]}
          >
            Inativos
          </Text>
          <View
            style={[
              styles.filterBadge,
              statusFilter === 'inactive' && styles.filterBadgeActive,
            ]}
          >
            <Text
              style={[
                styles.filterBadgeText,
                statusFilter === 'inactive' && styles.filterBadgeTextActive,
              ]}
            >
              {inactiveCount}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.filterChip,
            statusFilter === 'all' && styles.filterChipActive,
          ]}
          onPress={() => setStatusFilter('all')}
          activeOpacity={0.7}
        >
          <Ionicons
            name="people-outline"
            size={16}
            color={statusFilter === 'all' ? Colors.light.primary : Colors.light.textSecondary}
          />
          <Text
            style={[
              styles.filterChipText,
              statusFilter === 'all' && styles.filterChipTextActive,
            ]}
          >
            Todos
          </Text>
          <View
            style={[
              styles.filterBadge,
              statusFilter === 'all' && styles.filterBadgeActive,
            ]}
          >
            <Text
              style={[
                styles.filterBadgeText,
                statusFilter === 'all' && styles.filterBadgeTextActive,
              ]}
            >
              {totalCount}
            </Text>
          </View>
        </TouchableOpacity>
      </View>

        {/* Lista de clientes (grid 2 colunas) */}
        <FlatList
          data={filteredCustomers}
          renderItem={renderCustomer}
          keyExtractor={(item) => item.id.toString()}
          numColumns={2}
          contentContainerStyle={styles.listContent}
          columnWrapperStyle={styles.columnWrapper}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              colors={[Colors.light.primary]}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="people-outline"
              title={searchQuery ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado'}
              description={
                searchQuery
                  ? 'Tente outro termo de busca'
                  : 'Toque no botão + para adicionar'
              }
            />
          }
        />

        {/* FAB - Adicionar cliente */}
        <FAB directRoute="/customers/add" />
      </View>
    );
  }

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.backgroundSecondary,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  // Header Premium
  headerContainer: {
    marginBottom: 0,
  },
  headerGradient: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.xl + 32,
    paddingBottom: theme.spacing.lg,
    borderBottomLeftRadius: theme.borderRadius.xl,
    borderBottomRightRadius: theme.borderRadius.xl,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerInfo: {
    flex: 1,
  },
  greeting: {
    fontSize: theme.fontSize.xxl,
    fontWeight: '700',
    color: '#fff',
    marginBottom: theme.spacing.xs,
  },
  headerSubtitle: {
    fontSize: theme.fontSize.md,
    color: '#fff',
    opacity: 0.9,
  },
  profileButton: {
    marginLeft: theme.spacing.md,
  },
  profileIcon: {
    width: 48,
    height: 48,
    borderRadius: theme.borderRadius.full,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchbar: {
    marginHorizontal: 16,
    marginBottom: 12,
    elevation: 2,
    backgroundColor: Colors.light.card,
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 12,
    marginTop: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.light.card,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    elevation: 1,
  },
  statLabel: {
    fontSize: 11,
    color: Colors.light.textSecondary,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.light.text,
  },
  filterContainer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  filterChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Colors.light.card,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  filterChipActive: {
    backgroundColor: Colors.light.primary + '15',
    borderColor: Colors.light.primary,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.light.textSecondary,
    flexShrink: 1,
  },
  filterChipTextActive: {
    color: Colors.light.primary,
  },
  filterBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.light.backgroundSecondary,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  filterBadgeActive: {
    backgroundColor: Colors.light.primary,
  },
  filterBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.light.textSecondary,
  },
  filterBadgeTextActive: {
    color: '#fff',
  },
  listContent: {
    paddingTop: 8,
    paddingBottom: 80,
  },
  columnWrapper: {
    justifyContent: 'flex-start',
    paddingHorizontal: 8,
  },
  loadingText: {
    marginTop: 16,
    color: Colors.light.icon,
  },
  // Card compacto para grid 2 colunas
  cardWrapper: {
    width: '47%',
    marginHorizontal: 6,
    marginBottom: 12,
  },
  card: {
    borderRadius: 12,
    elevation: 2,
    backgroundColor: Colors.light.card,
  },
  cardContent: {
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  // Avatar centralizado
  avatarContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: `${Colors.light.primary}15`,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  // Nome centralizado
  customerName: {
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 4,
    color: Colors.light.text,
  },
  // Email compacto
  customerEmail: {
    color: Colors.light.textSecondary,
    fontSize: 10,
    textAlign: 'center',
    marginBottom: 4,
  },
  // Info row compacta
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    width: '100%',
  },
  infoText: {
    marginLeft: 4,
    color: Colors.light.textSecondary,
    fontSize: 10,
    flex: 1,
  },
  // Status badge compacto
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 4,
  },
  statusDotActive: {
    backgroundColor: Colors.light.success,
  },
  statusDotInactive: {
    backgroundColor: Colors.light.error,
  },
  statusText: {
    fontSize: 10,
    color: Colors.light.textSecondary,
  },
  statusTextActive: {
    color: Colors.light.success,
  },
  statusTextInactive: {
    color: Colors.light.error,
  },
});
