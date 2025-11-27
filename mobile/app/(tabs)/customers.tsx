import { useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Searchbar, Text, Card } from 'react-native-paper';
import { useRouter } from 'expo-router';
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

  /**
   * Filtrar clientes por busca
   */
  const filteredCustomers = customers?.filter((customer: Customer) => {
    const search = searchQuery.toLowerCase();
    return (
      customer.full_name.toLowerCase().includes(search) ||
      customer.email?.toLowerCase().includes(search) ||
      customer.phone?.includes(search) ||
      customer.document_number?.includes(search)
    );
  });

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
              <Ionicons name="call-outline" size={14} color="#666" />
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
            colors={['#667eea', '#764ba2']}
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
            colors={['#667eea', '#764ba2']}
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
          colors={['#667eea', '#764ba2']}
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

        {/* Barra de busca */}
        <Searchbar
          placeholder="Buscar por nome, email, telefone..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          style={styles.searchbar}
        />

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
    margin: 16,
    elevation: 2,
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
  },
  // Email compacto
  customerEmail: {
    color: '#666',
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
    color: '#666',
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
    backgroundColor: '#2e7d32',
  },
  statusDotInactive: {
    backgroundColor: '#c62828',
  },
  statusText: {
    fontSize: 10,
  },
  statusTextActive: {
    color: '#2e7d32',
  },
  statusTextInactive: {
    color: '#c62828',
  },
});
