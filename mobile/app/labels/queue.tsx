import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import PageHeader from '@/components/layout/PageHeader';
import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { listPrintJobs, statusColor, statusLabel } from '@/services/printService';
import type { PrintJob } from '@/types/printer';

export default function PrintQueueScreen() {
  const router = useRouter();
  const brandingColors = useBrandingColors();

  const headerScale = useSharedValue(0.94);
  const headerOpacity = useSharedValue(0);
  const contentTranslate = useSharedValue(24);
  const contentOpacity = useSharedValue(0);

  useFocusEffect(
    useCallback(() => {
      headerScale.value = withSpring(1, { damping: 18, stiffness: 200 });
      headerOpacity.value = withTiming(1, { duration: 200 });
      contentTranslate.value = withTiming(0, { duration: 300, delay: 140 } as any);
      contentOpacity.value = withTiming(1, { duration: 300, delay: 140 } as any);
    }, [])
  );

  const headerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: headerScale.value }],
    opacity: headerOpacity.value,
  }));
  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: contentTranslate.value }],
    opacity: contentOpacity.value,
  }));

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['print-jobs', 'all'],
    queryFn: () => listPrintJobs({ limit: 100 }),
    refetchInterval: 5000,
  });

  const jobs = data?.items ?? [];

  const renderItem = ({ item }: { item: PrintJob }) => (
    <View style={styles.card}>
      <View style={[styles.statusBar, { backgroundColor: statusColor(item.status) }]} />
      <View style={styles.cardBody}>
        <View style={styles.cardHeader}>
          <Text style={styles.productName} numberOfLines={1}>
            {item.product_name ?? 'Produto'}
          </Text>
          <View style={[styles.badge, { backgroundColor: statusColor(item.status) + '22' }]}>
            <Text style={[styles.badgeText, { color: statusColor(item.status) }]}>
              {statusLabel(item.status).toUpperCase()}
            </Text>
          </View>
        </View>

        <Text style={styles.meta}>
          {[item.variant_label, item.sku].filter(Boolean).join(' · ')}
        </Text>

        <View style={styles.footer}>
          <Text style={styles.footerLeft}>
            {item.quantity}x etiqueta{item.quantity !== 1 ? 's' : ''}
            {item.show_price && item.price ? ` · ${item.price}` : ''}
          </Text>
          <Text style={styles.footerRight}>
            {new Date(item.created_at).toLocaleString('pt-BR', {
              day: '2-digit',
              month: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        </View>

        {item.error_message ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{item.error_message}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <Animated.View style={headerStyle}>
        <PageHeader
          title="Histórico de Impressão"
          subtitle={`${jobs.length} job${jobs.length !== 1 ? 's' : ''}`}
          showBackButton
          onBack={() => router.back()}
        />
      </Animated.View>

      <Animated.View style={[{ flex: 1 }, contentStyle]}>
        {isLoading ? (
          <ActivityIndicator
            color={brandingColors.primary}
            size="large"
            style={{ marginTop: 48 }}
          />
        ) : (
          <FlatList
            data={jobs}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            onRefresh={refetch}
            refreshing={isLoading}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyIcon}>📋</Text>
                <Text style={styles.emptyTitle}>Nenhum job encontrado</Text>
                <Text style={styles.emptySub}>
                  As impressões realizadas aparecem aqui
                </Text>
              </View>
            }
          />
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  list: {
    padding: theme.spacing.md,
    paddingBottom: theme.spacing.xxl,
    gap: theme.spacing.sm,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    overflow: 'hidden',
    ...theme.shadows.sm,
  },
  statusBar: { width: 4 },
  cardBody: { flex: 1, padding: theme.spacing.md },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  productName: {
    flex: 1,
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: Colors.light.text,
    marginRight: theme.spacing.sm,
  },
  badge: {
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: { fontSize: theme.fontSize.xxs, fontWeight: '700' },
  meta: {
    fontSize: theme.fontSize.xs,
    color: Colors.light.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerLeft: {
    fontSize: theme.fontSize.xs,
    color: Colors.light.textSecondary,
    fontWeight: '600',
  },
  footerRight: {
    fontSize: theme.fontSize.xxs,
    color: Colors.light.textTertiary,
  },
  errorBox: {
    backgroundColor: '#EF444418',
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  errorText: {
    fontSize: theme.fontSize.xs,
    color: '#EF4444',
  },
  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyIcon: { fontSize: 48, marginBottom: theme.spacing.md },
  emptyTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    color: Colors.light.text,
  },
  emptySub: {
    fontSize: theme.fontSize.sm,
    color: Colors.light.textSecondary,
    textAlign: 'center',
    marginTop: theme.spacing.xs,
  },
});
