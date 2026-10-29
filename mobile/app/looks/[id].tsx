import { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Image,
  TouchableOpacity,
} from 'react-native';
import { Text, Button, Card } from 'react-native-paper';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import PageHeader from '@/components/layout/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import CustomerSelectionModal from '@/components/sale/CustomerSelectionModal';
import { getLook, deleteLook } from '@/services/lookService';
import { createShipment } from '@/services/conditionalService';
import { useCartStore } from '@/store/cartStore';
import { parseApiError } from '@/utils/apiError';
import { Colors, theme } from '@/constants/Colors';
import { getImageUrl } from '@/constants/Config';
import { formatCurrency } from '@/utils/format';
import type { LookItemResponse } from '@/types/look';
import type { Customer, ProductGrouped } from '@/types';
import { ActivityIndicator } from '@/components/ui/MagnifierLoader';

export default function LookDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const lookId = parseInt(id, 10);

  const [customerModalVisible, setCustomerModalVisible] = useState(false);

  type DialogState = {
    visible: boolean;
    type: 'danger' | 'warning' | 'info' | 'success';
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm?: () => void;
    onCancel?: () => void;
  };
  const DIALOG_HIDDEN: DialogState = { visible: false, type: 'info', title: '', message: '' };
  const [dialog, setDialog] = useState<DialogState>(DIALOG_HIDDEN);

  const {
    data: look,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['look', lookId],
    queryFn: () => getLook(lookId),
    enabled: !!lookId,
  });

  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  const deleteMutation = useMutation({
    mutationFn: () => deleteLook(lookId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['looks'] });
      router.back();
    },
  });

  const conditionalMutation = useMutation({
    mutationFn: (customerId: number) => {
      const items = (look?.items ?? [])
        .filter((i) => i.product_id != null && i.unit_price != null)
        .map((i) => ({
          product_id: i.product_id,
          variant_id: i.variant_id ?? undefined,
          quantity_sent: 1,
          unit_price: i.unit_price!,
        }));
      return createShipment({
        customer_id: customerId,
        shipping_address: 'Endereço a definir com a cliente',
        items,
        notes: `Condicional do look: ${look?.name}`,
      });
    },
    onSuccess: (shipment) => {
      setCustomerModalVisible(false);
      queryClient.invalidateQueries({ queryKey: ['conditional-shipments'] });
      router.push(`/(tabs)/conditional/${shipment.id}`);
    },
    onError: (err) => {
      setDialog({ visible: true, type: 'danger', title: 'Erro', message: `Não foi possível criar o condicional. ${parseApiError(err)}`, confirmText: 'OK', onConfirm: () => setDialog(DIALOG_HIDDEN) });
    },
  });

  const handleDelete = () => {
    setDialog({
      visible: true,
      type: 'danger',
      title: 'Excluir Look',
      message: `Deseja excluir o look "${look?.name}"?`,
      confirmText: 'Excluir',
      cancelText: 'Cancelar',
      onConfirm: () => { setDialog(DIALOG_HIDDEN); deleteMutation.mutate(); },
      onCancel: () => setDialog(DIALOG_HIDDEN),
    });
  };

  const handleSelectCustomer = (customer: Customer) => {
    setDialog({
      visible: true,
      type: 'info',
      title: 'Pedir Condicional',
      message: `Criar condicional do look "${look?.name}" para ${customer.full_name}?`,
      confirmText: 'Confirmar',
      cancelText: 'Cancelar',
      onConfirm: () => { setDialog(DIALOG_HIDDEN); conditionalMutation.mutate(customer.id); },
      onCancel: () => setDialog(DIALOG_HIDDEN),
    });
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <PageHeader title="Look" />
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.light.primary} />
        </View>
      </View>
    );
  }

  if (isError || !look) {
    return (
      <View style={styles.container}>
        <PageHeader title="Look" />
        <EmptyState
          icon="alert-circle-outline"
          title="Look não encontrado"
          description="Este look pode ter sido removido"
        />
      </View>
    );
  }

  const hasItems = look.items.length > 0;
  const subtotal = look.items.reduce((sum, i) => sum + (i.unit_price ?? 0), 0);
  const lookDiscount = Math.max(0, Math.round((subtotal - look.total_price) * 100) / 100);

  const sellLook = () => {
    const problems = look.items.filter((i) => i.variant_id == null || (i.stock ?? 0) < 1);
    if (problems.length > 0) {
      const lista = problems
        .map((i) => `${i.product_name ?? 'Produto'}${i.variant_description ? ` (${i.variant_description})` : ''}: ${i.variant_id == null ? 'sem cor/tamanho escolhido' : 'sem estoque'}`)
        .join('\n');
      setDialog({
        visible: true, type: 'warning', title: 'Não dá para vender o look ainda',
        message: `${lista}\n\nEdite o look e troque essas peças.`,
        confirmText: 'Editar look', cancelText: 'Fechar',
        onConfirm: () => { setDialog(DIALOG_HIDDEN); router.push(`/looks/builder?id=${lookId}`); },
        onCancel: () => setDialog(DIALOG_HIDDEN),
      });
      return;
    }
    const cart = useCartStore.getState();
    cart.clear();
    look.items.forEach((i) => {
      const product = { id: i.product_id, name: i.product_name ?? 'Produto', image_url: i.product_image_url ?? undefined, is_digital: false, is_activewear: false, variants: [], variant_count: 1, total_stock: i.stock ?? 0, min_price: i.unit_price ?? 0, max_price: i.unit_price ?? 0 } as ProductGrouped;
      cart.addVariantItem(product, {
        id: i.variant_id!, sku: i.variant_sku ?? '', size: i.variant_size ?? undefined, color: i.variant_color ?? undefined,
        price: i.unit_price ?? 0, current_stock: i.stock ?? 0,
      });
    });
    if (lookDiscount > 0) cart.setDiscount(lookDiscount);
    router.push('/(tabs)/sale');
  };

  return (
    <View style={styles.container}>
      <PageHeader
        title={look.name}
        subtitle={`${look.items_count} peças`}
        rightActions={[
          { icon: 'create-outline', onPress: () => router.push(`/looks/builder?id=${lookId}`) },
          { icon: 'trash-outline', onPress: handleDelete },
        ]}
      />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Resumo do Look */}
        <Card style={styles.summaryCard}>
          <Card.Content>
            {look.description && (
              <Text style={styles.description}>{look.description}</Text>
            )}
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Peças</Text>
                <Text style={styles.summaryValue}>{look.items_count}</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Total</Text>
                <Text style={[styles.summaryValue, styles.price]}>
                  {formatCurrency(look.total_price)}
                </Text>
              </View>
              {look.discount_percentage > 0 && (
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>Desconto</Text>
                  <Text style={[styles.summaryValue, styles.discount]}>
                    {look.discount_percentage}% off
                  </Text>
                </View>
              )}
            </View>
          </Card.Content>
        </Card>

        {/* Botão Pedir Condicional */}
        {hasItems && (
          <Button
            mode="contained"
            icon="cart"
            onPress={sellLook}
            style={[styles.conditionalButton, { backgroundColor: Colors.light.primary, marginBottom: 10 }]}
            contentStyle={styles.conditionalButtonContent}
          >
            Vender este look
          </Button>
        )}
        {hasItems && (
          <Button
            mode="contained"
            icon="package-variant"
            onPress={() => setCustomerModalVisible(true)}
            style={styles.conditionalButton}
            contentStyle={styles.conditionalButtonContent}
          >
            Pedir Condicional do Look
          </Button>
        )}

        {/* Lista de Produtos */}
        <Text style={styles.sectionTitle}>Produtos do Look</Text>
        {look.items.length === 0 ? (
          <EmptyState
            icon="shirt-outline"
            title="Nenhum produto"
            description="Edite o look para adicionar produtos"
          />
        ) : (
          look.items.map((item) => (
            <LookItemCard key={item.id} item={item} />
          ))
        )}
      </ScrollView>

      {/* Selecionar cliente (mesmo painel da venda) */}
      <CustomerSelectionModal
        visible={customerModalVisible}
        onDismiss={() => setCustomerModalVisible(false)}
        onSelectCustomer={handleSelectCustomer}
        title="Quem vai levar o look?"
        subtitle="Escolha a cliente do envio condicional"
        dismissLabel="Cancelar"
      />

      <ConfirmDialog
        visible={dialog.visible}
        type={dialog.type}
        title={dialog.title}
        message={dialog.message}
        confirmText={dialog.confirmText}
        cancelText={dialog.cancelText}
        onConfirm={dialog.onConfirm ?? (() => setDialog(DIALOG_HIDDEN))}
        onCancel={dialog.onCancel ?? (() => setDialog(DIALOG_HIDDEN))}
      />
    </View>
  );
}

function LookItemCard({ item }: { item: LookItemResponse }) {
  return (
    <Card style={styles.itemCard}>
      <Card.Content style={styles.itemContent}>
        <View style={styles.itemIcon}>
          {item.product_image_url ? (
            <Image
              source={{ uri: getImageUrl(item.product_image_url) }}
              style={styles.itemImage}
              resizeMode="cover"
            />
          ) : (
            <Ionicons name="cube" size={28} color={Colors.light.primary} />
          )}
        </View>
        <View style={styles.itemInfo}>
          <Text style={styles.itemName} numberOfLines={1}>
            {item.product_name ?? 'Produto'}
          </Text>
          {item.variant_id == null ? (
            <Text style={[styles.itemVariant, { color: Colors.light.error }]}>Escolher cor e tamanho</Text>
          ) : (
            <Text style={styles.itemVariant}>
              {[item.variant_color, item.variant_size].filter(Boolean).join(' · ') || item.variant_description}
            </Text>
          )}
          {item.stock != null && (
            <Text style={[styles.itemVariant, { color: item.stock > 0 ? Colors.light.success : Colors.light.error, fontWeight: '600' }]}>
              {item.stock > 0 ? `Em estoque: ${item.stock}` : 'Sem estoque'}
            </Text>
          )}
        </View>
        {item.unit_price != null && (
          <Text style={styles.itemPrice}>{formatCurrency(item.unit_price)}</Text>
        )}
      </Card.Content>
    </Card>
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
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  summaryCard: {
    borderRadius: theme.borderRadius.lg,
    elevation: 1,
    marginBottom: 16,
  },
  description: {
    color: Colors.light.textSecondary,
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 24,
  },
  summaryItem: {
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 11,
    color: Colors.light.textSecondary,
    marginBottom: 2,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  price: {
    color: Colors.light.primary,
  },
  discount: {
    color: Colors.light.success,
  },
  conditionalButton: {
    marginBottom: 20,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: Colors.light.secondary,
  },
  conditionalButtonContent: {
    paddingVertical: 4,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.textSecondary,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  itemCard: {
    borderRadius: theme.borderRadius.lg,
    elevation: 1,
    marginBottom: 8,
  },
  itemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  itemIcon: {
    width: 44,
    height: 44,
    borderRadius: theme.borderRadius.full,
    backgroundColor: `${Colors.light.primary}15`,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  itemImage: {
    width: '100%',
    height: '100%',
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontWeight: '600',
    fontSize: 14,
  },
  itemVariant: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  itemPrice: {
    fontWeight: '700',
    color: Colors.light.primary,
    fontSize: 14,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: Colors.light.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
    paddingBottom: 32,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.light.text,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.backgroundSecondary,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.light.border,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 15,
    color: Colors.light.text,
  },
  customerList: {
    flex: 1,
  },
  customerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  customerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.light.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  customerInfo: {
    flex: 1,
  },
  customerName: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.text,
  },
  customerPhone: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  separator: {
    height: 0.5,
    backgroundColor: Colors.light.border,
    marginLeft: 68,
  },
  emptyCustomers: {
    padding: 32,
    alignItems: 'center',
  },
  emptyCustomersText: {
    color: Colors.light.textSecondary,
    fontSize: 15,
  },
  loadingOverlay: {
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    color: Colors.light.textSecondary,
    fontSize: 14,
  },
});
