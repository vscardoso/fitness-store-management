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
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/hooks/useAuth';
import EmptyState from '@/components/ui/EmptyState';
import ProductCard from '@/components/products/ProductCard';
import FAB from '@/components/FAB';
import { getActiveProducts, searchProducts, getCatalogProducts } from '@/services/productService';
import { Colors, theme } from '@/constants/Colors';
import type { Product } from '@/types';

const PAGE_SIZE = 20;

export default function ProductsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [showOnlyWithStock, setShowOnlyWithStock] = useState(true); // Começa com filtro ativo

  /**
   * Infinite Query para buscar produtos ATIVOS com paginação
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
    queryKey: ['active-products', searchQuery],
    queryFn: async ({ pageParam = 0 }) => {
      if (searchQuery.trim()) {
        // Para busca, retornar todos os resultados de uma vez
        return searchProducts(searchQuery);
      }
      // Para listagem normal, paginar de 20 em 20
      const products = await getActiveProducts({
        limit: PAGE_SIZE,
        skip: pageParam * PAGE_SIZE,
      });
      return products;
    },
    getNextPageParam: (lastPage, allPages) => {
      // Se tem busca ativa, não paginar
      if (searchQuery.trim()) {
        return undefined;
      }
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
   * Flatten all pages into a single array and filter based on stock toggle
   */
  const products = useMemo(() => {
    const allProducts = data?.pages?.flat() ?? [];

    // Se toggle está ativado, filtrar apenas produtos COM estoque
    if (showOnlyWithStock) {
      return allProducts.filter((product) => {
        const qty = product.current_stock ?? 0;
        return qty > 0;
      });
    }

    // Se toggle desativado (padrão), mostrar TODOS os produtos
    return allProducts;
  }, [data, showOnlyWithStock]);

  /**
   * Query para contar produtos de catálogo
   */
  const { data: catalogProducts } = useQuery({
    queryKey: ['catalog-products-count'],
    queryFn: () => getCatalogProducts({ limit: 1000 }), // Busca todos para contar
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
        {/* Header Premium */}
        <View style={styles.headerContainer}>
          <LinearGradient
            colors={['#667eea', '#764ba2']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerGradient}
          >
            <View style={styles.headerContent}>
              <View style={styles.headerInfo}>
                <Text style={styles.greeting}>
                  Produtos
                </Text>
                <Text style={styles.headerSubtitle}>
                  0 produtos
                </Text>
              </View>
              <TouchableOpacity
                style={styles.profileButton}
                onPress={() => router.push('/(tabs)/more')}
              >
                <View style={styles.profileIcon}>
                  <Ionicons name="person" size={24} color="#fff" />
                </View>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </View>

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
        {/* Header Premium */}
        <View style={styles.headerContainer}>
          <LinearGradient
            colors={['#667eea', '#764ba2']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerGradient}
          >
            <View style={styles.headerContent}>
              <View style={styles.headerInfo}>
                <Text style={styles.greeting}>
                  Produtos
                </Text>
                <Text style={styles.headerSubtitle}>
                  0 produtos
                </Text>
              </View>
              <TouchableOpacity
                style={styles.profileButton}
                onPress={() => router.push('/(tabs)/more')}
              >
                <View style={styles.profileIcon}>
                  <Ionicons name="person" size={24} color="#fff" />
                </View>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </View>

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
        {/* Header Premium */}
        <View style={styles.headerContainer}>
          <LinearGradient
            colors={['#667eea', '#764ba2']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerGradient}
          >
            <View style={styles.headerContent}>
              <View style={styles.headerInfo}>
                <Text style={styles.greeting}>
                  Produtos
                </Text>
                <Text style={styles.headerSubtitle}>
                  {productCount} {productCount === 1 ? 'produto' : 'produtos'}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.profileButton}
                onPress={() => router.push('/(tabs)/more')}
              >
                <View style={styles.profileIcon}>
                  <Ionicons name="person" size={24} color="#fff" />
                </View>
              </TouchableOpacity>
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
                <Ionicons name="storefront-outline" size={18} color={Colors.light.primary} />
                <Text style={styles.buttonText}>Catálogo</Text>
              </View>
            </Button>

            <Button
              mode="contained-tonal"
              onPress={() => router.push('/(tabs)/entries')}
              style={styles.actionButton}
              labelStyle={styles.actionButtonLabel}
              contentStyle={styles.actionButtonContent}
            >
              <View style={styles.buttonContent}>
                <Ionicons name="layers-outline" size={18} color={Colors.light.primary} />
                <Text style={styles.buttonText}>Entradas</Text>
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
                  size={18} 
                  color={showOnlyWithStock ? "#fff" : Colors.light.primary} 
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
          keyExtractor={(item) => item.id.toString()}
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
                    Explorar Catálogo ({catalogProducts?.length || 0} produtos)
                  </Button>
                </View>
              )}
            </View>
          }
        />

        {/* Botão flutuante para adicionar */}
        <FAB directRoute="/products/add" />
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
  // Header Premium
  headerContainer: {
    marginBottom: 0,
  },
  headerGradient: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.xl + 32,
    paddingBottom: theme.spacing.lg,
    borderBottomLeftRadius: theme.borderRadius.xl,
    borderBottomRightRadius: theme.borderRadius.xl,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerInfo: {
    flex: 1,
  },
  greeting: {
    fontSize: theme.fontSize.xxl,
    fontWeight: '700',
    color: '#fff',
    marginBottom: theme.spacing.xs,
  },
  headerSubtitle: {
    fontSize: theme.fontSize.md,
    color: '#fff',
    opacity: 0.9,
  },
  profileButton: {
    marginLeft: theme.spacing.md,
  },
  profileIcon: {
    width: 48,
    height: 48,
    borderRadius: theme.borderRadius.full,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchbar: {
    margin: 16,
    elevation: 2,
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
    marginBottom: 12,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  actionButton: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: Colors.light.primary + '15',
  },
  actionButtonActive: {
    backgroundColor: Colors.light.primary,
  },
  actionButtonLabel: {
    marginVertical: 0,
    marginHorizontal: 0,
  },
  actionButtonContent: {
    paddingHorizontal: 4,
    paddingVertical: 8,
    height: 44,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  buttonText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.light.primary,
  },
  buttonTextActive: {
    color: '#fff',
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
