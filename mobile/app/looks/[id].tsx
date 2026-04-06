import { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Image,
  TouchableOpacity,
  Modal,
  FlatList,
  TextInput,
  Text as RNText,
} from 'react-native';
import { Text, Button, Card } from 'react-native-paper';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import PageHeader from '@/components/layout/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import { getLook, deleteLook } from '@/services/lookService';
import { createShipment } from '@/services/conditionalService';
import { getCustomers } from '@/services/customerService';
import { Colors, theme } from '@/constants/Colors';
import { getImageUrl } from '@/constants/Config';
import { formatCurrency } from '@/utils/format';
import type { LookItemResponse } from '@/types/look';
import type { Customer } from '@/types';

export default function LookDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const lookId = parseInt(id, 10);

  const [customerModalVisible, setCustomerModalVisible] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');

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

  const { data: customers = [] } = useQuery({
    queryKey: ['customers-for-conditional'],
    queryFn: () => getCustomers({ limit: 200 }),
    enabled: customerModalVisible,
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
          quantity_sent: 1,
          unit_price: i.unit_price!,
        }));
      return createShipment({
        customer_id: customerId,
        shipping_address: 'A definir',
        items,
        notes: `Condicional do look: ${look?.name}`,
      });
    },
    onSuccess: (shipment) => {
      setCustomerModalVisible(false);
      queryClient.invalidateQueries({ queryKey: ['conditional-shipments'] });
      router.push(`/(tabs)/conditional/${shipment.id}`);
    },
    onError: () => {
      Alert.alert('Erro', 'Não foi possível criar o condicional. Tente novamente.');
    },
  });

  const handleDelete = () => {
    Alert.alert(
      'Excluir Look',
      `Deseja excluir o look "${look?.name}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: () => deleteMutation.mutate(),
        },
      ]
    );
  };

  const handleSelectCustomer = (customer: Customer) => {
    Alert.alert(
      'Pedir Condicional',
      `Criar condicional do look "${look?.name}" para ${customer.full_name}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          onPress: () => conditionalMutation.mutate(customer.id),
        },
      ]
    );
  };

  const filteredCustomers = customers.filter((c) =>
    c.full_name.toLowerCase().includes(customerSearch.toLowerCase()) ||
    c.phone.includes(customerSearch)
  );

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

  return (
    <View style={styles.container}>
      <PageHeader
        title={look.name}
        subtitle={`${look.items_count} peças`}
        rightActions={[
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

      {/* Modal: Selecionar Cliente */}
      <Modal
        visible={customerModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setCustomerModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Selecionar Cliente</Text>
              <TouchableOpacity onPress={() => setCustomerModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.light.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.searchContainer}>
              <Ionicons name="search" size={18} color={Colors.light.textSecondary} />
              <TextInput
                style={styles.searchInput}
                placeholder="Buscar por nome ou telefone..."
                placeholderTextColor={Colors.light.textTertiary}
                value={customerSearch}
                onChangeText={setCustomerSearch}
                autoFocus
              />
            </View>

            {conditionalMutation.isPending && (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color={Colors.light.primary} />
                <Text style={styles.loadingText}>Criando condicional...</Text>
              </View>
            )}

            <FlatList
              data={filteredCustomers}
              keyExtractor={(c) => String(c.id)}
              renderItem={({ item: customer }) => (
                <TouchableOpacity
                  style={styles.customerItem}
                  onPress={() => handleSelectCustomer(customer)}
                  activeOpacity={0.7}
                >
                  <View style={styles.customerAvatar}>
                    <Ionicons name="person" size={20} color={Colors.light.primary} />
                  </View>
                  <View style={styles.customerInfo}>
                    <RNText style={styles.customerName}>{customer.full_name}</RNText>
                    <RNText style={styles.customerPhone}>{customer.phone}</RNText>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={Colors.light.textTertiary} />
                </TouchableOpacity>
              )}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              ListEmptyComponent={
                <View style={styles.emptyCustomers}>
                  <Text style={styles.emptyCustomersText}>Nenhum cliente encontrado</Text>
                </View>
              }
              style={styles.customerList}
            />
          </View>
        </View>
      </Modal>
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
          {item.variant_description && (
            <Text style={styles.itemVariant}>{item.variant_description}</Text>
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
