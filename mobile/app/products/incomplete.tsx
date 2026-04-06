/**
 * Tela de Produtos Incompletos
 *
 * Lista produtos criados no wizard mas abandonados antes de vincular uma entrada.
 * Cada item oferece duas ações:
 *  - "Completar entrada" → abre wizard na etapa 3 com o produto pré-carregado
 *  - "Excluir rascunho"  → soft-delete do produto
 */

import { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import PageHeader from '@/components/layout/PageHeader';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { getIncompleteProducts, deleteProduct, deleteAllIncompleteProducts } from '@/services/productService';
import { Colors, theme } from '@/constants/Colors';
import type { Product } from '@/types';

export default function IncompleteProductsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Product | null>(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);

  const { data: products = [], isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['incomplete-products'],
    queryFn: getIncompleteProducts,
  });

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  const handleComplete = (product: Product) => {
    router.push({
      pathname: '/products/wizard',
      params: {
        restoreStep: 'entry',
        restoreProductData: JSON.stringify(product),
      },
    });
  };

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return;
    const id = confirmDelete.id;
    setConfirmDelete(null);
    setDeletingId(id);
    try {
      await deleteProduct(id);
      queryClient.invalidateQueries({ queryKey: ['incomplete-products'] });
      queryClient.invalidateQueries({ queryKey: ['incomplete-products-count'] });
    } finally {
      setDeletingId(null);
    }
  };

  const handleConfirmDeleteAll = async () => {
    setConfirmDeleteAll(false);
    setDeletingAll(true);
    try {
      await deleteAllIncompleteProducts();
      queryClient.invalidateQueries({ queryKey: ['incomplete-products'] });
      queryClient.invalidateQueries({ queryKey: ['incomplete-products-count'] });
    } finally {
      setDeletingAll(false);
    }
  };

  const renderItem = ({ item }: { item: Product }) => {
    const isDeleting = deletingId === item.id;
    return (
      <View style={styles.card}>
        <View style={styles.cardIcon}>
          <Ionicons name="cube-outline" size={22} color={Colors.light.textSecondary} />
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
          {item.brand ? (
            <Text style={styles.cardMeta}>{item.brand}</Text>
          ) : null}
          <Text style={styles.cardMeta}>SKU: {item.sku || '—'}</Text>
        </View>
        <View style={styles.cardActions}>
          <TouchableOpacity
            style={styles.completeBtn}
            onPress={() => handleComplete(item)}
            activeOpacity={0.8}
            disabled={isDeleting}
          >
            <Ionicons name="add-circle-outline" size={14} color="#fff" />
            <Text style={styles.completeBtnText}>Completar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={() => setConfirmDelete(item)}
            activeOpacity={0.8}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <ActivityIndicator size="small" color={Colors.light.error} />
            ) : (
              <Ionicons name="trash-outline" size={16} color={Colors.light.error} />
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <PageHeader
        title="Produtos incompletos"
        subtitle={`${products.length} sem entrada vinculada`}
        showBackButton
        rightActions={
          products.length > 0
            ? [{ icon: 'trash-outline', onPress: () => setConfirmDeleteAll(true), variant: 'danger' as const }]
            : []
        }
      />

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.light.primary} />
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={40} color={Colors.light.error} />
          <Text style={styles.errorText}>Erro ao carregar. Puxe para tentar novamente.</Text>
        </View>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} colors={[Colors.light.primary]} />
          }
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <View style={styles.emptyIcon}>
                <Ionicons name="checkmark-circle-outline" size={36} color={Colors.light.success} />
              </View>
              <Text style={styles.emptyTitle}>Tudo em ordem!</Text>
              <Text style={styles.emptyDesc}>Nenhum produto aguarda vínculo de entrada.</Text>
            </View>
          }
          ListHeaderComponent={
            products.length > 0 ? (
              <View style={styles.infoBox}>
                <Ionicons name="information-circle-outline" size={16} color="#1D4ED8" />
                <Text style={styles.infoText}>
                  Estes produtos foram criados mas não possuem entrada de estoque. Sem ela, o custo FIFO é zero e a venda não é rastreada corretamente.
                </Text>
              </View>
            ) : null
          }
        />
      )}

      <ConfirmDialog
        visible={!!confirmDelete}
        title="Excluir rascunho?"
        message={`"${confirmDelete?.name}" será removido. Esta ação não pode ser desfeita.`}
        confirmText="Excluir"
        cancelText="Cancelar"
        type="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDelete(null)}
      />

      <ConfirmDialog
        visible={confirmDeleteAll}
        title="Excluir todos os rascunhos?"
        message={`${products.length} produto${products.length !== 1 ? 's' : ''} serão removidos. Esta ação não pode ser desfeita.`}
        confirmText="Excluir todos"
        cancelText="Cancelar"
        type="danger"
        onConfirm={handleConfirmDeleteAll}
        onCancel={() => setConfirmDeleteAll(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.backgroundSecondary,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: theme.spacing.md,
    padding: theme.spacing.xl,
  },
  errorText: {
    fontSize: theme.fontSize.sm,
    color: Colors.light.textSecondary,
    textAlign: 'center',
  },
  list: {
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.xxl,
  },
  infoBox: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    backgroundColor: '#EFF6FF',
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    alignItems: 'flex-start',
  },
  infoText: {
    flex: 1,
    fontSize: theme.fontSize.xs,
    color: '#1E40AF',
    lineHeight: 18,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: theme.spacing.md,
    ...theme.shadows.sm,
  },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: Colors.light.backgroundSecondary,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  cardBody: {
    flex: 1,
    gap: 2,
  },
  cardName: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: Colors.light.text,
    letterSpacing: -0.2,
  },
  cardMeta: {
    fontSize: theme.fontSize.xxs + 1,
    color: Colors.light.textSecondary,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    flexShrink: 0,
  },
  completeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.light.primary,
    borderRadius: theme.borderRadius.lg,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  completeBtnText: {
    fontSize: theme.fontSize.xxs + 1,
    fontWeight: '700',
    color: '#fff',
  },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.light.error + '40',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.light.error + '0A',
  },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: theme.spacing.xxl,
    gap: theme.spacing.sm,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: theme.borderRadius.full,
    backgroundColor: Colors.light.success + '14',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: '800',
    color: Colors.light.text,
    letterSpacing: -0.3,
  },
  emptyDesc: {
    fontSize: theme.fontSize.sm,
    color: Colors.light.textSecondary,
    textAlign: 'center',
  },
});
