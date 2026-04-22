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
  Text,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import PageHeader from '@/components/layout/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import { getDemandReport } from '@/services/wishlistService';
import { Colors, VALUE_COLORS, theme } from '@/constants/Colors';
import { getImageUrl } from '@/constants/Config';
import { formatCurrency } from '@/utils/format';
import { useBrandingColors } from '@/store/brandingStore';
import type { DemandItem } from '@/types/look';

export default function DemandScreen() {
  const brandingColors = useBrandingColors();
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
  const totalWaiting = items.reduce((acc, i) => acc + i.waiting_count, 0);

  const renderItem = ({ item }: { item: DemandItem }) => (
    <View style={styles.card}>
      <View style={styles.cardContent}>
        <View style={styles.iconContainer}>
          {item.product_image_url ? (
            <Image
              source={{ uri: getImageUrl(item.product_image_url) }}
              style={styles.productImage}
              resizeMode="cover"
            />
          ) : (
            <Ionicons name="cube" size={28} color={brandingColors.primary} />
          )}
        </View>

        <View style={styles.infoContainer}>
          <Text style={styles.productName} numberOfLines={1}>
            {item.product_name}
          </Text>
          {item.variant_description && (
            <Text style={styles.variantText}>{item.variant_description}</Text>
          )}
          <Text style={styles.revenueText} numberOfLines={1}>
            Potencial: {formatCurrency(item.potential_revenue)}
          </Text>
        </View>

        <View style={[styles.waitingBadge, { backgroundColor: brandingColors.primary + '15' }]}>
          <Ionicons name="people" size={12} color={brandingColors.primary} />
          <Text style={[styles.waitingText, { color: brandingColors.primary }]}>{item.waiting_count}</Text>
        </View>
      </View>
    </View>
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
        <View style={styles.summaryCard}>
          <View style={styles.summaryHeader}>
            <View style={[styles.summaryIcon, { backgroundColor: brandingColors.primary + '15' }]}>
              <Ionicons name="trending-up-outline" size={16} color={brandingColors.primary} />
            </View>
            <Text style={styles.summaryTitle}>Resumo da Demanda</Text>
          </View>

          <View style={styles.summaryContent}>
            <View style={styles.summaryColumn}>
              <Text style={styles.summaryLabel}>Receita Potencial</Text>
              <Text style={[styles.summaryValue, { color: VALUE_COLORS.positive }]}>{formatCurrency(totalRevenue)}</Text>
            </View>
            <View style={styles.summaryColumn}>
              <Text style={styles.summaryLabel}>Produtos</Text>
              <Text style={styles.summaryValue}>{items.length}</Text>
            </View>
            <View style={styles.summaryColumn}>
              <Text style={styles.summaryLabel}>Clientes</Text>
              <Text style={styles.summaryValue}>{totalWaiting}</Text>
            </View>
          </View>

          <View style={styles.moduleBadge}>
            <Ionicons name="sparkles-outline" size={13} color={Colors.light.textSecondary} />
            <Text style={styles.moduleBadgeText}>Ordenado por maior demanda potencial</Text>
          </View>
        </View>
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
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.card,
    ...theme.shadows.sm,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
  },
  summaryIcon: {
    width: 28,
    height: 28,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: Colors.light.text,
  },
  summaryContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  summaryColumn: {
    flex: 1,
    minWidth: 0,
  },
  summaryLabel: {
    fontSize: 11,
    color: Colors.light.textSecondary,
    textAlign: 'left',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  summaryValue: {
    marginTop: 2,
    fontSize: theme.fontSize.lg,
    fontWeight: '800',
    color: Colors.light.text,
    letterSpacing: -0.4,
  },
  moduleBadge: {
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.md,
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.backgroundSecondary,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  moduleBadgeText: {
    fontSize: theme.fontSize.xs,
    color: Colors.light.textSecondary,
    fontWeight: '600',
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
    paddingBottom: theme.spacing.xxl,
  },
  card: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.card,
    ...theme.shadows.sm,
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
    color: VALUE_COLORS.positive,
    fontWeight: '600',
    marginTop: 4,
  },
  waitingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.light.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  waitingText: {
    fontWeight: '700',
    fontSize: 14,
  },
});
