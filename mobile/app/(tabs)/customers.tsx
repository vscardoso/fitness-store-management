import { useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Text,
  Searchbar,
  FAB,
  Card,
} from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import { Ionicons } from '@expo/vector-icons';
import ListHeader from '@/components/layout/ListHeader';
import EmptyState from '@/components/ui/EmptyState';
import { getCustomers } from '@/services/customerService';
import { formatPhone } from '@/utils/format';
import { Colors } from '@/constants/Colors';
import type { Customer } from '@/types';

export default function CustomersScreen() {
  const router = useRouter();
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
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.container}>
          <ListHeader
            title="Clientes"
            count={0}
            singularLabel="cliente"
            pluralLabel="clientes"
            showCount={false}
          />
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={Colors.light.primary} />
            <Text style={styles.loadingText}>Carregando clientes...</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  /**
   * Renderizar erro
   */
  if (isError) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.container}>
          <ListHeader
            title="Clientes"
            count={0}
            singularLabel="cliente"
            pluralLabel="clientes"
            showCount={false}
          />
          <EmptyState
            icon="alert-circle-outline"
            title="Erro ao carregar clientes"
            description="Verifique sua conexão e tente novamente"
          />
        </View>
      </SafeAreaView>
    );
  }

  const customerCount = filteredCustomers?.length || 0;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.container}>
        {/* Header com contador */}
        <ListHeader
          title="Clientes"
          count={customerCount}
          singularLabel="cliente"
          pluralLabel="clientes"
        />

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
        <FAB
          icon="plus"
          style={styles.fab}
          onPress={() => router.push('/customers/add')}
          label="Adicionar"
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.light.primary,
  },
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
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
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    backgroundColor: Colors.light.primary,
  },
});
