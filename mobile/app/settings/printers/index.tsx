import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  ActivityIndicator,
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
import { LinearGradient } from 'expo-linear-gradient';

import PageHeader from '@/components/layout/PageHeader';
import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import {
  listPrinters,
  deletePrinter,
  testPrinter,
  updatePrinter,
  connectionLabel,
} from '@/services/printService';
import type { LabelPrinter } from '@/types/printer';

export default function PrintersScreen() {
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

  const { data, isLoading } = useQuery({
    queryKey: ['label-printers'],
    queryFn: listPrinters,
  });

  const deleteMutation = useMutation({
    mutationFn: deletePrinter,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['label-printers'] }),
  });

  const testMutation = useMutation({
    mutationFn: testPrinter,
    onSuccess: (result) => {
      Alert.alert(
        result.success ? 'Teste enviado' : 'Falha no teste',
        result.message
      );
    },
    onError: (e: any) => Alert.alert('Erro', e.message),
  });

  const setDefaultMutation = useMutation({
    mutationFn: ({ id }: { id: number }) =>
      updatePrinter(id, { is_default: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['label-printers'] }),
  });

  const handleDelete = (printer: LabelPrinter) => {
    Alert.alert(
      'Remover impressora',
      `Remover "${printer.name}" das impressoras configuradas?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: () => deleteMutation.mutate(printer.id),
        },
      ]
    );
  };

  const printers = data?.items ?? [];

  const renderItem = ({ item }: { item: LabelPrinter }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardLeft}>
          <View style={styles.iconBox}>
            <Text style={styles.icon}>🖨</Text>
          </View>
          <View>
            <View style={styles.nameRow}>
              <Text style={styles.printerName} numberOfLines={1}>
                {item.name}
              </Text>
              {item.is_default && (
                <View style={styles.defaultBadge}>
                  <Text style={styles.defaultText}>PADRÃO</Text>
                </View>
              )}
            </View>
            <Text style={styles.model}>{item.model}</Text>
            <Text style={styles.connection}>{connectionLabel(item)}</Text>
            <Text style={styles.labelSize}>
              {item.label_width_mm}×{item.label_height_mm}mm · {item.dpi}dpi
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.cardActions}>
        {!item.is_default && (
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => setDefaultMutation.mutate({ id: item.id })}
            activeOpacity={0.7}
          >
            <Text style={styles.actionBtnText}>Definir padrão</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => testMutation.mutate(item.id)}
          activeOpacity={0.7}
          disabled={testMutation.isPending}
        >
          <Text style={styles.actionBtnText}>
            {testMutation.isPending ? 'Testando...' : 'Testar'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, styles.deleteBtn]}
          onPress={() => handleDelete(item)}
          activeOpacity={0.7}
        >
          <Text style={styles.deleteBtnText}>Remover</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <Animated.View style={headerStyle}>
        <PageHeader
          title="Impressoras de Etiqueta"
          subtitle="Elgin L42 Pro e compatíveis ZPL"
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
            data={printers}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyIcon}>🖨</Text>
                <Text style={styles.emptyTitle}>Nenhuma impressora</Text>
                <Text style={styles.emptySub}>
                  Cadastre a Elgin L42 Pro para imprimir etiquetas
                </Text>
              </View>
            }
          />
        )}
      </Animated.View>

      {/* FAB — Adicionar impressora */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/settings/printers/new')}
        activeOpacity={0.8}
      >
        <LinearGradient
          colors={brandingColors.gradient as [string, string]}
          style={styles.fabGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Text style={styles.fabText}>+ Adicionar</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  list: {
    padding: theme.spacing.md,
    paddingBottom: 100,
    gap: theme.spacing.sm,
  },
  card: {
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: theme.spacing.md,
    ...theme.shadows.sm,
  },
  cardHeader: { marginBottom: theme.spacing.md },
  cardLeft: { flexDirection: 'row', alignItems: 'flex-start' },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: Colors.light.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.spacing.sm,
  },
  icon: { fontSize: 24 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  printerName: {
    fontSize: theme.fontSize.base,
    fontWeight: '700',
    color: Colors.light.text,
    maxWidth: 180,
  },
  defaultBadge: {
    backgroundColor: '#10B98122',
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  defaultText: { fontSize: theme.fontSize.xxs, fontWeight: '700', color: '#10B981' },
  model: {
    fontSize: theme.fontSize.sm,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  connection: {
    fontSize: theme.fontSize.xs,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  labelSize: {
    fontSize: theme.fontSize.xs,
    color: Colors.light.textTertiary,
    marginTop: 2,
  },
  cardActions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
    paddingTop: theme.spacing.sm,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: theme.borderRadius.md,
    backgroundColor: Colors.light.background,
    alignItems: 'center',
  },
  actionBtnText: {
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
    color: Colors.light.text,
  },
  deleteBtn: { backgroundColor: '#EF444412' },
  deleteBtnText: {
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
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
    paddingHorizontal: theme.spacing.xl,
  },
  fab: {
    position: 'absolute',
    bottom: theme.spacing.xl,
    right: theme.spacing.md,
    borderRadius: theme.borderRadius.xxl,
    overflow: 'hidden',
    ...theme.shadows.sm,
  },
  fabGradient: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm + 4,
    borderRadius: theme.borderRadius.xxl,
  },
  fabText: { color: '#fff', fontWeight: '700', fontSize: theme.fontSize.base },
});
