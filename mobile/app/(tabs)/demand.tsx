/**
 * Tela de Demanda Wishlist — produtos mais desejados pelos clientes.
 * Exclusiva para vendedora/admin. Acessível via Menu.
 */
import { useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Image,
  Text as RNText,
} from 'react-native';
import { Text, Card } from 'react-native-paper';
import { useFocusEffect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import PageHeader from '@/components/layout/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import { getDemandReport } from '@/services/wishlistService';
import { Colors, theme } from '@/constants/Colors';
import { formatCurrency } from '@/utils/format';
import type { DemandItem } from '@/types/look';

export default function DemandScreen() {
  const {
    data: items = [],
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['wishlist-demand'],
    queryFn: getDemandReport,
  });

  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  const totalRevenue = items.reduce((acc, i) => acc + i.potential_revenue, 0);

  const renderItem = ({ item }: { item: DemandItem }) => (
    <Card style={styles.card}>
      <Card.Content style={styles.cardContent}>
        <View style={styles.iconContainer}>
          {item.product_image_url ? (
            <Image
              source={{ uri: item.product_image_url }}
              style={styles.productImage}
              resizeMode="cover"
            />
          ) : (
            <Ionicons name="cube" size={28} color={Colors.light.primary} />
          )}
        </View>

        <View style={styles.infoContainer}>
          <Text style={styles.productName} numberOfLines={1}>
            {item.product_name}
          </Text>
          {item.variant_description && (
            <Text style={styles.variantText}>{item.variant_description}</Text>
          )}
          <Text style={styles.revenueText}>
            Potencial: {formatCurrency(item.potential_revenue)}
          </Text>
        </View>

        <View style={styles.waitingBadge}>
          <Ionicons name="people" size={12} color="#fff" />
          <RNText style={styles.waitingText}>{item.waiting_count}</RNText>
        </View>
      </Card.Content>
    </Card>
  );

  if (isLoading) {
    return (
      <View style={styles.container}>
        <PageHeader title="Demanda Wishlist" subtitle="Carregando..." />
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.light.primary} />
        </View>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.container}>
        <PageHeader title="Demanda Wishlist" />
        <EmptyState
          icon="alert-circle-outline"
          title="Erro ao carregar"
          description="Verifique sua conexão"
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <PageHeader
        title="Demanda Wishlist"
        subtitle={`${items.length} produtos aguardados`}
      />

      {items.length > 0 && (
        <Card style={styles.summaryCard}>
          <Card.Content style={styles.summaryContent}>
            <View>
              <Text style={styles.summaryLabel}>Receita Potencial</Text>
              <Text style={styles.summaryValue}>{formatCurrency(totalRevenue)}</Text>
            </View>
            <View>
              <Text style={styles.summaryLabel}>Produtos</Text>
              <Text style={styles.summaryValue}>{items.length}</Text>
            </View>
            <View>
              <Text style={styles.summaryLabel}>Clientes</Text>
              <Text style={styles.summaryValue}>
                {items.reduce((acc, i) => acc + i.waiting_count, 0)}
              </Text>
            </View>
          </Card.Content>
        </Card>
      )}

      <FlatList
        data={items}
        renderItem={renderItem}
        keyExtractor={(item) => `${item.product_id}-${item.variant_id ?? 'all'}`}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            colors={[Colors.light.primary]}
          />
        }
        ListHeaderComponent={
          items.length > 0 ? (
            <Text style={styles.listHeader}>Ordenado por maior demanda</Text>
          ) : null
        }
        ListEmptyComponent={
          <EmptyState
            icon="heart-outline"
            title="Nenhuma demanda"
            description="Quando clientes adicionarem produtos à wishlist, aparecerão aqui"
          />
        }
      />
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
  },
  summaryCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: theme.borderRadius.lg,
    elevation: 2,
    backgroundColor: `${Colors.light.primary}08`,
  },
  summaryContent: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 8,
  },
  summaryLabel: {
    fontSize: 11,
    color: Colors.light.textSecondary,
    textAlign: 'center',
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.light.primary,
    textAlign: 'center',
  },
  listHeader: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    paddingHorizontal: 16,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  listContent: {
    paddingTop: 4,
    paddingBottom: 40,
  },
  card: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: theme.borderRadius.lg,
    elevation: 1,
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: theme.borderRadius.full,
    backgroundColor: `${Colors.light.primary}15`,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  productImage: {
    width: '100%',
    height: '100%',
  },
  infoContainer: {
    flex: 1,
    marginRight: 8,
  },
  productName: {
    fontWeight: '600',
    fontSize: 14,
  },
  variantText: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  revenueText: {
    fontSize: 12,
    color: Colors.light.primary,
    fontWeight: '600',
    marginTop: 4,
  },
  waitingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.primary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  waitingText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
});
