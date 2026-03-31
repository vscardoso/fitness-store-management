/**
 * Stock Entries List Screen - Lista de Entradas de Estoque
 * 
 * Funcionalidades:
 * - Lista de entradas com cards informativos
 * - Badges de tipo (viagem, online, local)
 * - Métricas: sell-through, ROI
 * - Filtros por tipo, período, fornecedor
 * - Busca por código/fornecedor
 * - Pull to refresh
 * - FAB para nova entrada
 */

import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Text,
  TextInput,
} from 'react-native';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import PageHeader from '@/components/layout/PageHeader';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/hooks/useAuth';
import EmptyState from '@/components/ui/EmptyState';
import FAB from '@/components/FAB';
import Badge from '@/components/ui/Badge';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { getStockEntries, getStockEntriesStats, addItemToEntry } from '@/services/stockEntryService';
import { formatCurrency, formatDate } from '@/utils/format';
import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { StockEntry, EntryType } from '@/types';

const PAGE_SIZE = 20;

type FilterType = 'all' | 'active' | 'history';

export default function StockEntriesScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const brandingColors = useBrandingColors();
  const [typeFilter, setTypeFilter] = useState<EntryType | undefined>();
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<FilterType>('active');

  // ── Animações de entrada ──
  const headerOpacity  = useSharedValue(0);
  const headerScale    = useSharedValue(0.94);
  const contentOpacity = useSharedValue(0);
  const contentTransY  = useSharedValue(20);

  useFocusEffect(useCallback(() => {
    headerOpacity.value  = 0;
    headerScale.value    = 0.94;
    contentOpacity.value = 0;
    contentTransY.value  = 20;
    headerOpacity.value = withTiming(1, { duration: 380, easing: Easing.out(Easing.quad) });
    headerScale.value   = withSpring(1, { damping: 16, stiffness: 200 });
    const t = setTimeout(() => {
      contentOpacity.value = withTiming(1, { duration: 340 });
      contentTransY.value  = withSpring(0, { damping: 18, stiffness: 200 });
    }, 140);
    return () => clearTimeout(t);
  }, []));

  const headerAnimStyle  = useAnimatedStyle(() => ({
    opacity: headerOpacity.value,
    transform: [{ scale: headerScale.value }],
  }));
  const contentAnimStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ translateY: contentTransY.value }],
  }));

  // Parâmetros de navegação para modo de seleção
  const params = useLocalSearchParams<{
    selectMode?: string;
    productToLink?: string;
    fromWizard?: string;
    deleteSuccessMessage?: string;
    deleteSuccessNonce?: string;
  }>();

  // Parse produto a vincular
  const productToLink = useMemo(() => {
    if (params.productToLink) {
      try {
        return JSON.parse(params.productToLink);
      } catch {
        return null;
      }
    }
    return null;
  }, [params.productToLink]);

  const isSelectMode = params.selectMode === 'true' && productToLink;
  const isFromWizard = params.fromWizard === 'true';

  // Estados para diálogos
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<StockEntry | null>(null);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [deleteSuccessMessage, setDeleteSuccessMessage] = useState('');
  const [showDeleteSuccessDialog, setShowDeleteSuccessDialog] = useState(false);
  const [showErrorDialog, setShowErrorDialog] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Mutation para vincular produto
  const linkMutation = useMutation({
    mutationFn: async (data: { entryId: number; productData: any }) => {
      const { entryId, productData } = data;

      // ── Produto com variantes: adicionar um item por variante ──
      if (productData.isVariantProduct && Array.isArray(productData.variants)) {
        await Promise.all(
          productData.variants
            .filter((v: any) => (v.quantity ?? 0) > 0)
            .map((v: any) =>
              addItemToEntry(entryId, {
                product_id: v.product_id,
                quantity_received: v.quantity,
                unit_cost: v.cost_price || 0,
                selling_price: v.price || 0,
                notes: `Variante: ${[v.color, v.size].filter(Boolean).join(' / ') || v.sku} (via catálogo)`,
              })
            )
        );
        return;
      }

      // ── Produto simples ──
      await addItemToEntry(entryId, {
        product_id: productData.id,
        quantity_received: productData.quantity || 1,
        unit_cost: productData.cost_price || 0,
        selling_price: productData.price || 0,
        notes: productData.quantity > 1
          ? `Adicionado via catálogo (${productData.quantity} un)`
          : 'Adicionado via catálogo',
      });
    },
    onSuccess: async (_, variables) => {
      setShowLinkDialog(false);
      // Invalidar todas as queries relacionadas
      await Promise.all([
        // Invalida lista de entradas (todas as variantes de filtro)
        queryClient.invalidateQueries({ queryKey: ['stock-entries'] }),
        // Invalida detalhes da entrada específica
        queryClient.invalidateQueries({ queryKey: ['stock-entry', variables.entryId] }),
        // Invalida produtos
        queryClient.invalidateQueries({ queryKey: ['products'] }),
        queryClient.invalidateQueries({ queryKey: ['active-products'] }),
        // Invalida stats
        queryClient.invalidateQueries({ queryKey: ['stock-entries-stats'] }),
      ]);
      // Força refetch da lista atual
      await refetch();
      setShowSuccessDialog(true);
    },
    onError: (error: any) => {
      setShowLinkDialog(false);
      setErrorMessage(error.message || 'Erro ao vincular produto');
      setShowErrorDialog(true);
    },
  });

  /**
   * Query para buscar estatísticas gerais (total investido, etc.)
   */
  const { data: apiStats, refetch: refetchStats } = useQuery({
    queryKey: ['stock-entries-stats'],
    queryFn: getStockEntriesStats,
  });

  /**
   * Infinite Query para scroll infinito de entradas
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
    queryKey: ['stock-entries', typeFilter],
    queryFn: async ({ pageParam = 0 }) => {
      const entries = await getStockEntries({
        limit: PAGE_SIZE,
        skip: pageParam * PAGE_SIZE,
        entry_type: typeFilter,
      });
      return entries;
    },
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage || lastPage.length < PAGE_SIZE) {
        return undefined;
      }
      return allPages.length;
    },
    initialPageParam: 0,
  });

  /**
   * Flatten de todas as páginas em um único array
   */
  const entries = useMemo(() => {
    return data?.pages?.flat() ?? [];
  }, [data]);

  /**
   * Persistir filtro no AsyncStorage
   */
  useEffect(() => {
    AsyncStorage.setItem('entries_filter', filter);
  }, [filter]);

  useEffect(() => {
    AsyncStorage.getItem('entries_filter').then(saved => {
      if (saved) setFilter(saved as FilterType);
    });
  }, []);

  useEffect(() => {
    if (!params.deleteSuccessMessage) return;

    setDeleteSuccessMessage(params.deleteSuccessMessage);
    setShowDeleteSuccessDialog(true);
    refetchStats();
    refetch();
  }, [params.deleteSuccessMessage, params.deleteSuccessNonce, refetch, refetchStats]);

  /**
   * Auto-refresh ao focar na tela
   */
  useFocusEffect(
    useCallback(() => {
      refetchStats();
      refetch();
    }, [refetchStats, refetch])
  );

  /**
   * Calcular contadores para cada filtro
   */
  const activeCount = useMemo(() => {
    return entries?.filter(e => e.sell_through_rate < 100).length || 0;
  }, [entries]);

  const historyCount = useMemo(() => {
    return entries?.filter(e => e.sell_through_rate >= 100).length || 0;
  }, [entries]);

  const totalCount = entries?.length || 0;

  /**
   * Filtrar entradas por status (ativas/histórico/todas)
   */
  const filteredByStatus = useMemo(() => {
    if (!entries) return [];

    switch (filter) {
      case 'active':
        return entries.filter(e => e.sell_through_rate < 100);
      case 'history':
        return entries.filter(e => e.sell_through_rate >= 100);
      default:
        return entries;
    }
  }, [entries, filter]);

  /**
   * Filtrar entradas por busca
   */
  const filteredEntries = filteredByStatus?.filter(entry => {
    if (!searchQuery.trim()) return true;

    const query = searchQuery.toLowerCase();
    return (
      entry.entry_code.toLowerCase().includes(query) ||
      entry.supplier_name.toLowerCase().includes(query) ||
      entry.trip_code?.toLowerCase().includes(query)
    );
  }) || [];

  /**
   * Renderizar badge de tipo usando componente Badge unificado
   */
  const renderTypeBadge = (type: EntryType) => {
    const typeConfig: Record<EntryType, { label: string; variant: 'info' | 'warning' | 'success' | 'neutral'; icon: keyof typeof Ionicons.glyphMap }> = {
      [EntryType.TRIP]:              { label: 'Viagem',         variant: 'info',    icon: 'car-outline'           },
      [EntryType.ONLINE]:            { label: 'Online',         variant: 'warning', icon: 'cart-outline'          },
      [EntryType.LOCAL]:             { label: 'Local',          variant: 'success', icon: 'storefront-outline'    },
      [EntryType.INITIAL_INVENTORY]: { label: 'Est. Inicial',   variant: 'neutral', icon: 'archive-outline'       },
      [EntryType.ADJUSTMENT]:        { label: 'Ajuste',         variant: 'neutral', icon: 'construct-outline'     },
      [EntryType.RETURN]:            { label: 'Devolução',      variant: 'neutral', icon: 'arrow-undo-outline'    },
      [EntryType.DONATION]:          { label: 'Doação',         variant: 'neutral', icon: 'heart-outline'         },
    };
    const config = typeConfig[type] ?? typeConfig[EntryType.LOCAL];
    return <Badge label={config.label} variant={config.variant} icon={config.icon} size="sm" />;
  };

  /**
   * Handler para seleção de entrada (modo normal ou seleção)
   */
  const handleEntryPress = (entry: StockEntry) => {
    if (isSelectMode) {
      // Modo de seleção: mostrar dialog para vincular produto
      setSelectedEntry(entry);
      setShowLinkDialog(true);
    } else {
      // Modo normal: navegar para detalhes
      router.push({ pathname: `/entries/${entry.id}`, params: { from: '/(tabs)/entries' } });
    }
  };

  /**
   * Confirmar vinculação do produto
   */
  const confirmLinkProduct = () => {
    if (selectedEntry && productToLink) {
      linkMutation.mutate({
        entryId: selectedEntry.id,
        productData: productToLink,
      });
    }
  };

  /**
   * Renderizar card de entrada
   */
  const renderEntryCard = ({ item }: { item: StockEntry }) => {
    if (!item || !item.id) {
      return <View style={styles.emptyCard} />;
    }

    return (
      <TouchableOpacity
        onPress={() => handleEntryPress(item)}
        activeOpacity={0.7}
      >
        <View style={[styles.card, isSelectMode && styles.cardSelectMode]}>
          <View style={styles.cardContent}>
            {/* Header: Código e Tipo */}
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderLeft}>
                <Ionicons name="receipt-outline" size={20} color={brandingColors.primary} />
                <Text style={styles.cardCode}>{item.entry_code}</Text>
              </View>
              {renderTypeBadge(item.entry_type)}
            </View>

            {/* Fornecedor */}
            <View style={styles.cardRow}>
              <Ionicons name="briefcase-outline" size={16} color={Colors.light.textSecondary} />
              <Text style={styles.cardSupplier}>{item.supplier_name}</Text>
            </View>

            {/* Data */}
            <View style={styles.cardRow}>
              <Ionicons name="calendar-outline" size={16} color={Colors.light.textSecondary} />
              <Text style={styles.cardDate}>{formatDate(item.entry_date)}</Text>
            </View>

            {/* Viagem (se houver) */}
            {item.trip_code && (
              <View style={styles.cardRow}>
                <Ionicons name="airplane-outline" size={16} color={brandingColors.primary} />
                <Text style={styles.cardTrip}>
                  {item.trip_code}
                  {item.trip_destination && ` - ${item.trip_destination}`}
                </Text>
              </View>
            )}

            {/* Badges de status */}
            {(item.has_sales || item.sell_through_rate >= 100) && (
              <View style={styles.statusBadgesRow}>
                {item.has_sales && (
                  <Badge label="Com Vendas" variant="warning" icon="lock-closed" size="sm" uppercase />
                )}
                {item.sell_through_rate >= 100 && (
                  <Badge label="Histórico" variant="neutral" icon="archive" size="sm" uppercase />
                )}
              </View>
            )}

            {/* Divider */}
            <View style={styles.divider} />

            {/* Métricas */}
            <View style={styles.metricsRow}>
              <View style={styles.metricItem}>
                <Text style={styles.metricLabel}>Custo Total</Text>
                <Text style={styles.metricValue}>
                  {formatCurrency(item.total_cost)}
                </Text>
              </View>

              <View style={styles.metricItem}>
                <Text style={styles.metricLabel}>Itens</Text>
                <Text style={styles.metricValue}>
                  {item.total_items || 0} ({item.total_quantity || 0} un)
                </Text>
              </View>
            </View>

            {/* Sell-Through visual */}
            {item.sell_through_rate > 0 && (
              <View style={styles.sellThroughContainer}>
                <View style={styles.sellThroughHeader}>
                  <Text style={styles.kpiLabel}>Sell-Through</Text>
                  <View style={styles.kpiRow}>
                    <Text style={[
                      styles.kpiValue,
                      { color: item.sell_through_rate >= 70 ? Colors.light.success : item.sell_through_rate >= 40 ? Colors.light.warning : Colors.light.error }
                    ]}>
                      {item.sell_through_rate.toFixed(1)}%
                    </Text>
                    {item.roi !== null && item.roi !== undefined && (
                      <Text style={[
                        styles.kpiValue,
                        styles.roiValue,
                        { color: item.roi >= 0 ? Colors.light.success : Colors.light.error }
                      ]}>
                        ROI {item.roi >= 0 ? '+' : ''}{item.roi.toFixed(1)}%
                      </Text>
                    )}
                  </View>
                </View>
                <View style={styles.sellThroughBar}>
                  <View style={[
                    styles.sellThroughFill,
                    {
                      width: `${Math.min(item.sell_through_rate, 100)}%` as any,
                      backgroundColor: item.sell_through_rate >= 70 ? Colors.light.success :
                        item.sell_through_rate >= 40 ? Colors.light.warning :
                        Colors.light.error,
                    },
                  ]} />
                </View>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  /**
   * Calcular estatísticas gerais - usa dados da API para total investido correto
   */
  const calculateStats = () => {
    // Se não há stats da API, retorna valores zerados
    if (!apiStats) {
      return {
        totalEntries: 0,
        totalInvested: 0,
        totalItems: 0,
        avgSellThrough: 0,
      };
    }

    // Calcular média de sell-through apenas das entradas carregadas
    const avgSellThrough = entries.length > 0
      ? entries.reduce((sum, entry) => sum + (entry.sell_through_rate || 0), 0) / entries.length
      : 0;

    return {
      totalEntries: apiStats.total_entries, // Total real de TODAS as entradas
      totalInvested: apiStats.total_invested, // Soma total de TODAS as entradas
      totalItems: apiStats.total_items, // Total de produtos únicos
      avgSellThrough, // Média das entradas carregadas
    };
  };

  const stats = calculateStats();

  /**
   * Renderizar loading
   */
  if (isLoading && !isRefetching) {
    return (
      <View style={styles.container}>
        <PageHeader
          title="Entradas"
          subtitle="0 entradas"
        />

        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={brandingColors.primary} />
          <Text style={styles.loadingText}>Carregando entradas...</Text>
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
          title="Entradas"
          subtitle="0 entradas"
        />

        <EmptyState
          icon="alert-circle-outline"
          title="Erro ao carregar entradas"
          description="Verifique sua conexão e tente novamente"
        />
      </View>
    );
  }

  const entryCount = filteredEntries.length;

  return (
    <View style={styles.container}>
      <Animated.View style={headerAnimStyle}>
        <PageHeader
          title="Entradas"
          subtitle={`${entryCount} ${entryCount === 1 ? 'entrada' : 'entradas'}`}
        />
      </Animated.View>

      <Animated.View style={[{ flex: 1 }, contentAnimStyle]}>
      {/* Filtros de Status (Ativas/Histórico/Todas) */}
      <View style={styles.filterContainer}>
        {(['active', 'history', 'all'] as FilterType[]).map((f) => {
          const isActive = filter === f;
          const labels = { active: 'Ativas', history: 'Histórico', all: 'Todas' };
          const icons  = { active: 'cube', history: 'archive', all: 'list' } as const;
          const counts = { active: activeCount, history: historyCount, all: totalCount };
          return (
            <TouchableOpacity
              key={f}
              style={[
                styles.filterChip,
                isActive && {
                  backgroundColor: brandingColors.primary + '15',
                  borderColor: brandingColors.primary,
                },
              ]}
              onPress={() => setFilter(f)}
            >
              <Ionicons
                name={icons[f]}
                size={16}
                color={isActive ? brandingColors.primary : Colors.light.textSecondary}
              />
              <Text style={[
                styles.filterChipText,
                isActive && { color: brandingColors.primary },
              ]}>
                {labels[f]}
              </Text>
              <View style={[
                styles.filterBadge,
                isActive && { backgroundColor: brandingColors.primary },
              ]}>
                <Text style={[
                  styles.filterBadgeText,
                  isActive && { color: '#fff' },
                ]}>
                  {counts[f]}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Estatísticas gerais */}
      {stats.totalEntries > 0 && (
        <LinearGradient
          colors={[brandingColors.primary + '18', brandingColors.primary + '05']}
          style={styles.statsContainer}
        >
          <View style={styles.statCard}>
            <Ionicons name="cash-outline" size={16} color={brandingColors.primary} style={{ marginBottom: 4 }} />
            <Text style={styles.statLabel}>Total Investido</Text>
            <Text style={[styles.statValue, { color: Colors.light.text }]}>
              {formatCurrency(stats.totalInvested)}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="cube-outline" size={16} color={Colors.light.info} style={{ marginBottom: 4 }} />
            <Text style={styles.statLabel}>Total Itens</Text>
            <Text style={[styles.statValue, { color: Colors.light.text }]}>{stats.totalItems}</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="trending-up" size={16} color={stats.avgSellThrough >= 70 ? Colors.light.success : Colors.light.warning} style={{ marginBottom: 4 }} />
            <Text style={styles.statLabel}>Vendido (Média)</Text>
            <Text style={[
              styles.statValue,
              { color: stats.avgSellThrough >= 70 ? Colors.light.success : Colors.light.warning }
            ]}>
              {isNaN(stats.avgSellThrough) ? '0' : stats.avgSellThrough.toFixed(0)}%
            </Text>
          </View>
        </LinearGradient>
      )}

        {/* Barra de busca */}
        <View style={styles.searchbarContainer}>
          <Ionicons name="search-outline" size={18} color={Colors.light.textSecondary} />
          <TextInput
            style={styles.searchbarInput}
            placeholder="Buscar por código, fornecedor ou viagem..."
            placeholderTextColor={Colors.light.textTertiary}
            onChangeText={setSearchQuery}
            value={searchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color={Colors.light.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Filtros de Tipo */}
        <View style={styles.filtersContainer}>
          <View style={styles.typeFilterRow}>
            {([undefined, EntryType.TRIP, EntryType.ONLINE, EntryType.LOCAL] as (EntryType | undefined)[]).map((type) => {
              const label = type ? getTypeLabel(type) : 'Todos';
              const isActive = typeFilter === type;
              return (
                <TouchableOpacity
                  key={label}
                  style={[
                    styles.typeFilterChip,
                    isActive && { backgroundColor: brandingColors.primary + '15', borderColor: brandingColors.primary },
                  ]}
                  onPress={() => setTypeFilter(type)}
                >
                  <Text style={[
                    styles.typeFilterChipText,
                    isActive && { color: brandingColors.primary },
                  ]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Lista de entradas */}
        <FlatList
          data={filteredEntries}
          renderItem={renderEntryCard}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              colors={[brandingColors.primary]}
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
                <ActivityIndicator size="small" color={brandingColors.primary} />
                <Text style={styles.footerText}>Carregando mais entradas...</Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            searchQuery ? (
              <EmptyState
                icon="search-outline"
                title="Nenhuma entrada encontrada"
                description="Tente ajustar os filtros de busca"
              />
            ) : isSelectMode ? (
              // Modo de seleção: não há entradas para vincular
              <EmptyState
                icon="link-outline"
                title="Nenhuma entrada disponível"
                description={`Crie uma nova entrada para vincular "${productToLink?.name}"`}
                actionLabel="Criar Entrada e Vincular"
                onAction={() => router.push({
                  pathname: '/entries/add',
                  params: {
                    from: '/(tabs)/entries',
                    preselectedProductData: JSON.stringify(productToLink),
                    preselectedQuantity: '1',
                    fromCatalog: 'true',
                  }
                })}
              />
            ) : filter === 'history' ? (
              <EmptyState
                icon="archive-outline"
                title="Nenhuma entrada no histórico"
                description="Entradas aparecem aqui quando 100% do estoque for vendido"
              />
            ) : filter === 'active' ? (
              <EmptyState
                icon="cube-outline"
                title="Nenhuma entrada ativa"
                description="Todas as entradas foram totalmente vendidas"
              />
            ) : (
              <EmptyState
                icon="receipt-outline"
                title="Nenhuma entrada cadastrada"
                description="Comece adicionando uma nova entrada"
                actionLabel="Nova Entrada"
                onAction={() => router.push({ pathname: '/entries/add', params: { from: '/(tabs)/entries' } })}
              />
            )
          }
        />

        {/* FAB: Nova Entrada (escondido em modo de seleção) */}
        {!isSelectMode && <FAB directRoute="/entries/add" />}

        {/* Banner de modo de seleção */}
        {isSelectMode && (
          <View style={[styles.selectModeBanner, { backgroundColor: brandingColors.primary }]}>
            <View style={styles.selectModeBannerContent}>
              <Ionicons name="link" size={20} color="#fff" />
              <View style={styles.selectModeBannerText}>
                <Text style={styles.selectModeBannerTitle}>Vincular Produto</Text>
                <Text style={styles.selectModeBannerSubtitle}>
                  Selecione uma entrada para adicionar: {productToLink?.name}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => router.back()}
                style={styles.selectModeBannerClose}
              >
                <Ionicons name="close" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Dialog de confirmação de vinculação */}
        <ConfirmDialog
          visible={showLinkDialog}
          title="Vincular Produto"
          message={`Deseja adicionar "${productToLink?.name}" à entrada ${selectedEntry?.entry_code}?`}
          details={
            productToLink?.isVariantProduct && Array.isArray(productToLink?.variants)
              ? [
                  ...productToLink.variants
                    .filter((v: any) => (v.quantity ?? 0) > 0)
                    .map((v: any) => `${[v.color, v.size].filter(Boolean).join(' / ') || v.sku}: ${v.quantity} un`),
                  `Total: ${productToLink.quantity} unidades`,
                ]
              : [
                  `Quantidade: ${productToLink?.quantity || 1} ${(productToLink?.quantity || 1) === 1 ? 'unidade' : 'unidades'}`,
                  `Custo unitário: R$ ${Number(productToLink?.cost_price || 0).toFixed(2)}`,
                  `Preço de venda: R$ ${Number(productToLink?.price || 0).toFixed(2)}`,
                  `Custo total: R$ ${(Number(productToLink?.cost_price || 0) * (productToLink?.quantity || 1)).toFixed(2)}`,
                ]
          }
          confirmText="Vincular"
          cancelText="Cancelar"
          onConfirm={confirmLinkProduct}
          onCancel={() => setShowLinkDialog(false)}
          type="info"
          icon="link"
          loading={linkMutation.isPending}
        />

        {/* Dialog de sucesso */}
        <ConfirmDialog
          visible={showSuccessDialog}
          title="Produto Vinculado!"
          message={`${productToLink?.quantity || 1} ${(productToLink?.quantity || 1) === 1 ? 'unidade' : 'unidades'} de "${productToLink?.name}" ${(productToLink?.quantity || 1) === 1 ? 'foi adicionada' : 'foram adicionadas'} à entrada ${selectedEntry?.entry_code}.`}
          confirmText={isFromWizard ? "Ver Resumo" : "Ver Entrada"}
          cancelText={isFromWizard ? "" : "Voltar"}
          onConfirm={() => {
            setShowSuccessDialog(false);
            if (isFromWizard && selectedEntry) {
              // Retornar ao wizard com dados da entrada vinculada E do produto
              router.replace({
                pathname: '/products/wizard',
                params: {
                  returnFromEntry: 'true',
                  createdEntryId: String(selectedEntry.id),
                  createdEntryCode: selectedEntry.entry_code || '',
                  createdEntryQuantity: String(productToLink?.quantity || 1),
                  createdEntrySupplier: selectedEntry.supplier_name || '',
                  // Para variantes, passar produto completo; para simples, reconstruir
                  createdProductData: productToLink?._fullProductData
                    ? productToLink._fullProductData
                    : JSON.stringify({
                        id: productToLink?.id,
                        name: productToLink?.name,
                        sku: productToLink?.sku,
                        cost_price: productToLink?.cost_price,
                        price: productToLink?.price,
                        category_id: productToLink?.category_id,
                      }),
                },
              });
            } else if (selectedEntry) {
              router.replace({ pathname: `/entries/${selectedEntry.id}`, params: { from: '/(tabs)/entries' } });
            }
          }}
          onCancel={() => {
            setShowSuccessDialog(false);
            if (!isFromWizard) {
              router.back();
            }
          }}
          type="success"
          icon="checkmark-circle"
        />

        <ConfirmDialog
          visible={showDeleteSuccessDialog}
          title="Entrada Excluída"
          message={deleteSuccessMessage}
          confirmText="OK"
          onConfirm={() => {
            setShowDeleteSuccessDialog(false);
            setDeleteSuccessMessage('');
            router.replace('/(tabs)/entries');
          }}
          onCancel={() => {
            setShowDeleteSuccessDialog(false);
            setDeleteSuccessMessage('');
            router.replace('/(tabs)/entries');
          }}
          type="success"
          icon="checkmark-circle"
        />

        {/* Dialog de erro */}
        <ConfirmDialog
          visible={showErrorDialog}
          title="Erro"
          message={errorMessage}
          confirmText="OK"
          onConfirm={() => setShowErrorDialog(false)}
          onCancel={() => setShowErrorDialog(false)}
          type="danger"
          icon="alert-circle"
        />
      </Animated.View>
      </View>
    );
  }

/**
 * Helper para label de tipo
 */
function getTypeLabel(type: EntryType): string {
  const labels: Record<EntryType, string> = {
    [EntryType.TRIP]: 'Viagens',
    [EntryType.ONLINE]: 'Compras Online',
    [EntryType.LOCAL]: 'Compras Locais',
    [EntryType.INITIAL_INVENTORY]: 'Estoque Inicial',
    [EntryType.ADJUSTMENT]: 'Ajustes',
    [EntryType.RETURN]: 'Devoluções',
    [EntryType.DONATION]: 'Doações',
  };
  return labels[type] || 'Todos';
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
  loadingText: {
    marginTop: 12,
    color: Colors.light.textSecondary,
  },
  statsContainer: {
    flexDirection: 'row',
    marginHorizontal: theme.spacing.md,
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.sm,
    overflow: 'hidden',
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.sm,
    alignItems: 'center',
    ...theme.shadows.sm,
  },
  statLabel: {
    fontSize: theme.fontSize.xxs,
    color: Colors.light.textSecondary,
    marginBottom: theme.spacing.xxs,
    textAlign: 'center',
  },
  statValue: {
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.bold,
    color: Colors.light.text,
    textAlign: 'center',
  },
  searchbarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: Colors.light.card,
    borderWidth: 1,
    borderColor: Colors.light.border,
    gap: 8,
    ...theme.shadows.sm,
  },
  searchbarInput: {
    flex: 1,
    fontSize: theme.fontSize.sm,
    color: Colors.light.text,
    padding: 0,
  },
  filtersContainer: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  typeFilterRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  typeFilterChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: theme.borderRadius.full,
    backgroundColor: Colors.light.card,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  typeFilterChipText: {
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
    color: Colors.light.textSecondary,
  },
  listContainer: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  card: {
    marginBottom: 12,
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    ...theme.shadows.sm,
  },
  cardContent: {
    padding: theme.spacing.md,
  },
  emptyCard: {
    height: 0,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardCode: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.light.text,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  cardSupplier: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.text,
    flex: 1,
  },
  cardDate: {
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  cardTrip: {
    fontSize: 13,
    color: Colors.light.primary,
    fontWeight: '500',
  },
  statusBadgesRow: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
    marginTop: theme.spacing.xs,
    flexWrap: 'wrap',
  },
  filterContainer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  filterChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Colors.light.card,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  filterChipActive: {
    backgroundColor: Colors.light.primary + '15',
    borderColor: Colors.light.primary,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.light.textSecondary,
    flexShrink: 1,
  },
  filterChipTextActive: {
    color: Colors.light.primary,
  },
  filterBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.light.backgroundSecondary,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  filterBadgeActive: {
    backgroundColor: Colors.light.primary,
  },
  filterBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.light.textSecondary,
  },
  filterBadgeTextActive: {
    color: '#fff',
  },
  divider: {
    height: 1,
    backgroundColor: Colors.light.border,
    marginVertical: 12,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 8,
  },
  metricItem: {
    flex: 1,
  },
  metricLabel: {
    fontSize: 11,
    color: Colors.light.textSecondary,
    marginBottom: 2,
  },
  metricValue: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.text,
  },
  sellThroughContainer: {
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
  },
  sellThroughHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
  },
  sellThroughBar: {
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.light.border,
    overflow: 'hidden',
  },
  sellThroughFill: {
    height: 5,
    borderRadius: 3,
  },
  kpiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  kpiItem: {
    flex: 1,
  },
  kpiLabel: {
    fontSize: theme.fontSize.xxs,
    color: Colors.light.textSecondary,
    marginBottom: theme.spacing.xxs,
  },
  kpiValueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  kpiValue: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.bold,
  },
  roiValue: {
    fontSize: theme.fontSize.xs,
    marginLeft: theme.spacing.sm,
    paddingLeft: theme.spacing.sm,
    borderLeftWidth: 1,
    borderLeftColor: Colors.light.border,
  },
  footerLoader: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20,
    gap: 12,
  },
  footerText: {
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  // Estilos para modo de seleção
  cardSelectMode: {
    borderWidth: 2,
    borderColor: Colors.light.primary + '50',
  },
  selectModeBanner: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.light.primary,
    paddingVertical: 12,
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  selectModeBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  selectModeBannerText: {
    flex: 1,
  },
  selectModeBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  selectModeBannerSubtitle: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.85)',
    marginTop: 2,
  },
  selectModeBannerClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
