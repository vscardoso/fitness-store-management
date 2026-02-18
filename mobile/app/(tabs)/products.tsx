import { useState, useMemo, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Searchbar, Text, Button } from 'react-native-paper';
import { useRouter, useFocusEffect } from 'expo-router';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import PageHeader from '@/components/layout/PageHeader';
import { useAuth } from '@/hooks/useAuth';
import EmptyState from '@/components/ui/EmptyState';
import ProductCard from '@/components/products/ProductCard';
import FAB from '@/components/FAB';
import { getActiveProducts, searchProducts, getCatalogProductsCount } from '@/services/productService';
import { Colors, theme } from '@/constants/Colors';
import { useTutorialContext } from '@/components/tutorial';
import type { Product } from '@/types';

const PAGE_SIZE = 20;

export default function ProductsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { startTutorial } = useTutorialContext();
  const [searchQuery, setSearchQuery] = useState('');
  const [showOnlyWithStock, setShowOnlyWithStock] = useState(false); // Padrão: mostrar TODOS os produtos

  /**
   * Infinite Query para buscar produtos ATIVOS com paginação
   * NOTA: searchQuery NÃO está no queryKey - a busca é feita localmente para ser instantânea
   */
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
    queryKey: ['active-products'], // Removido searchQuery - busca agora é local
    queryFn: async ({ pageParam = 0 }) => {
      // Sempre paginar normalmente - a busca é feita localmente
      const products = await getActiveProducts({
        limit: PAGE_SIZE,
        skip: pageParam * PAGE_SIZE,
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

  // Auto-refresh quando a tela recebe foco
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  /**
   * Flatten all pages into a single array and filter based on:
   * 1. Busca em tempo real (searchQuery) - FILTRO LOCAL INSTANTÂNEO
   * 2. Toggle de estoque (showOnlyWithStock)
   * PADRÃO: Mostra TODOS os produtos (com e sem estoque)
   */
  const products = useMemo(() => {
    const allProducts = data?.pages?.flat() ?? [];

    // 1. FILTRO DE BUSCA (instantâneo, sem request ao backend)
    let filtered = allProducts;
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = allProducts.filter((product) => {
        // Buscar por nome, SKU ou marca
        const matchName = product.name?.toLowerCase().includes(query);
        const matchSku = product.sku?.toLowerCase().includes(query);
        const matchBrand = product.brand?.toLowerCase().includes(query);
        return matchName || matchSku || matchBrand;
      });
    }

    // 2. FILTRO DE ESTOQUE
    if (showOnlyWithStock) {
      filtered = filtered.filter((product) => {
        const qty = product.current_stock ?? 0;
        return qty > 0;
      });
    }

    return filtered;
  }, [data, searchQuery, showOnlyWithStock]);

  /**
   * Query para contar produtos de catálogo — usa endpoint leve (1 query SQL)
   */
  const { data: catalogCount = 0 } = useQuery({
    queryKey: ['catalog-products-count'],
    queryFn: getCatalogProductsCount,
    staleTime: 10 * 60 * 1000, // 10 min — catálogo raramente muda
  });

  /**
   * Navegar para detalhes do produto
   */
  const handleProductPress = (product: Product) => {
    router.push(`/products/${product.id}`);
  };

  /**
   * Navegar para adicionar produto
   */
  const handleAddProduct = () => {
    router.push('/products/add');
  };

  /**
   * Função para obter saudação baseada no horário
   */
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Bom dia';
    if (hour < 18) return 'Boa tarde';
    return 'Boa noite';
  };

  /**
   * Renderizar item da lista
   */
  const renderProduct = ({ item }: { item: Product }) => {
    // Se item for null ou undefined, renderizar espaço vazio
    if (!item || !item.id) {
      return <View style={styles.emptyCard} />;
    }
    return <ProductCard product={item} onPress={() => handleProductPress(item)} />;
  };

  /**
   * Renderizar loading
   */
  if (isLoading && !isRefetching) {
    return (
      <View style={styles.container}>
        <PageHeader
          title="Produtos"
          subtitle="0 produtos"
          rightActions={[
            { icon: 'scan', onPress: () => router.push('/products/wizard?method=scanner') },
            { icon: 'help-circle-outline', onPress: () => startTutorial('products') },
          ]}
        />

        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.light.primary} />
          <Text style={styles.loadingText}>Carregando produtos...</Text>
        </View>
      </View>
    );
  }

  /**
   * Renderizar erro
   */
  if (isError) {
    return (
      <View style={styles.container}>
        <PageHeader
          title="Produtos"
          subtitle="0 produtos"
          rightActions={[
            { icon: 'scan', onPress: () => router.push('/products/wizard?method=scanner') },
            { icon: 'help-circle-outline', onPress: () => startTutorial('products') },
          ]}
        />

        <EmptyState
          icon="alert-circle-outline"
          title="Erro ao carregar produtos"
          description="Verifique sua conexão e tente novamente"
        />
      </View>
    );
  }

  const productCount = products?.length || 0;

  return (
    <View style={styles.container}>
        <PageHeader
          title="Produtos"
          subtitle={`${productCount} ${productCount === 1 ? 'produto' : 'produtos'}`}
          rightActions={[
            { icon: 'scan', onPress: () => router.push('/products/wizard?method=scanner') },
            { icon: 'help-circle-outline', onPress: () => startTutorial('products') },
          ]}
        />

        {/* Barra de busca */}
        <Searchbar
          placeholder="Buscar por nome, SKU ou marca..."
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={styles.searchbar}
        />

        {/* Botões de ações */}
        <View style={styles.actionsContainer}>
          <View style={styles.actionsRow}>
            <Button
              mode="contained-tonal"
              onPress={() => router.push('/catalog')}
              style={styles.actionButton}
              labelStyle={styles.actionButtonLabel}
              contentStyle={styles.actionButtonContent}
            >
              <View style={styles.buttonContent}>
                <Ionicons name="storefront-outline" size={16} color={Colors.light.textSecondary} />
                <Text style={styles.buttonText}>Catálogo</Text>
              </View>
            </Button>

            <Button
              mode={showOnlyWithStock ? "contained" : "contained-tonal"}
              onPress={() => setShowOnlyWithStock(!showOnlyWithStock)}
              style={[
                styles.actionButton,
                showOnlyWithStock && styles.actionButtonActive
              ]}
              labelStyle={styles.actionButtonLabel}
              contentStyle={styles.actionButtonContent}
            >
              <View style={styles.buttonContent}>
                <Ionicons 
                  name={showOnlyWithStock ? "checkmark-circle" : "cube-outline"} 
                  size={16} 
                  color={showOnlyWithStock ? Colors.light.primary : Colors.light.textSecondary} 
                />
                <Text style={[
                  styles.buttonText,
                  showOnlyWithStock && styles.buttonTextActive
                ]}>
                  {showOnlyWithStock ? "C/ Estoque" : "Todos"}
                </Text>
              </View>
            </Button>
          </View>
        </View>

        {/* Lista de produtos */}
        <FlatList
          data={products}
          renderItem={renderProduct}
          keyExtractor={(item, index) => item?.id?.toString() ?? `item-${index}`}
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
              <View style={styles.loadingMore}>
                <ActivityIndicator size="small" color={Colors.light.primary} />
                <Text style={styles.loadingMoreText}>Carregando mais...</Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View>
              <EmptyState
                icon="cube-outline"
                title={searchQuery ? 'Nenhum produto encontrado' : 'Nenhum produto na sua loja'}
                description={
                  searchQuery
                    ? 'Tente buscar por outro termo'
                    : 'Explore o catálogo para adicionar produtos'
                }
              />
              {!searchQuery && (
                <View style={styles.emptyActions}>
                  <Button
                    mode="contained"
                    onPress={() => router.push('/catalog')}
                    icon="storefront-outline"
                  >
                    Explorar Catálogo ({catalogCount > 0 ? `${catalogCount} produtos` : '...'})
                  </Button>
                </View>
              )}
            </View>
          }
        />

        {/* Botão flutuante para adicionar produto - Wizard unificado */}
        <FAB directRoute="/products/wizard" />
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
    padding: 24,
  },
  searchbar: {
    marginHorizontal: 16,
    marginBottom: 12,
    elevation: 2,
    backgroundColor: Colors.light.card,
  },
  row: {
    justifyContent: 'flex-start',
    paddingHorizontal: 8,
  },
  emptyCard: {
    flex: 1,
    marginHorizontal: 6,
  },
  listContent: {
    paddingTop: 8,
    paddingBottom: 80,
  },
  loadingText: {
    marginTop: 16,
    color: Colors.light.icon,
  },
  actionsContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 0,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  actionButton: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: Colors.light.card,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  actionButtonActive: {
    backgroundColor: Colors.light.primary + '15',
    borderColor: Colors.light.primary,
  },
  actionButtonLabel: {
    marginVertical: 0,
    marginHorizontal: 0,
  },
  actionButtonContent: {
    paddingHorizontal: 8,
    paddingVertical: 10,
    height: 'auto',
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  buttonText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.light.textSecondary,
    flexShrink: 1,
  },
  buttonTextActive: {
    color: Colors.light.primary,
  },
  emptyActions: {
    paddingHorizontal: 24,
    marginTop: 24,
  },
  loadingMore: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20,
    gap: 10,
  },
  loadingMoreText: {
    fontSize: 14,
    color: Colors.light.textSecondary,
  },
});
