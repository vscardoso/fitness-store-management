/**
 * Tela de Catálogo de Produtos
 * Mostra os 115 produtos templates que podem ser ativados
 */
import React, { useState } from 'react';
import { View, StyleSheet, FlatList, RefreshControl, TouchableOpacity, Keyboard, TouchableWithoutFeedback, ScrollView, StatusBar } from 'react-native';
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
import { useRouter } from 'expo-router';
import useBackToList from '@/hooks/useBackToList';
import { Ionicons } from '@expo/vector-icons';

import { getCatalogProducts, activateCatalogProduct } from '@/services/catalogService';
import { getStockEntries } from '@/services/stockEntryService';
import { Product, StockEntry } from '@/types';
import ListHeader from '@/components/layout/ListHeader';
import { LinearGradient } from 'expo-linear-gradient';
import EmptyState from '@/components/ui/EmptyState';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { Colors } from '@/constants/Colors';

const PAGE_SIZE = 20;

export default function CatalogScreen() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { goBack } = useBackToList('/catalog');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [customPrice, setCustomPrice] = useState('');
  const [customCostPrice, setCustomCostPrice] = useState('');
  const [customName, setCustomName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [selectedEntryId, setSelectedEntryId] = useState<number | null>(null);
  const [createNewEntry, setCreateNewEntry] = useState(false);
  const [entrySearch, setEntrySearch] = useState('');
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [addedProductName, setAddedProductName] = useState('');
  const [showEntryRequiredDialog, setShowEntryRequiredDialog] = useState(false);
  const [showErrorDialog, setShowErrorDialog] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showCreateEntryDialog, setShowCreateEntryDialog] = useState(false);

  // Buscar entradas disponíveis
  const { data: entries = [] } = useQuery({
    queryKey: ['stock-entries-active'],
    queryFn: () => getStockEntries({ limit: 100 }),
    enabled: !!selectedProduct,
  });

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
    mutationFn: (data: { productId: number; customPrice?: number; entryId?: number; quantity?: number }) =>
      activateCatalogProduct(data.productId, data.customPrice, data.entryId, data.quantity),
    onSuccess: () => {
      // Invalidar queries
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['active-products'] });

      // Salvar nome do produto e mostrar dialog
      setAddedProductName(selectedProduct?.name || 'Produto');
      setShowSuccessDialog(true);

      setSelectedProduct(null);
      setCustomPrice('');
      setCustomCostPrice('');
      setCustomName('');
    },
    onError: (error: any) => {
      setErrorMessage(error.response?.data?.detail || 'Erro ao ativar produto');
      setShowErrorDialog(true);
    },
  });

  const handleActivateProduct = (product: Product) => {
    setSelectedProduct(product);
    setCustomName(product.name || '');
    setCustomPrice(product.price ? formatCurrency(Number(product.price)) : '0,00');
    setCustomCostPrice(product.cost_price ? formatCurrency(Number(product.cost_price)) : '0,00');
    setQuantity('1');
    setSelectedEntryId(null);
    setCreateNewEntry(false);
    setEntrySearch('');
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
    const qty = parseInt(quantity) || 0;

    if (!customName.trim()) {
      setErrorMessage('Nome do produto é obrigatório');
      setShowErrorDialog(true);
      return;
    }

    if (isNaN(price) || price <= 0) {
      setErrorMessage('Preço de venda inválido');
      setShowErrorDialog(true);
      return;
    }

    if (qty <= 0) {
      setErrorMessage('Quantidade deve ser maior que zero');
      setShowErrorDialog(true);
      return;
    }

    if (!createNewEntry && !selectedEntryId) {
      setShowEntryRequiredDialog(true);
      return;
    }

    if (createNewEntry) {
      // Mostrar dialog de confirmação para criar entrada
      setShowCreateEntryDialog(true);
      return;
    }

    activateMutation.mutate({
      productId: selectedProduct.id,
      customPrice: price,
      entryId: selectedEntryId!,
      quantity: qty,
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
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Header Premium */}
      <View style={styles.headerContainer}>
        <LinearGradient
          colors={["#667eea", "#764ba2"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerGradient}
        >
          <View style={styles.headerContentPremium}>
            <TouchableOpacity onPress={() => router.push('/(tabs)/products')} style={styles.backButtonPremium}>
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
            <View style={styles.headerInfo}> 
              <Text style={styles.greeting}>Catálogo</Text>
              <Text style={styles.headerSubtitle}>{allProducts.length} produtos</Text>
            </View>
            <View style={styles.headerSpacer} />
          </View>
        </LinearGradient>
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

                {/* Quantidade */}
                <TextInput
                  label="Quantidade Inicial *"
                  mode="outlined"
                  value={quantity}
                  onChangeText={setQuantity}
                  keyboardType="numeric"
                  style={styles.input}
                  placeholder="1"
                />

                <Text variant="bodySmall" style={styles.helpText}>
                  Quantidade que você está adicionando ao estoque
                </Text>

                {/* Seleção de Entrada */}
                <View style={styles.entrySection}>
                  <Text variant="titleSmall" style={styles.entrySectionTitle}>
                    Vinculação de Entrada (Obrigatório) *
                  </Text>

                  <Text variant="bodySmall" style={styles.entryHelpText}>
                    Para rastreabilidade, vincule este produto a uma entrada de estoque
                  </Text>

                  {/* Opção: Criar Nova Entrada */}
                  <TouchableOpacity
                    style={[
                      styles.entryOption,
                      createNewEntry && styles.entryOptionSelected,
                    ]}
                    onPress={() => {
                      setCreateNewEntry(true);
                      setSelectedEntryId(null);
                    }}
                  >
                    <View style={styles.entryOptionContent}>
                      <Ionicons
                        name={createNewEntry ? 'radio-button-on' : 'radio-button-off'}
                        size={24}
                        color={createNewEntry ? Colors.light.primary : '#666'}
                      />
                      <View style={styles.entryOptionText}>
                        <Text variant="bodyMedium" style={styles.entryOptionTitle}>
                          Criar Nova Entrada
                        </Text>
                        <Text variant="bodySmall" style={styles.entryOptionSubtitle}>
                          Será redirecionado para criar uma entrada
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>

                  {/* Opção: Vincular a Entrada Existente */}
                  {entries && entries.length > 0 && (
                    <View style={styles.existingEntriesSection}>
                      <Text variant="bodyMedium" style={styles.existingEntriesTitle}>
                        Ou vincular a entrada existente:
                      </Text>

                      <TextInput
                        mode="outlined"
                        label="Buscar entrada (código, fornecedor)"
                        value={entrySearch}
                        onChangeText={setEntrySearch}
                        style={styles.existingEntriesSearch}
                        placeholder="Ex: ENT-2024, Fornecedor X"
                      />

                      <View style={styles.entriesScrollableArea}>
                        <ScrollView style={{ maxHeight: 260 }}>
                          {entries
                            .filter((e) => {
                              if (!entrySearch.trim()) return true;
                              const term = entrySearch.toLowerCase();
                              return (
                                e.entry_code.toLowerCase().includes(term) ||
                                e.supplier_name.toLowerCase().includes(term)
                              );
                            })
                            .slice(0, 40)
                            .map((entry) => {
                              const selected = selectedEntryId === entry.id;
                              return (
                                <TouchableOpacity
                                  key={entry.id}
                                  style={[
                                    styles.entryOption,
                                    selected && styles.entryOptionSelected,
                                  ]}
                                  onPress={() => {
                                    setSelectedEntryId(entry.id);
                                    setCreateNewEntry(false);
                                  }}
                                >
                                  <View style={styles.entryOptionContent}>
                                    <Ionicons
                                      name={selected ? 'radio-button-on' : 'radio-button-off'}
                                      size={24}
                                      color={selected ? Colors.light.primary : '#666'}
                                    />
                                    <View style={styles.entryOptionText}>
                                      <View style={styles.entryOptionHeaderRow}>
                                        <Text variant="bodyMedium" style={styles.entryOptionTitle}>
                                          {entry.entry_code}
                                        </Text>
                                        <View style={styles.entryTypeChip}>
                                          <Text style={styles.entryTypeChipText}>
                                            {entry.entry_type}
                                          </Text>
                                        </View>
                                      </View>
                                      <Text variant="bodySmall" style={styles.entryOptionSubtitle}>
                                        {entry.supplier_name} • {new Date(entry.entry_date).toLocaleDateString('pt-BR')}
                                      </Text>
                                      <Text variant="bodySmall" style={styles.entryMetricsText}>
                                        {(entry.total_items ?? 0)} itens • {(entry.total_quantity ?? 0)} unidades • R$ {(() => {
                                          const costVal = typeof entry.total_cost === 'number' ? entry.total_cost : Number(entry.total_cost);
                                          return isNaN(costVal) ? '0,00' : costVal.toFixed(2).replace('.', ',');
                                        })()}
                                      </Text>
                                      {typeof entry.sell_through_rate === 'number' && (
                                        <Text variant="bodySmall" style={styles.entrySellThroughText}>
                                          Sell-through: {entry.sell_through_rate.toFixed(1)}% {entry.roi !== undefined && `• ROI: ${entry.roi?.toFixed(2)}`}
                                        </Text>
                                      )}
                                    </View>
                                  </View>
                                </TouchableOpacity>
                              );
                            })}
                          {entries.length === 0 && (
                            <Text style={styles.noEntriesText}>Nenhuma entrada disponível.</Text>
                          )}
                        </ScrollView>
                      </View>
                    </View>
                  )}
                </View>

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

      {/* Dialog de Sucesso */}
      <ConfirmDialog
        visible={showSuccessDialog}
        title="Produto Adicionado! ✓"
        message={`${addedProductName} foi adicionado à sua loja com sucesso.`}
        details={[
          'O produto está disponível na sua lista',
          'Você pode adicionar estoque agora',
          'Ou gerenciar depois na aba Produtos'
        ]}
        type="success"
        confirmText="Ver Meus Produtos"
        cancelText="Fechar"
        onConfirm={() => {
          setShowSuccessDialog(false);
          goBack();
        }}
        onCancel={() => setShowSuccessDialog(false)}
        icon="checkmark-circle"
      />

      {/* Dialog de Entrada Obrigatória */}
      <ConfirmDialog
        visible={showEntryRequiredDialog}
        title="Entrada Obrigatória"
        message="Para rastreabilidade, você precisa vincular este produto a uma entrada de estoque."
        details={[
          'Escolha uma entrada existente na lista abaixo',
          'Ou marque a opção "Criar Nova Entrada"',
          'A rastreabilidade garante controle total do estoque'
        ]}
        type="info"
        confirmText="Entendi"
        cancelText=""
        onConfirm={() => setShowEntryRequiredDialog(false)}
        onCancel={() => setShowEntryRequiredDialog(false)}
        icon="information-circle"
      />

      {/* Dialog de Erro */}
      <ConfirmDialog
        visible={showErrorDialog}
        title="Atenção"
        message={errorMessage}
        type="danger"
        confirmText="Entendi"
        cancelText=""
        onConfirm={() => setShowErrorDialog(false)}
        onCancel={() => setShowErrorDialog(false)}
        icon="alert-circle"
      />

      {/* Dialog de Criar Nova Entrada */}
      <ConfirmDialog
        visible={showCreateEntryDialog}
        title="Criar Nova Entrada de Estoque"
        message="Você será redirecionado para criar uma nova entrada de estoque com este produto pré-selecionado."
        details={[
          `Produto: ${selectedProduct?.name || customName}`,
          `Quantidade: ${quantity} unidade(s)`,
          `Custo: R$ ${customCostPrice}`,
          'Você poderá adicionar outros produtos na entrada'
        ]}
        type="info"
        confirmText="Continuar"
        cancelText="Cancelar"
        onConfirm={() => {
          setShowCreateEntryDialog(false);
          if (selectedProduct) {
            // Pass full product data as JSON to avoid ID mismatch between catalog and active products
            const productData = {
              id: selectedProduct.id,
              name: customName || selectedProduct.name,
              sku: selectedProduct.sku,
              cost_price: parseCurrency(customCostPrice),
              price: parseCurrency(customPrice),
            };
            router.push({
              pathname: '/entries/add',
              params: {
                preselectedProductData: JSON.stringify(productData),
                preselectedQuantity: quantity,
                fromCatalog: 'true',
              },
            });
          }
        }}
        onCancel={() => setShowCreateEntryDialog(false)}
        icon="document-text"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  headerContainer: {
    overflow: 'hidden',
  },
  headerGradient: {
    paddingTop: 28 + 32,
    paddingBottom: 16,
    paddingHorizontal: 16,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerContentPremium: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backButtonPremium: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerInfo: {
    flex: 1,
    alignItems: 'center',
  },
  greeting: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 6,
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '500',
  },
  headerSpacer: { width: 40 },
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
  entrySection: {
    marginTop: 20,
    marginBottom: 16,
  },
  entrySectionTitle: {
    fontWeight: '600',
    marginBottom: 8,
    color: '#333',
  },
  entryHelpText: {
    color: '#666',
    marginBottom: 16,
  },
  entryOption: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    backgroundColor: '#fff',
  },
  entryOptionSelected: {
    borderColor: Colors.light.primary,
    borderWidth: 2,
    backgroundColor: '#f0f7ff',
  },
  entryOptionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  entryOptionText: {
    flex: 1,
  },
  entryOptionTitle: {
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  entryOptionSubtitle: {
    color: '#666',
    fontSize: 12,
  },
  existingEntriesSection: {
    marginTop: 16,
  },
  existingEntriesTitle: {
    fontWeight: '600',
    marginBottom: 12,
    color: '#333',
  },
  existingEntriesSearch: {
    marginBottom: 12,
  },
  entriesScrollableArea: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 4,
    backgroundColor: '#fafafa',
    marginBottom: 8,
  },
  entryOptionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  entryTypeChip: {
    backgroundColor: '#eef6ff',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  entryTypeChipText: {
    fontSize: 11,
    color: Colors.light.primary,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  entryMetricsText: {
    color: '#444',
    fontSize: 12,
    marginTop: 2,
  },
  entrySellThroughText: {
    color: '#666',
    fontSize: 11,
    marginTop: 2,
  },
  noEntriesText: {
    textAlign: 'center',
    color: '#666',
    paddingVertical: 12,
    fontSize: 12,
  },
});
