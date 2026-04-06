/**
 * Detalhe do Fornecedor
 * Exibe dados de contato + lista de produtos comprados
 */

import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import PageHeader from '@/components/layout/PageHeader';
import InfoRow from '@/components/ui/InfoRow';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { Colors, theme, VALUE_COLORS } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { useSupplier, useSupplierProducts, useDeleteSupplier, useUpdateSupplier } from '@/hooks/useSuppliers';
import { formatDate } from '@/utils/format';

export default function SupplierDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const brandingColors = useBrandingColors();
  const supplierId = id ? parseInt(id) : NaN;
  const isValidId = !isNaN(supplierId) && supplierId > 0;

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const {
    data: supplier,
    isLoading,
    refetch: refetchSupplier,
  } = useSupplier(supplierId);

  const {
    data: supplierProducts = [],
    isLoading: isLoadingProducts,
    error: productsError,
    refetch: refetchProducts,
  } = useSupplierProducts(supplierId);

  const deleteMutation = useDeleteSupplier();

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetchSupplier(), refetchProducts()]);
    setRefreshing(false);
  };

  const handleDelete = () => setShowDeleteDialog(true);

  const confirmDelete = async () => {
    setShowDeleteDialog(false);
    try {
      await deleteMutation.mutateAsync(supplierId);
      router.push('/suppliers');
    } catch {
      // erro tratado pelo mutation
    }
  };

  if (!isValidId) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="alert-circle" size={64} color={Colors.light.error} />
        <Text style={styles.errorText}>ID de fornecedor inválido</Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={brandingColors.primary} />
      </View>
    );
  }

  if (!supplier) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="alert-circle-outline" size={64} color={Colors.light.textTertiary} />
        <Text style={styles.errorText}>Fornecedor não encontrado</Text>
        <TouchableOpacity onPress={() => router.push('/suppliers')} activeOpacity={0.75}>
          <Text style={[styles.linkText, { color: brandingColors.primary }]}>Voltar à lista</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <PageHeader
        title={supplier.name}
        subtitle={supplier.cnpj ?? supplier.phone ?? 'Sem dados de contato'}
        showBackButton
        onBack={() => router.push('/suppliers')}
        rightActions={[
          {
            icon: 'pencil-outline',
            onPress: () => router.push(`/suppliers/edit/${supplierId}` as any),
          },
        ]}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[brandingColors.primary]}
          />
        }
      >
        {/* ── Contato ── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.cardHeaderIcon, { backgroundColor: brandingColors.primary + '15' }]}>
              <Ionicons name="person-outline" size={20} color={brandingColors.primary} />
            </View>
            <Text style={styles.cardTitle}>Contato</Text>
          </View>
          <View style={styles.infoList}>
            <InfoRow
              icon="business-outline"
              label="CNPJ"
              value={supplier.cnpj || 'Não informado'}
              layout="vertical"
            />
            <InfoRow
              icon="call-outline"
              label="Telefone"
              value={supplier.phone || 'Não informado'}
              layout="vertical"
            />
            {supplier.email ? (
              <InfoRow
                icon="mail-outline"
                label="E-mail"
                value={supplier.email}
                layout="vertical"
              />
            ) : null}
            <InfoRow
              icon="calendar-outline"
              label="Cadastrado em"
              value={formatDate(supplier.created_at)}
              layout="vertical"
            />
            {supplier.notes ? (
              <InfoRow
                icon="document-text-outline"
                label="Observações"
                value={supplier.notes}
                layout="vertical"
              />
            ) : null}
          </View>
        </View>

        {/* ── Produtos comprados ── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.cardHeaderIcon, { backgroundColor: brandingColors.primary + '15' }]}>
              <Ionicons name="cube-outline" size={20} color={brandingColors.primary} />
            </View>
            <Text style={styles.cardTitle}>Produtos comprados</Text>
            {supplierProducts.length > 0 && (
              <View style={styles.countBadge}>
                <Text style={[styles.countBadgeText, { color: brandingColors.primary }]}>
                  {supplierProducts.length}
                </Text>
              </View>
            )}
          </View>

          {isLoadingProducts ? (
            <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.sm }}>
              {[1, 2, 3].map((i) => (
                <View key={i} style={styles.skeletonCard} />
              ))}
            </View>
          ) : productsError ? (
            <View style={styles.emptyState}>
              <Ionicons name="alert-circle-outline" size={40} color={Colors.light.error} />
              <Text style={styles.emptyText}>Erro ao carregar produtos</Text>
              <TouchableOpacity
                style={styles.retryBtn}
                onPress={() => refetchProducts()}
                activeOpacity={0.75}
              >
                <Text style={[styles.retryText, { color: brandingColors.primary }]}>
                  Tentar novamente
                </Text>
              </TouchableOpacity>
            </View>
          ) : supplierProducts.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="cube-outline" size={40} color={Colors.light.textTertiary} />
              <Text style={styles.emptyText}>Nenhum produto registrado para este fornecedor</Text>
            </View>
          ) : (
            supplierProducts.map((sp) => (
              <TouchableOpacity
                key={sp.product_id}
                style={styles.productCard}
                onPress={() => router.push(`/products/${sp.product_id}` as any)}
                activeOpacity={0.75}
              >
                <View style={styles.productCardIcon}>
                  <Ionicons name="cube-outline" size={20} color={brandingColors.primary} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.productCardName} numberOfLines={1}>{sp.product_name}</Text>
                  <Text style={styles.productCardSku}>SKU: {sp.product_sku}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={Colors.light.textTertiary} />

                {/* Métricas */}
                <View style={styles.productMetricsRow}>
                  <View style={styles.productMetricCol}>
                    <Text style={styles.productMetricLabel}>Último preço</Text>
                    <Text style={[styles.productMetricValue, { color: VALUE_COLORS.neutral }]}>
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(sp.last_unit_cost)}
                    </Text>
                  </View>
                  <View style={styles.productMetricCol}>
                    <Text style={styles.productMetricLabel}>Compras</Text>
                    <Text style={styles.productMetricValue}>{sp.purchase_count}x</Text>
                  </View>
                  <View style={styles.productMetricCol}>
                    <Text style={styles.productMetricLabel}>Última compra</Text>
                    <Text style={styles.productMetricValue}>
                      {new Date(sp.last_purchase_date).toLocaleDateString('pt-BR')}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* ── Botões de ação ── */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionButton, styles.dangerActionButton]}
            onPress={handleDelete}
            activeOpacity={0.75}
          >
            <Ionicons name="trash-outline" size={18} color={Colors.light.error} />
            <Text style={styles.dangerActionButtonText}>Excluir fornecedor</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.primaryActionButton]}
            onPress={() => router.push(`/suppliers/edit/${supplierId}` as any)}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={brandingColors.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.primaryActionButtonGradient}
            >
              <Ionicons name="pencil-outline" size={18} color="#fff" />
              <Text style={styles.primaryActionButtonText}>Editar</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        <View style={{ height: theme.spacing.md }} />
      </ScrollView>

      <ConfirmDialog
        visible={showDeleteDialog}
        type="danger"
        title="Excluir fornecedor?"
        message="Esta ação remove o fornecedor do catálogo. Os históricos de compra vinculados a entradas não serão afetados."
        confirmText="Excluir"
        cancelText="Cancelar"
        icon="trash-outline"
        onConfirm={confirmDelete}
        onCancel={() => setShowDeleteDialog(false)}
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
    gap: theme.spacing.sm,
    padding: theme.spacing.lg,
  },
  errorText: {
    fontSize: theme.fontSize.base,
    fontWeight: '600',
    color: Colors.light.text,
    textAlign: 'center',
  },
  linkText: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
  scrollView: { flex: 1 },
  scrollContent: {
    padding: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
  },
  card: {
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    ...theme.shadows.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  cardHeaderIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: theme.fontSize.base,
    fontWeight: '700',
    color: Colors.light.text,
    flex: 1,
  },
  countBadge: {
    backgroundColor: Colors.light.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  countBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  infoList: {
    gap: 0,
  },
  skeletonCard: {
    height: 88,
    borderRadius: theme.borderRadius.xl,
    backgroundColor: Colors.light.backgroundSecondary,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  emptyText: {
    fontSize: theme.fontSize.sm,
    color: Colors.light.textSecondary,
    textAlign: 'center',
  },
  retryBtn: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: theme.borderRadius.xl,
  },
  retryText: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
  productCard: {
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
    ...theme.shadows.sm,
  },
  productCardIcon: {
    width: 48,
    height: 48,
    borderRadius: theme.borderRadius.md,
    backgroundColor: Colors.light.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  productCardName: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: Colors.light.text,
  },
  productCardSku: {
    fontSize: theme.fontSize.xs,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  productMetricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
    paddingTop: theme.spacing.sm,
    marginTop: theme.spacing.sm,
    width: '100%',
  },
  productMetricCol: {
    alignItems: 'center',
    flex: 1,
  },
  productMetricLabel: {
    fontSize: theme.fontSize.xxs,
    color: Colors.light.textSecondary,
    marginBottom: 2,
  },
  productMetricValue: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.light.text,
  },
  actions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
  },
  actionButton: {
    flex: 1,
    borderRadius: theme.borderRadius.lg,
    minHeight: 52,
    overflow: 'hidden',
  },
  primaryActionButton: {
    ...theme.shadows.sm,
  },
  primaryActionButtonGradient: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: theme.spacing.md,
  },
  primaryActionButtonText: {
    fontSize: theme.fontSize.base,
    color: '#fff',
    fontWeight: '700',
  },
  dangerActionButton: {
    borderWidth: 1.5,
    borderColor: Colors.light.error + '50',
    backgroundColor: Colors.light.error + '08',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  dangerActionButtonText: {
    fontSize: theme.fontSize.base,
    fontWeight: '700',
    color: Colors.light.error,
  },
});
