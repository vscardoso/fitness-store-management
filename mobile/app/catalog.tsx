/**
 * Tela de Catálogo de Produtos
 * Mostra os 115 produtos templates que podem ser ativados
 */
import React, { useState } from 'react';
import { View, StyleSheet, FlatList, Alert, RefreshControl, TouchableOpacity, Keyboard, TouchableWithoutFeedback, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Searchbar,
  Card,
  Text,
  Button,
  Chip,
  ActivityIndicator,
  Portal,
  Modal,
  TextInput,
} from 'react-native-paper';
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { getCatalogProducts, activateCatalogProduct } from '@/services/catalogService';
import { Product } from '@/types';
import ListHeader from '@/components/layout/ListHeader';
import EmptyState from '@/components/ui/EmptyState';
import { Colors } from '@/constants/Colors';

const PAGE_SIZE = 20;

export default function CatalogScreen() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [customPrice, setCustomPrice] = useState('');
  const [customCostPrice, setCustomCostPrice] = useState('');
  const [customName, setCustomName] = useState('');

  // Infinite Query para scroll infinito
  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
    isRefetching,
  } = useInfiniteQuery({
    queryKey: ['catalog-products', searchQuery],
    queryFn: async ({ pageParam = 0 }) => {
      const products = await getCatalogProducts({
        limit: PAGE_SIZE,
        skip: pageParam * PAGE_SIZE,
        search: searchQuery || undefined,
      });
      return products;
    },
    getNextPageParam: (lastPage, allPages) => {
      // Se a última página tem menos produtos que PAGE_SIZE, não há mais páginas
      if (!lastPage || lastPage.length < PAGE_SIZE) {
        return undefined;
      }
      return allPages.length;
    },
    initialPageParam: 0,
  });

  // Flatten all pages into a single array
  const allProducts = React.useMemo(() => {
    return data?.pages?.flat() ?? [];
  }, [data]);

  // Mutation para ativar produto
  const activateMutation = useMutation({
    mutationFn: (data: { productId: number; customPrice?: number }) =>
      activateCatalogProduct(data.productId, data.customPrice),
    onSuccess: () => {
      // Invalidar queries
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['active-products'] });

      Alert.alert(
        'Sucesso!',
        'Produto adicionado à sua loja. Agora você pode adicionar estoque.',
        [
          {
            text: 'Ver Meus Produtos',
            onPress: () => router.back(),
          },
          {
            text: 'OK',
            style: 'cancel',
          },
        ]
      );

      setSelectedProduct(null);
      setCustomPrice('');
      setCustomCostPrice('');
      setCustomName('');
    },
    onError: (error: any) => {
      Alert.alert(
        'Erro',
        error.response?.data?.detail || 'Erro ao ativar produto'
      );
    },
  });

  const handleActivateProduct = (product: Product) => {
    setSelectedProduct(product);
    setCustomName(product.name || '');
    setCustomPrice(product.price ? formatCurrency(Number(product.price)) : '0,00');
    setCustomCostPrice(product.cost_price ? formatCurrency(Number(product.cost_price)) : '0,00');
  };

  // Formatar valor para máscara de moeda
  const formatCurrency = (value: number) => {
    return value.toFixed(2).replace('.', ',');
  };

  // Converter string formatada para número
  const parseCurrency = (value: string) => {
    return parseFloat(value.replace(',', '.')) || 0;
  };

  // Máscara de moeda ao digitar
  const handlePriceChange = (text: string, setter: (val: string) => void) => {
    // Remove tudo exceto números
    const numbers = text.replace(/[^0-9]/g, '');
    
    if (numbers.length === 0) {
      setter('0,00');
      return;
    }
    
    // Converte para número com centavos
    const value = parseInt(numbers) / 100;
    setter(formatCurrency(value));
  };

  const confirmActivation = () => {
    if (!selectedProduct) return;

    const price = parseCurrency(customPrice);
    const costPrice = parseCurrency(customCostPrice);

    if (!customName.trim()) {
      Alert.alert('Erro', 'Nome do produto é obrigatório');
      return;
    }

    if (isNaN(price) || price <= 0) {
      Alert.alert('Erro', 'Preço de venda inválido');
      return;
    }

    activateMutation.mutate({
      productId: selectedProduct.id,
      customPrice: price,
    });
  };

  const renderProduct = ({ item }: { item: Product }) => (
    <Card style={styles.card} mode="elevated" elevation={2}>
      <Card.Content>
        <View style={styles.cardHeader}>
          <Text variant="titleMedium" style={styles.productName} numberOfLines={2}>
            {item.name}
          </Text>
          {item.brand && (
            <Chip mode="flat" compact style={styles.brandChip} textStyle={styles.brandText}>
              {item.brand}
            </Chip>
          )}
        </View>

        <View style={styles.priceRow}>
          <Text variant="headlineSmall" style={styles.price}>
            R$ {item.price ? Number(item.price).toFixed(2) : '0.00'}
          </Text>
          <View style={styles.suggestedChip}>
            <Text style={styles.suggestedText}>sugerido</Text>
          </View>
        </View>

        {item.cost_price && (
          <Text variant="bodySmall" style={styles.costPrice}>
            Custo: R$ {Number(item.cost_price).toFixed(2)}
          </Text>
        )}

        {item.sku && (
          <Text variant="bodySmall" style={styles.sku}>
            SKU: {item.sku}
          </Text>
        )}
      </Card.Content>

      <Card.Actions style={styles.cardActions}>
        <Button
          mode="contained"
          onPress={() => handleActivateProduct(item)}
          loading={activateMutation.isPending && selectedProduct?.id === item.id}
          icon="plus"
          contentStyle={styles.buttonContent}
        >
          Adicionar
        </Button>
      </Card.Actions>
    </Card>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.container}>
        {/* Header com contador e botão voltar */}
        <View style={styles.headerWithBack}>
          <TouchableOpacity
            onPress={() => router.push('/(tabs)/products')}
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerContent}>
            <ListHeader
              title="Catálogo de Produtos"
              count={allProducts.length}
              singularLabel="produto"
              pluralLabel="produtos"
            />
          </View>
        </View>

        {/* Barra de busca */}
        <Searchbar
          placeholder="Buscar por nome, SKU ou marca..."
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={styles.searchbar}
        />

        {/* Loading state inicial */}
        {isLoading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={Colors.light.primary} />
            <Text style={styles.loadingText}>Carregando catálogo...</Text>
          </View>
        ) : isError ? (
          <EmptyState
            icon="alert-circle-outline"
            title="Erro ao carregar catálogo"
            description="Verifique sua conexão e tente novamente"
          />
        ) : (
          <FlatList
            data={allProducts}
            renderItem={renderProduct}
            keyExtractor={(item, index) => `${item.id}-${index}`}
            numColumns={2}
            columnWrapperStyle={styles.row}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={isRefetching}
                onRefresh={refetch}
                colors={[Colors.light.primary]}
              />
            }
            onEndReached={() => {
              if (hasNextPage && !isFetchingNextPage) {
                fetchNextPage();
              }
            }}
            onEndReachedThreshold={0.5}
            ListFooterComponent={
              isFetchingNextPage ? (
                <View style={styles.footerLoader}>
                  <ActivityIndicator size="small" color={Colors.light.primary} />
                  <Text style={styles.loadingMoreText}>Carregando mais produtos...</Text>
                </View>
              ) : !hasNextPage && allProducts.length > 0 ? (
                <Text style={styles.endMessage}>
                  {allProducts.length} produtos carregados
                </Text>
              ) : null
            }
            ListEmptyComponent={
              <EmptyState
                icon="storefront-outline"
                title={searchQuery ? 'Nenhum produto encontrado' : 'Catálogo vazio'}
                description={
                  searchQuery
                    ? 'Tente buscar por outro termo'
                    : 'Nenhum produto disponível no momento'
                }
              />
            }
          />
        )}

      {/* Modal de Confirmação */}
      <Portal>
        <Modal
          visible={!!selectedProduct && !activateMutation.isPending}
          onDismiss={() => {
            setSelectedProduct(null);
            Keyboard.dismiss();
          }}
          contentContainerStyle={styles.modalContainer}
        >
          <ScrollView 
            style={styles.modalScrollView}
            contentContainerStyle={styles.modalScrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {selectedProduct && (
              <View style={styles.modalInnerContent}>
                <Text variant="titleLarge" style={styles.modalTitle}>
                  Adicionar Produto à Loja
                </Text>

                <Text variant="bodySmall" style={styles.modalSubtitle}>
                  Revise e personalize as informações antes de adicionar
                </Text>

                {/* Nome do Produto */}
                <TextInput
                  label="Nome do Produto"
                  mode="outlined"
                  value={customName}
                  onChangeText={setCustomName}
                  style={styles.input}
                  placeholder="Nome do produto"
                />

                {/* Detalhes do Produto Original */}
                <View style={styles.detailsCard}>
                  <Text variant="bodySmall" style={styles.detailLabel}>
                    Informações do Catálogo:
                  </Text>
                  {selectedProduct.brand && (
                    <Text variant="bodySmall" style={styles.detailText}>
                      • Marca: {selectedProduct.brand}
                    </Text>
                  )}
                  {selectedProduct.sku && (
                    <Text variant="bodySmall" style={styles.detailText}>
                      • SKU: {selectedProduct.sku}
                    </Text>
                  )}
                  {selectedProduct.description && (
                    <Text variant="bodySmall" style={styles.detailText} numberOfLines={2}>
                      • Descrição: {selectedProduct.description}
                    </Text>
                  )}
                </View>

                {/* Preço de Custo */}
                <TextInput
                  label="Preço de Custo"
                  mode="outlined"
                  value={customCostPrice}
                  onChangeText={(text) => handlePriceChange(text, setCustomCostPrice)}
                  keyboardType="numeric"
                  left={<TextInput.Affix text="R$" />}
                  style={styles.input}
                  placeholder="0,00"
                />

                <Text variant="bodySmall" style={styles.helpText}>
                  Valor que você paga pelo produto
                </Text>

                {/* Preço de Venda */}
                <TextInput
                  label="Preço de Venda"
                  mode="outlined"
                  value={customPrice}
                  onChangeText={(text) => handlePriceChange(text, setCustomPrice)}
                  keyboardType="numeric"
                  left={<TextInput.Affix text="R$" />}
                  style={styles.input}
                  placeholder="0,00"
                />

                <Text variant="bodySmall" style={styles.helpText}>
                  Valor que você cobra do cliente (sugestão: R$ {selectedProduct.price ? Number(selectedProduct.price).toFixed(2).replace('.', ',') : '0,00'})
                </Text>

                {/* Margem de Lucro */}
                {customPrice && customCostPrice && parseCurrency(customPrice) > 0 && parseCurrency(customCostPrice) >= 0 && (
                  <View style={styles.profitCard}>
                    <Text variant="bodySmall" style={styles.profitLabel}>
                      Margem de Lucro:
                    </Text>
                    <Text variant="titleMedium" style={styles.profitValue}>
                      R$ {(parseCurrency(customPrice) - parseCurrency(customCostPrice)).toFixed(2).replace('.', ',')}
                      {' '}
                      ({parseCurrency(customPrice) > 0 ? (((parseCurrency(customPrice) - parseCurrency(customCostPrice)) / parseCurrency(customPrice)) * 100).toFixed(1) : '0'}%)
                    </Text>
                  </View>
                )}

                <View style={styles.modalActions}>
                  <Button
                    mode="outlined"
                    onPress={() => {
                      setSelectedProduct(null);
                      Keyboard.dismiss();
                    }}
                    style={styles.modalButton}
                  >
                    Cancelar
                  </Button>
                  <Button
                    mode="contained"
                    onPress={confirmActivation}
                    style={styles.modalButton}
                    disabled={!customName.trim() || parseCurrency(customPrice) <= 0}
                  >
                    Adicionar
                  </Button>
                </View>
              </View>
            )}
          </ScrollView>
        </Modal>
      </Portal>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.light.primary,
  },
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  headerWithBack: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.primary,
  },
  backButton: {
    padding: 16,
    paddingLeft: 16,
  },
  headerContent: {
    flex: 1,
    marginLeft: -8,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  searchbar: {
    marginHorizontal: 16,
    marginVertical: 12,
    elevation: 2,
  },
  row: {
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  listContent: {
    paddingTop: 8,
    paddingBottom: 80,
    paddingHorizontal: 4,
  },
  card: {
    width: '48%',
    marginBottom: 12,
    backgroundColor: '#fff',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 8,
  },
  productName: {
    flex: 1,
    fontWeight: '600',
    lineHeight: 22,
  },
  brandChip: {
    backgroundColor: '#e3f2fd',
    minHeight: 28,
  },
  brandText: {
    fontSize: 12,
    color: '#1976d2',
    lineHeight: 16,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  price: {
    fontWeight: 'bold',
    color: Colors.light.primary,
  },
  suggestedChip: {
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  suggestedText: {
    fontSize: 11,
    color: '#666',
  },
  costPrice: {
    color: '#666',
    marginBottom: 4,
  },
  sku: {
    color: '#999',
  },
  cardActions: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  buttonContent: {
    height: 40,
  },
  loadingText: {
    marginTop: 16,
    color: Colors.light.icon,
  },
  footerLoader: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  loadingMoreText: {
    marginTop: 8,
    color: Colors.light.icon,
    fontSize: 12,
  },
  endMessage: {
    textAlign: 'center',
    paddingVertical: 20,
    color: '#999',
    fontSize: 12,
  },
  modalContent: {
    backgroundColor: 'white',
    padding: 24,
    marginHorizontal: 20,
    borderRadius: 12,
    maxHeight: '90%',
    overflow: 'hidden',
  },
  modalContainer: {
    backgroundColor: 'white',
    marginHorizontal: 20,
    borderRadius: 12,
    maxHeight: '100%',
  },
  modalScrollView: {
    maxHeight: '100%',
  },
  modalScrollContent: {
    padding: 24,
  },
  modalInnerContent: {
    backgroundColor: 'white',
  },
  modalTitle: {
    fontWeight: 'bold',
    marginBottom: 8,
  },
  modalSubtitle: {
    color: '#666',
    marginBottom: 20,
  },
  input: {
    marginBottom: 8,
  },
  detailsCard: {
    backgroundColor: '#f5f5f5',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  detailLabel: {
    fontWeight: '600',
    marginBottom: 4,
    color: '#333',
  },
  detailText: {
    color: '#666',
    marginTop: 2,
  },
  profitCard: {
    backgroundColor: '#e8f5e9',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
    marginBottom: 16,
    alignItems: 'center',
  },
  profitLabel: {
    color: '#2e7d32',
    marginBottom: 4,
  },
  profitValue: {
    color: '#1b5e20',
    fontWeight: 'bold',
  },
  helpText: {
    color: '#666',
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
  },
});
