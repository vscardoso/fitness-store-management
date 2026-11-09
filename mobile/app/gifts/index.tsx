/** Brindes dados: lista com o custo para a loja. Só administrador. */
import React from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';

import PageHeader from '@/components/layout/PageHeader';
import FAB from '@/components/FAB';
import ScreenLoader from '@/components/ui/ScreenLoader';
import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { useDesktopContentStyle, useIsDesktop } from '@/hooks/useLayout';
import { useAuth } from '@/hooks/useAuth';
import { isAdminRole } from '@/utils/roles';
import { formatCurrency, formatDate } from '@/utils/format';
import { parseApiError } from '@/utils/apiError';
import { getGifts, type Gift } from '@/services/giftService';

export default function GiftsScreen() {
  const router = useRouter();
  const brand = useBrandingColors();
  const desktop = useDesktopContentStyle();
  const isDesktop = useIsDesktop();
  const { user } = useAuth();
  const admin = isAdminRole(user?.role);
  const { data, isLoading, isRefetching, refetch, error } = useQuery({ queryKey: ['gifts'], queryFn: () => getGifts({ limit: 100 }), enabled: admin });

  const renderItem = ({ item }: { item: Gift }) => {
    const cancelled = item.status === 'cancelled';
    const pieces = item.items.reduce((n, i) => n + i.quantity - i.quantity_returned, 0);
    return (
      <TouchableOpacity style={styles.card} activeOpacity={0.75} onPress={() => router.push(`/gifts/${item.id}` as any)}>
        <View style={[styles.icon, { backgroundColor: brand.primary + '20' }]}>
          <Ionicons name="gift-outline" size={22} color={brand.primary} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.name} numberOfLines={1}>{item.recipient || 'Sem nome'}</Text>
          <Text style={styles.meta} numberOfLines={1}>
            {formatDate(item.created_at ?? '')} · {item.reason_label} · {pieces} peça{pieces === 1 ? '' : 's'}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[styles.cost, cancelled && { color: Colors.light.textTertiary, textDecorationLine: 'line-through' }]}>{formatCurrency(cancelled ? item.total_cost : item.net_cost)}</Text>
          <Text style={styles.small}>{cancelled ? 'cancelado' : 'custo para a loja'}</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={Colors.light.textTertiary} />
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <PageHeader
        title="Brindes"
        subtitle={data ? `${data.total_count} brinde${data.total_count === 1 ? '' : 's'} · custo ${formatCurrency(data.page_cost)}` : 'Peças dadas sem cobrança'}
        showBackButton hideBackOnDesktop backFallback="/(tabs)/more"
      />
      <View style={[{ flex: 1 }, desktop]}>
        {!admin ? (
          <View style={styles.empty}><Text style={styles.emptyTitle}>Só o administrador vê os brindes.</Text></View>
        ) : isLoading ? (
          <ScreenLoader message="Carregando brindes..." />
        ) : (
          <FlatList
            data={data?.items ?? []}
            keyExtractor={(g) => String(g.id)}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} colors={[brand.primary]} />}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Ionicons name="gift-outline" size={56} color={Colors.light.textTertiary} />
                <Text style={styles.emptyTitle}>{error ? parseApiError(error) || 'Não foi possível carregar.' : 'Nenhum brinde dado ainda'}</Text>
                {!error && <Text style={styles.emptySub}>Quando você der uma peça sem cobrança, ela aparece aqui com o custo para a loja.</Text>}
              </View>
            }
          />
        )}
        {admin && (isDesktop ? <FAB onPress={() => router.push('/gifts/new' as any)} label="Dar um brinde" /> : <FAB directRoute="/gifts/new" />)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.backgroundSecondary },
  list: { padding: theme.spacing.md, paddingBottom: theme.spacing.xxl + 60 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, backgroundColor: Colors.light.card, borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.md, marginBottom: theme.spacing.sm, borderWidth: 1, borderColor: Colors.light.border,
  },
  icon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 15, fontWeight: '600', color: Colors.light.text },
  meta: { fontSize: theme.fontSize.xs, color: Colors.light.textSecondary, marginTop: 2 },
  cost: { fontSize: 15, fontWeight: '700', color: Colors.light.text },
  small: { fontSize: 11, color: Colors.light.textSecondary },
  empty: { alignItems: 'center', padding: theme.spacing.xl, gap: theme.spacing.sm },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: Colors.light.text, textAlign: 'center' },
  emptySub: { fontSize: theme.fontSize.sm, color: Colors.light.textSecondary, textAlign: 'center' },
});
