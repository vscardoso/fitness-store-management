import { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  Image,
  Text as RNText,
} from 'react-native';
import { Text, Button, Card } from 'react-native-paper';
import { useRouter, useFocusEffect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import PageHeader from '@/components/layout/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import FAB from '@/components/FAB';
import { listLooks } from '@/services/lookService';
import { Colors, theme } from '@/constants/Colors';
import { formatCurrency } from '@/utils/format';
import type { LookList } from '@/types/look';

export default function LooksScreen() {
  const router = useRouter();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const {
    data: looks = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['looks'],
    queryFn: () => listLooks({ limit: 100 }),
  });

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  };

  const renderLook = ({ item }: { item: LookList }) => (
    <TouchableOpacity
      onPress={() => router.push(`/looks/${item.id}`)}
      activeOpacity={0.7}
    >
      <Card style={styles.card}>
        <Card.Content style={styles.cardContent}>
          <View style={styles.iconContainer}>
            <Ionicons name="shirt" size={32} color={Colors.light.primary} />
          </View>

          <View style={styles.infoContainer}>
            <Text variant="titleMedium" style={styles.name} numberOfLines={1}>
              {item.name}
            </Text>
            {item.description && (
              <Text variant="bodySmall" style={styles.description} numberOfLines={1}>
                {item.description}
              </Text>
            )}
            <View style={styles.badgeRow}>
              <View style={styles.badge}>
                <Ionicons name="layers" size={10} color="#fff" />
                <RNText style={styles.badgeText}>{item.items_count} peças</RNText>
              </View>
              {item.discount_percentage > 0 && (
                <View style={[styles.badge, styles.badgeDiscount]}>
                  <Ionicons name="pricetag" size={10} color="#fff" />
                  <RNText style={styles.badgeText}>{item.discount_percentage}% off</RNText>
                </View>
              )}
            </View>
            <Text variant="titleSmall" style={styles.price}>
              {item.total_price > 0 ? formatCurrency(item.total_price) : '—'}
            </Text>
          </View>

          <View style={styles.rightContainer}>
            <View style={[styles.publicBadge, !item.is_public && styles.privateBadge]}>
              <RNText style={styles.publicText}>
                {item.is_public ? 'Público' : 'Privado'}
              </RNText>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.light.textTertiary} />
          </View>
        </Card.Content>
      </Card>
    </TouchableOpacity>
  );

  if (isLoading) {
    return (
      <View style={styles.container}>
        <PageHeader title="Looks" subtitle="0 looks" />
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.light.primary} />
          <Text style={styles.loadingText}>Carregando looks...</Text>
        </View>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.container}>
        <PageHeader title="Looks" subtitle="0 looks" />
        <EmptyState
          icon="alert-circle-outline"
          title="Erro ao carregar looks"
          description="Verifique sua conexão e tente novamente"
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <PageHeader
        title="Looks"
        subtitle={`${looks.length} ${looks.length === 1 ? 'look' : 'looks'}`}
        rightActions={[
          {
            icon: 'analytics-outline',
            onPress: () => router.push('/wishlist'),
          },
        ]}
      />

      <View style={styles.actionsContainer}>
        <View style={styles.actionsRow}>
          <Button
            mode="contained-tonal"
            onPress={() => router.push('/wishlist')}
            style={styles.actionButton}
            labelStyle={styles.actionButtonLabel}
            contentStyle={styles.actionButtonContent}
          >
            <View style={styles.buttonContent}>
              <Ionicons name="heart-outline" size={16} color={Colors.light.textSecondary} />
              <Text style={styles.buttonText}>Wishlist / Demanda</Text>
            </View>
          </Button>
        </View>
      </View>

      <FlatList
        data={looks}
        renderItem={renderLook}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            colors={[Colors.light.primary]}
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon="shirt-outline"
            title="Nenhum look criado"
            description="Monte looks para sugerir combinações aos clientes"
          />
        }
      />

      <FAB directRoute="/looks/builder" />
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
  loadingText: {
    marginTop: 16,
    color: Colors.light.icon,
  },
  actionsContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  actionButton: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: Colors.light.card,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  actionButtonLabel: { marginVertical: 0, marginHorizontal: 0 },
  actionButtonContent: { paddingHorizontal: 8, paddingVertical: 10, height: 'auto' },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  buttonText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.light.textSecondary,
  },
  listContent: {
    paddingTop: 8,
    paddingBottom: 80,
  },
  card: {
    marginBottom: 12,
    borderRadius: theme.borderRadius.lg,
    elevation: 1,
    marginHorizontal: 16,
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: theme.borderRadius.full,
    backgroundColor: `${Colors.light.primary}15`,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  infoContainer: {
    flex: 1,
    marginRight: 12,
  },
  name: {
    fontWeight: '600',
    marginBottom: 2,
  },
  description: {
    color: Colors.light.textSecondary,
    fontSize: 11,
    marginBottom: 6,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 6,
    flexWrap: 'wrap',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.primary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    gap: 4,
  },
  badgeDiscount: {
    backgroundColor: Colors.light.success,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  price: {
    color: Colors.light.primary,
    fontWeight: '700',
  },
  rightContainer: {
    alignItems: 'center',
    gap: 6,
  },
  publicBadge: {
    backgroundColor: `${Colors.light.success}20`,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  privateBadge: {
    backgroundColor: `${Colors.light.textSecondary}20`,
  },
  publicText: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.light.textSecondary,
  },
});
