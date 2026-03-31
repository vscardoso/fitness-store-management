import { useState, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import PageHeader from '@/components/layout/PageHeader';
import { useAuth } from '@/hooks/useAuth';
import EmptyState from '@/components/ui/EmptyState';
import ProductGroupCard from '@/components/products/ProductGroupCard';
import FAB from '@/components/FAB';
import { getGroupedProducts, getCatalogProductsCount } from '@/services/productService';
import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { useTutorialContext } from '@/components/tutorial';
import type { ProductGrouped } from '@/types';

const PAGE_SIZE = 20;

export default function ProductsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { startTutorial } = useTutorialContext();
  const brandingColors = useBrandingColors();
  const { filter } = useLocalSearchParams<{ filter?: string }>();
  const [searchQuery, setSearchQuery] = useState('');
  const [showOnlyWithStock, setShowOnlyWithStock] = useState(false);
  const headerScale = useRef(new Animated.Value(0.94)).current;
  const headerOpacity = useRef(new Animated.Value(0)).current;
  const contentTranslateY = useRef(new Animated.Value(24)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;

  // showLowStock é derivado diretamente do param de URL (fonte única de verdade)
  // Isso garante que qualquer navegação com ?filter=low_stock sempre ativa o filtro
  const showLowStock = filter === 'low_stock';

  /**
   * Infinite Query para buscar produtos AGRUPADOS com paginação
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
    queryKey: ['grouped-products'], // Removido searchQuery - busca agora é local
    queryFn: async ({ pageParam = 0 }) => {
      // Sempre paginar normalmente - a busca é feita localmente
      const products = await getGroupedProducts({
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

  // Auto-refresh quando a tela recebe foco;
  // Se vier com filtro de estoque baixo, garante que o toggle de estoque fica desativado
  useFocusEffect(
    useCallback(() => {
      headerScale.setValue(0.94);
      headerOpacity.setValue(0);
      contentTranslateY.setValue(24);
      contentOpacity.setValue(0);

      refetch();
      if (filter === 'low_stock') {
        setShowOnlyWithStock(false);
      }

      Animated.parallel([
        Animated.spring(headerScale, {
          toValue: 1,
          useNativeDriver: true,
          friction: 8,
          tension: 70,
        }),
        Animated.timing(headerOpacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.delay(140),
          Animated.parallel([
            Animated.spring(contentTranslateY, {
              toValue: 0,
              useNativeDriver: true,
              friction: 9,
              tension: 72,
            }),
            Animated.timing(contentOpacity, {
              toValue: 1,
              duration: 240,
              useNativeDriver: true,
            }),
          ]),
        ]),
      ]).start();

      return () => {
        headerScale.stopAnimation();
        headerOpacity.stopAnimation();
        contentTranslateY.stopAnimation();
        contentOpacity.stopAnimation();
      };
    }, [refetch, filter, headerScale, headerOpacity, contentTranslateY, contentOpacity])
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
        // Buscar por nome ou marca
        const matchName = product.name?.toLowerCase().includes(query);
        const matchBrand = product.brand?.toLowerCase().includes(query);
        return matchName || matchBrand;
      });
    }

    // 2. FILTRO DE ESTOQUE
    if (showOnlyWithStock) {
      filtered = filtered.filter((product) => product.total_stock > 0);
    }

    // 3. FILTRO DE ESTOQUE BAIXO
    if (showLowStock) {
      filtered = filtered.filter((product) => {
        const threshold = product.min_stock_threshold ?? 3;
        return product.total_stock > 0 && product.total_stock <= threshold;
      });
    }

    return filtered;
  }, [data, searchQuery, showOnlyWithStock, showLowStock]);

  /**
   * Query para contar produtos de catálogo — usa endpoint leve (1 query SQL)
   */
  const { data: catalogCount = 0 } = useQuery({
    queryKey: ['catalog-products-count'],
    queryFn: getCatalogProductsCount,
    staleTime: 10 * 60 * 1000, // 10 min — catálogo raramente muda
  });

  /**
   * Navegar para detalhes do produto agrupado
   * Abre modal com todas as variantes
   */
  const handleProductPress = (product: ProductGrouped) => {
    router.push(`/products/${product.id}`);
  };

  /**
   * Navegar para adicionar produto - usa novo wizard unificado
   */
  const handleAddProduct = () => {
    router.push('/products/wizard');
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
  const renderProduct = ({ item }: { item: ProductGrouped }) => {
    // Se item for null ou undefined, renderizar espaço vazio
    if (!item || !item.id) {
      return <View style={styles.emptyCard} />;
    }
    return <ProductGroupCard product={item} onPress={() => handleProductPress(item)} />;
  };

  const emptyState = useMemo(() => {
    if (searchQuery.trim()) {
      return {
        icon: 'search-outline' as const,
        title: 'Nenhum resultado para sua busca',
        description: 'Tente outro nome, marca ou ajuste os filtros ativos.',
      };
    }

    if (showLowStock) {
      return {
        icon: 'warning-outline' as const,
        title: 'Nenhum produto com estoque baixo',
        description: 'Quando algum item ficar abaixo do limite, ele aparece aqui automaticamente.',
      };
    }

    if (showOnlyWithStock) {
      return {
        icon: 'cube-outline' as const,
        title: 'Nenhum produto com estoque disponível',
        description: 'Limpe o filtro para ver também itens sem estoque ou volte ao catálogo.',
      };
    }

    return {
      icon: 'storefront-outline' as const,
      title: 'Sua loja ainda está vazia',
      description: 'Adicione itens do catálogo para começar a montar sua lista de produtos.',
    };
  }, [searchQuery, showLowStock, showOnlyWithStock]);

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
  const hasActiveFilter = showLowStock || showOnlyWithStock || !!searchQuery.trim();

  return (
    <View style={styles.container}>
        <Animated.View
          style={[
            styles.headerAnimation,
            {
              opacity: headerOpacity,
              transform: [{ scale: headerScale }],
            },
          ]}
        >
        <PageHeader
          title="Produtos"
          subtitle={showLowStock ? `${productCount} com estoque baixo` : `${productCount} ${productCount === 1 ? 'produto' : 'produtos'}`}
          rightActions={[
            { icon: 'scan', onPress: () => router.push('/products/wizard?method=scanner') },
            { icon: 'help-circle-outline', onPress: () => startTutorial('products') },
          ]}
        />
        </Animated.View>

        <Animated.View
          style={[
            styles.contentAnimation,
            {
              opacity: contentOpacity,
              transform: [{ translateY: contentTranslateY }],
            },
          ]}
        >
        <View style={styles.topSection}>
          <View style={styles.searchbarWrapper}>
            <Ionicons name="search-outline" size={18} color={Colors.light.textTertiary} style={styles.searchIcon} />
            <TextInput
              placeholder="Buscar por nome, SKU ou marca..."
              placeholderTextColor={Colors.light.textTertiary}
              onChangeText={setSearchQuery}
              value={searchQuery}
              style={styles.searchbar}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={18} color={Colors.light.textTertiary} />
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.actionsContainer}>
            <View style={styles.actionsRow}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => router.push('/catalog')}
              activeOpacity={0.72}
            >
              <View style={[styles.actionIconWrap, { backgroundColor: brandingColors.primary + '12' }]}>
                <Ionicons name="storefront-outline" size={14} color={brandingColors.primary} />
              </View>
              <Text style={styles.buttonText}>Catálogo</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.actionButton,
                showLowStock && {
                  backgroundColor: Colors.light.warning + '18',
                  borderColor: Colors.light.warning + '55',
                },
              ]}
              onPress={() => {
                if (showLowStock) {
                  router.setParams({ filter: '' } as any);
                } else {
                  setShowOnlyWithStock(false);
                  router.setParams({ filter: 'low_stock' } as any);
                }
              }}
              activeOpacity={0.72}
            >
              <View
                style={[
                  styles.actionIconWrap,
                  showLowStock
                    ? { backgroundColor: Colors.light.warning + '22' }
                    : { backgroundColor: Colors.light.warning + '12' },
                ]}
              >
                <Ionicons
                  name={showLowStock ? 'warning' : 'warning-outline'}
                  size={14}
                  color={Colors.light.warning}
                />
              </View>
              <Text style={[styles.buttonText, showLowStock && { color: Colors.light.warning }]}>
                Estoque Baixo
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.actionButton,
                showOnlyWithStock && {
                  backgroundColor: brandingColors.primary + '12',
                  borderColor: brandingColors.primary,
                },
              ]}
              onPress={() => {
                setShowOnlyWithStock(!showOnlyWithStock);
                if (showLowStock) router.setParams({ filter: '' } as any);
              }}
              activeOpacity={0.72}
            >
              <View
                style={[
                  styles.actionIconWrap,
                  showOnlyWithStock
                    ? { backgroundColor: brandingColors.primary + '18' }
                    : { backgroundColor: brandingColors.primary + '12' },
                ]}
              >
                <Ionicons
                  name={showOnlyWithStock ? 'checkmark-circle' : 'cube-outline'}
                  size={14}
                  color={brandingColors.primary}
                />
              </View>
              <Text style={[styles.buttonText, showOnlyWithStock && { color: brandingColors.primary }]}>
                {showOnlyWithStock ? 'C/ Estoque' : 'Todos'}
              </Text>
            </TouchableOpacity>
          </View>

          {hasActiveFilter && (
            <View style={styles.filterSummaryRow}>
              {showLowStock && (
                <View style={[styles.filterPill, { backgroundColor: Colors.light.warning + '14', borderColor: Colors.light.warning + '2A' }]}>
                  <Ionicons name="warning-outline" size={12} color={Colors.light.warning} />
                  <Text style={[styles.filterPillText, { color: Colors.light.warning }]}>Estoque baixo</Text>
                </View>
              )}
              {showOnlyWithStock && (
                <View style={[styles.filterPill, { backgroundColor: brandingColors.primary + '12', borderColor: brandingColors.primary + '24' }]}>
                  <Ionicons name="cube-outline" size={12} color={brandingColors.primary} />
                  <Text style={[styles.filterPillText, { color: brandingColors.primary }]}>Com estoque</Text>
                </View>
              )}
              {!!searchQuery.trim() && (
                <View style={styles.filterPill}>
                  <Ionicons name="search-outline" size={12} color={Colors.light.textSecondary} />
                  <Text style={styles.filterPillText} numberOfLines={1}>Busca ativa</Text>
                </View>
              )}
            </View>
          )}
          </View>
        </View>

        <FlatList
          data={products}
          renderItem={renderProduct}
          keyExtractor={(item, index) => item?.id?.toString() ?? `item-${index}`}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
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
            <View style={styles.emptyStateCard}>
              <View style={[styles.emptyStateIconWrap, { backgroundColor: brandingColors.primary + '12' }]}>
                <Ionicons name={emptyState.icon} size={28} color={brandingColors.primary} />
              </View>
              <Text style={styles.emptyStateTitle}>{emptyState.title}</Text>
              <Text style={styles.emptyStateDescription}>{emptyState.description}</Text>

              {hasActiveFilter && (
                <View style={styles.emptyFilterSummary}>
                  <Text style={styles.emptyFilterSummaryLabel}>Filtros ativos</Text>
                  <View style={styles.emptyFilterSummaryRow}>
                    {showLowStock && (
                      <View style={[styles.filterPill, { backgroundColor: Colors.light.warning + '14', borderColor: Colors.light.warning + '2A' }]}>
                        <Ionicons name="warning-outline" size={12} color={Colors.light.warning} />
                        <Text style={[styles.filterPillText, { color: Colors.light.warning }]}>Estoque baixo</Text>
                      </View>
                    )}
                    {showOnlyWithStock && (
                      <View style={[styles.filterPill, { backgroundColor: brandingColors.primary + '12', borderColor: brandingColors.primary + '24' }]}>
                        <Ionicons name="cube-outline" size={12} color={brandingColors.primary} />
                        <Text style={[styles.filterPillText, { color: brandingColors.primary }]}>Com estoque</Text>
                      </View>
                    )}
                    {!!searchQuery.trim() && (
                      <View style={styles.filterPill}>
                        <Ionicons name="search-outline" size={12} color={Colors.light.textSecondary} />
                        <Text style={styles.filterPillText}>Busca ativa</Text>
                      </View>
                    )}
                  </View>
                </View>
              )}

              {!searchQuery && !showOnlyWithStock && !showLowStock && (
                <View style={styles.emptyActions}>
                  <TouchableOpacity
                    style={styles.catalogButton}
                    onPress={() => router.push('/catalog')}
                    activeOpacity={0.8}
                  >
                    <LinearGradient
                      colors={brandingColors.gradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.catalogButtonGradient}
                    >
                      <Ionicons name="storefront-outline" size={18} color="#fff" />
                      <Text style={styles.catalogButtonText}>
                        Explorar Catálogo ({catalogCount > 0 ? `${catalogCount} produtos` : '...'})
                      </Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          }
        />
        </Animated.View>

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
  headerAnimation: {
    zIndex: 2,
  },
  contentAnimation: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.lg,
  },
  topSection: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  searchbarWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    paddingHorizontal: theme.spacing.md - 2,
    height: 48,
    gap: theme.spacing.xs + 2,
    ...theme.shadows.sm,
  },
  searchIcon: {
    flexShrink: 0,
  },
  searchbar: {
    flex: 1,
    fontSize: theme.fontSize.sm,
    color: Colors.light.text,
    height: '100%',
  },
  emptyCard: {
    height: 0,
  },
  listContent: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.xs,
    paddingBottom: theme.spacing.xxl + 40,
  },
  loadingText: {
    marginTop: theme.spacing.md,
    color: Colors.light.textSecondary,
    fontSize: theme.fontSize.sm,
  },
  actionsContainer: {
    gap: theme.spacing.sm,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    alignItems: 'center',
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    minHeight: 44,
    borderRadius: theme.borderRadius.xl,
    backgroundColor: Colors.light.card,
    borderWidth: 1,
    borderColor: Colors.light.border,
    paddingVertical: theme.spacing.sm + 2,
    paddingHorizontal: theme.spacing.sm,
    ...theme.shadows.sm,
  },
  actionIconWrap: {
    width: 24,
    height: 24,
    borderRadius: theme.borderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  buttonText: {
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    color: Colors.light.textSecondary,
    flexShrink: 1,
    letterSpacing: -0.1,
  },
  filterSummaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.card,
  },
  filterPillText: {
    fontSize: theme.fontSize.xxs + 1,
    fontWeight: '700',
    color: Colors.light.textSecondary,
  },
  emptyActions: {
    width: '100%',
    marginTop: theme.spacing.sm,
  },
  emptyStateCard: {
    marginTop: theme.spacing.xl,
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xxl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.xl,
    alignItems: 'center',
    ...theme.shadows.sm,
  },
  emptyStateIconWrap: {
    width: 64,
    height: 64,
    borderRadius: theme.borderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  emptyStateTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: '800',
    color: Colors.light.text,
    textAlign: 'center',
    marginBottom: theme.spacing.xs,
    letterSpacing: -0.3,
  },
  emptyStateDescription: {
    fontSize: theme.fontSize.sm,
    color: Colors.light.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 300,
  },
  emptyFilterSummary: {
    marginTop: theme.spacing.md,
    width: '100%',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  emptyFilterSummaryLabel: {
    fontSize: theme.fontSize.xxs + 1,
    fontWeight: '700',
    color: Colors.light.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  emptyFilterSummaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: theme.spacing.xs,
  },
  catalogButton: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    width: '100%',
  },
  catalogButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    paddingVertical: 14,
    paddingHorizontal: theme.spacing.lg,
  },
  catalogButtonText: {
    color: '#fff',
    fontSize: theme.fontSize.base - 1,
    fontWeight: '700',
  },
  loadingMore: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20,
    gap: 10,
  },
  loadingMoreText: {
    fontSize: theme.fontSize.sm,
    color: Colors.light.textSecondary,
  },
});
