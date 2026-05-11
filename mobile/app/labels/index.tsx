import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import PageHeader from '@/components/layout/PageHeader';
import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { listPrintJobs, listPrinters, statusColor, statusLabel } from '@/services/printService';
import type { PrintJob, LabelPrinter } from '@/types/printer';

export default function LabelsHubScreen() {
  const router = useRouter();
  const qc = useQueryClient();
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

  const { data: printersData } = useQuery({
    queryKey: ['label-printers'],
    queryFn: listPrinters,
  });

  const { data: jobsData, isLoading: jobsLoading } = useQuery({
    queryKey: ['print-jobs'],
    queryFn: () => listPrintJobs({ limit: 20 }),
  });

  const defaultPrinter = printersData?.items.find((p) => p.is_default) ?? printersData?.items[0];
  const recentJobs = jobsData?.items ?? [];

  const renderJobItem = ({ item }: { item: PrintJob }) => (
    <View style={styles.jobCard}>
      <View style={styles.jobLeft}>
        <Text style={styles.jobName} numberOfLines={1}>
          {item.product_name ?? 'Produto'}
        </Text>
        <Text style={styles.jobMeta}>
          {item.variant_label ? `${item.variant_label} · ` : ''}
          {item.sku ?? ''} · {item.quantity}x
        </Text>
        {item.error_message ? (
          <Text style={styles.jobError} numberOfLines={2}>
            {item.error_message}
          </Text>
        ) : null}
      </View>
      <View style={[styles.statusBadge, { backgroundColor: statusColor(item.status) + '22' }]}>
        <Text style={[styles.statusText, { color: statusColor(item.status) }]}>
          {statusLabel(item.status).toUpperCase()}
        </Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <Animated.View style={headerStyle}>
        <PageHeader
          title="Impressão de Etiquetas"
          subtitle={defaultPrinter ? defaultPrinter.name : 'Nenhuma impressora configurada'}
          showBackButton
          onBack={() => router.back()}
          rightActions={[{
            icon: 'settings-outline',
            onPress: () => router.push('/settings/printers'),
          }]}
        />
      </Animated.View>

      <Animated.View style={[styles.content, contentStyle]}>
        {/* Status da impressora padrão */}
        <View style={styles.printerCard}>
          <View style={styles.printerIcon}>
            <Text style={styles.printerIconText}>🖨</Text>
          </View>
          <View style={styles.printerInfo}>
            <Text style={styles.printerName}>
              {defaultPrinter?.name ?? 'Elgin L42 Pro'}
            </Text>
            <Text style={styles.printerMeta}>
              {defaultPrinter
                ? `${defaultPrinter.label_width_mm}×${defaultPrinter.label_height_mm}mm · ${defaultPrinter.connection_type.toUpperCase()}`
                : 'Configure uma impressora nas configurações'}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.configBtn, { borderColor: brandingColors.primary }]}
            onPress={() => router.push('/settings/printers')}
            activeOpacity={0.7}
          >
            <Text style={[styles.configBtnText, { color: brandingColors.primary }]}>
              Configurar
            </Text>
          </TouchableOpacity>
        </View>

        {/* Ações rápidas */}
        <Text style={styles.sectionTitle}>ACESSO RÁPIDO</Text>
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/products')}
            activeOpacity={0.7}
          >
            <Text style={styles.actionIcon}>📦</Text>
            <Text style={styles.actionLabel}>Produtos</Text>
            <Text style={styles.actionSub}>Selecionar e imprimir</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/labels/queue')}
            activeOpacity={0.7}
          >
            <Text style={styles.actionIcon}>📋</Text>
            <Text style={styles.actionLabel}>Histórico</Text>
            <Text style={styles.actionSub}>Jobs recentes</Text>
          </TouchableOpacity>
        </View>

        {/* Jobs recentes */}
        <Text style={styles.sectionTitle}>ÚLTIMAS IMPRESSÕES</Text>
        {jobsLoading ? (
          <ActivityIndicator color={brandingColors.primary} style={{ marginTop: 24 }} />
        ) : (
          <FlatList
            data={recentJobs}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderJobItem}
            scrollEnabled={false}
            contentContainerStyle={{ gap: theme.spacing.sm }}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyIcon}>🖨</Text>
                <Text style={styles.emptyTitle}>Nenhuma impressão ainda</Text>
                <Text style={styles.emptySub}>
                  Selecione um produto e imprima a etiqueta
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
  content: { flex: 1, padding: theme.spacing.md },
  printerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
    ...theme.shadows.sm,
  },
  printerIcon: { marginRight: theme.spacing.sm },
  printerIconText: { fontSize: 28 },
  printerInfo: { flex: 1 },
  printerName: {
    fontSize: theme.fontSize.base,
    fontWeight: '700',
    color: Colors.light.text,
  },
  printerMeta: {
    fontSize: theme.fontSize.sm,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  configBtn: {
    borderWidth: 1,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
  },
  configBtnText: { fontSize: theme.fontSize.xs, fontWeight: '600' },
  sectionTitle: {
    fontSize: theme.fontSize.xxs,
    fontWeight: '600',
    color: Colors.light.textTertiary,
    letterSpacing: 0.5,
    marginBottom: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.lg,
  },
  actionCard: {
    flex: 1,
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: theme.spacing.md,
    alignItems: 'center',
    ...theme.shadows.sm,
  },
  actionIcon: { fontSize: 28, marginBottom: theme.spacing.xs },
  actionLabel: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: Colors.light.text,
  },
  actionSub: {
    fontSize: theme.fontSize.xxs,
    color: Colors.light.textSecondary,
    marginTop: 2,
    textAlign: 'center',
  },
  jobCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: theme.spacing.md,
    ...theme.shadows.sm,
  },
  jobLeft: { flex: 1 },
  jobName: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: Colors.light.text,
  },
  jobMeta: {
    fontSize: theme.fontSize.xs,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  jobError: {
    fontSize: theme.fontSize.xs,
    color: '#EF4444',
    marginTop: 4,
  },
  statusBadge: {
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginLeft: theme.spacing.sm,
  },
  statusText: { fontSize: theme.fontSize.xxs, fontWeight: '700' },
  empty: { alignItems: 'center', paddingVertical: theme.spacing.xl },
  emptyIcon: { fontSize: 40, marginBottom: theme.spacing.sm },
  emptyTitle: {
    fontSize: theme.fontSize.base,
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
