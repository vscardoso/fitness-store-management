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
} from 'react-native';
import { Text, Card, Searchbar, Menu, Button, Chip } from 'react-native-paper';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/hooks/useAuth';
import EmptyState from '@/components/ui/EmptyState';
import FAB from '@/components/FAB';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { getStockEntries, getStockEntriesStats, addItemToEntry } from '@/services/stockEntryService';
import { formatCurrency, formatDate } from '@/utils/format';
import { Colors, theme } from '@/constants/Colors';
import { StockEntry, EntryType } from '@/types';

const PAGE_SIZE = 20;

type FilterType = 'all' | 'active' | 'history';

export default function StockEntriesScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [typeFilter, setTypeFilter] = useState<EntryType | undefined>();
  const [searchQuery, setSearchQuery] = useState('');
  const [menuVisible, setMenuVisible] = useState(false);
  const [filter, setFilter] = useState<FilterType>('active');

  // Parâmetros de navegação para modo de seleção
  const params = useLocalSearchParams<{
    selectMode?: string;
    productToLink?: string;
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

  // Estados para diálogos
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<StockEntry | null>(null);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [showErrorDialog, setShowErrorDialog] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Mutation para vincular produto
  const linkMutation = useMutation({
    mutationFn: (data: { entryId: number; productData: any }) =>
      addItemToEntry(data.entryId, {
        product_id: data.productData.id,
        quantity_received: 1,
        unit_cost: data.productData.cost_price || 0,
        selling_price: data.productData.price || 0,
        notes: 'Adicionado via catálogo',
      }),
    onSuccess: async () => {
      setShowLinkDialog(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['stock-entries'] }),
        queryClient.invalidateQueries({ queryKey: ['products'] }),
        queryClient.invalidateQueries({ queryKey: ['active-products'] }),
      ]);
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
   * Renderizar badge de tipo
   */
  const renderTypeBadge = (type: EntryType) => {
    const typeConfig: Record<EntryType, { label: string; color: string; icon: string; bgColor: string }> = {
      [EntryType.TRIP]: { 
        label: 'Viagem', 
        color: Colors.light.info, 
        icon: 'car-outline',
        bgColor: Colors.light.info + '20',
      },
      [EntryType.ONLINE]: { 
        label: 'Online', 
        color: Colors.light.warning, 
        icon: 'cart-outline',
        bgColor: Colors.light.warning + '20',
      },
      [EntryType.LOCAL]: { 
        label: 'Local', 
        color: Colors.light.success, 
        icon: 'storefront-outline',
        bgColor: Colors.light.success + '20',
      },
      [EntryType.INITIAL_INVENTORY]: {
        label: 'Estoque Inicial',
        color: Colors.light.textSecondary,
        icon: 'archive-outline',
        bgColor: Colors.light.textSecondary + '20',
      },
      [EntryType.ADJUSTMENT]: {
        label: 'Ajuste',
        color: Colors.light.textSecondary,
        icon: 'construct-outline',
        bgColor: Colors.light.textSecondary + '20',
      },
      [EntryType.RETURN]: {
        label: 'Devolução',
        color: Colors.light.textSecondary,
        icon: 'arrow-undo-outline',
        bgColor: Colors.light.textSecondary + '20',
      },
      [EntryType.DONATION]: {
        label: 'Doação',
        color: Colors.light.textSecondary,
        icon: 'heart-outline',
        bgColor: Colors.light.textSecondary + '20',
      },
    };

    const config = typeConfig[type] || typeConfig[EntryType.LOCAL];

    return (
      <View style={[styles.badge, { backgroundColor: config.bgColor }]}>
        <Ionicons name={config.icon as any} size={14} color={config.color} />
        <Text style={[styles.badgeText, { color: config.color }]}>
          {config.label}
        </Text>
      </View>
    );
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
        <Card style={[styles.card, isSelectMode && styles.cardSelectMode]}>
          <Card.Content>
            {/* Header: Código e Tipo */}
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderLeft}>
                <Ionicons name="receipt-outline" size={20} color={Colors.light.primary} />
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
                <Ionicons name="airplane-outline" size={16} color={Colors.light.primary} />
                <Text style={styles.cardTrip}>
                  {item.trip_code}
                  {item.trip_destination && ` - ${item.trip_destination}`}
                </Text>
              </View>
            )}

            {/* Badge "COM VENDAS" */}
            {item.has_sales && (
              <View style={styles.salesBadge}>
                <Ionicons name="lock-closed" size={12} color="#F57C00" />
                <Text style={styles.salesBadgeText}>COM VENDAS</Text>
              </View>
            )}

            {/* Badge "HISTÓRICO" */}
            {item.sell_through_rate >= 100 && (
              <View style={styles.historyBadge}>
                <Ionicons name="archive" size={12} color="#757575" />
                <Text style={styles.historyBadgeText}>HISTÓRICO</Text>
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

            {/* KPIs de Performance */}
            {item.sell_through_rate > 0 && (
              <View style={styles.kpiRow}>
                <View style={styles.kpiItem}>
                  <Text style={styles.kpiLabel}>Sell-Through</Text>
                  <View style={styles.kpiValueContainer}>
                    <Text style={[
                      styles.kpiValue,
                      { color: item.sell_through_rate >= 70 ? Colors.light.success : Colors.light.warning }
                    ]}>
                      {item.sell_through_rate.toFixed(1)}%
                    </Text>
                  </View>
                </View>

                {item.roi !== null && item.roi !== undefined && (
                  <View style={styles.kpiItem}>
                    <Text style={styles.kpiLabel}>ROI</Text>
                    <View style={styles.kpiValueContainer}>
                      <Text style={[
                        styles.kpiValue,
                        { color: item.roi >= 0 ? Colors.light.success : Colors.light.error }
                      ]}>
                        {item.roi >= 0 ? '+' : ''}{item.roi.toFixed(1)}%
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            )}
          </Card.Content>
        </Card>
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
        {/* Header Premium */}
        <View style={styles.headerContainer}>
          <LinearGradient
            colors={[Colors.light.primary, Colors.light.secondary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerGradient}
          >
            <View style={styles.headerContent}>
              <View style={styles.headerInfo}>
                <Text style={styles.greeting}>
                  Entradas
                </Text>
                <Text style={styles.headerSubtitle}>
                  0 entradas
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
        {/* Header Premium */}
        <View style={styles.headerContainer}>
          <LinearGradient
            colors={[Colors.light.primary, Colors.light.secondary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerGradient}
          >
            <View style={styles.headerContent}>
              <View style={styles.headerInfo}>
                <Text style={styles.greeting}>
                  Entradas
                </Text>
                <Text style={styles.headerSubtitle}>
                  0 entradas
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
          title="Erro ao carregar entradas"
          description="Verifique sua conexão e tente novamente"
        />
      </View>
    );
  }

  const entryCount = filteredEntries.length;

  return (
    <View style={styles.container}>
      {/* Header Premium */}
      <View style={styles.headerContainer}>
        <LinearGradient
          colors={[Colors.light.primary, Colors.light.secondary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerGradient}
        >
          <View style={styles.headerContent}>
            <View style={styles.headerInfo}>
              <Text style={styles.greeting}>
                Entradas
              </Text>
              <Text style={styles.headerSubtitle}>
                {entryCount} {entryCount === 1 ? 'entrada' : 'entradas'}
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

      {/* Filtros de Status (Ativas/Histórico/Todas) */}
      <View style={styles.filterContainer}>
        <TouchableOpacity
          style={[styles.filterChip, filter === 'active' && styles.filterChipActive]}
          onPress={() => setFilter('active')}
        >
          <Ionicons
            name="cube"
            size={16}
            color={filter === 'active' ? Colors.light.primary : Colors.light.textSecondary}
          />
          <Text style={[styles.filterChipText, filter === 'active' && styles.filterChipTextActive]}>
            Ativas
          </Text>
          <View style={[styles.filterBadge, filter === 'active' && styles.filterBadgeActive]}>
            <Text style={[styles.filterBadgeText, filter === 'active' && styles.filterBadgeTextActive]}>
              {activeCount}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterChip, filter === 'history' && styles.filterChipActive]}
          onPress={() => setFilter('history')}
        >
          <Ionicons
            name="archive"
            size={16}
            color={filter === 'history' ? Colors.light.primary : Colors.light.textSecondary}
          />
          <Text style={[styles.filterChipText, filter === 'history' && styles.filterChipTextActive]}>
            Histórico
          </Text>
          <View style={[styles.filterBadge, filter === 'history' && styles.filterBadgeActive]}>
            <Text style={[styles.filterBadgeText, filter === 'history' && styles.filterBadgeTextActive]}>
              {historyCount}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterChip, filter === 'all' && styles.filterChipActive]}
          onPress={() => setFilter('all')}
        >
          <Ionicons
            name="list"
            size={16}
            color={filter === 'all' ? Colors.light.primary : Colors.light.textSecondary}
          />
          <Text style={[styles.filterChipText, filter === 'all' && styles.filterChipTextActive]}>
            Todas
          </Text>
          <View style={[styles.filterBadge, filter === 'all' && styles.filterBadgeActive]}>
            <Text style={[styles.filterBadgeText, filter === 'all' && styles.filterBadgeTextActive]}>
              {totalCount}
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Estatísticas gerais */}
      {stats.totalEntries > 0 && (
          <View style={styles.statsContainer}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Total Investido</Text>
              <Text style={styles.statValue}>
                {formatCurrency(stats.totalInvested)}
              </Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Total Itens</Text>
              <Text style={styles.statValue}>{stats.totalItems}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Vendido (Média)</Text>
              <Text style={[
                styles.statValue,
                { color: stats.avgSellThrough >= 70 ? Colors.light.success : Colors.light.warning }
              ]}>
                {isNaN(stats.avgSellThrough) ? '0' : stats.avgSellThrough.toFixed(0)}%
              </Text>
            </View>
          </View>
        )}

        {/* Barra de busca */}
        <Searchbar
          placeholder="Buscar por código, fornecedor ou viagem..."
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={styles.searchbar}
        />

        {/* Filtros */}
        <View style={styles.filtersContainer}>
          <Menu
            visible={menuVisible}
            onDismiss={() => setMenuVisible(false)}
            anchor={
              <Button
                mode="outlined"
                onPress={() => setMenuVisible(true)}
                icon="filter-outline"
                style={styles.filterButton}
              >
                {typeFilter ? getTypeLabel(typeFilter) : 'Todos os Tipos'}
              </Button>
            }
          >
            <Menu.Item 
              onPress={() => { setTypeFilter(undefined); setMenuVisible(false); }} 
              title="Todos" 
            />
            <Menu.Item 
              onPress={() => { setTypeFilter(EntryType.TRIP); setMenuVisible(false); }} 
              title="Viagens" 
            />
            <Menu.Item 
              onPress={() => { setTypeFilter(EntryType.ONLINE); setMenuVisible(false); }} 
              title="Compras Online" 
            />
            <Menu.Item 
              onPress={() => { setTypeFilter(EntryType.LOCAL); setMenuVisible(false); }} 
              title="Compras Locais" 
            />
          </Menu>

          {/* Chips ativos */}
          <View style={styles.activeFilters}>
            {typeFilter && (
              <Chip
                icon="filter"
                onClose={() => setTypeFilter(undefined)}
                style={styles.filterChip}
              >
                {getTypeLabel(typeFilter)}
              </Chip>
            )}
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
          <View style={styles.selectModeBanner}>
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
          details={[
            `Custo: R$ ${(productToLink?.cost_price || 0).toFixed(2)}`,
            `Preço: R$ ${(productToLink?.price || 0).toFixed(2)}`,
            `Quantidade: 1 unidade`,
          ]}
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
          message={`${productToLink?.name} foi adicionado à entrada ${selectedEntry?.entry_code} com sucesso.`}
          confirmText="Ver Entrada"
          cancelText="Voltar"
          onConfirm={() => {
            setShowSuccessDialog(false);
            if (selectedEntry) {
              router.replace({ pathname: `/entries/${selectedEntry.id}`, params: { from: '/(tabs)/entries' } });
            }
          }}
          onCancel={() => {
            setShowSuccessDialog(false);
            router.back();
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
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.light.card,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    elevation: 1,
  },
  statLabel: {
    fontSize: 11,
    color: Colors.light.textSecondary,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.light.text,
  },
  searchbar: {
    marginHorizontal: 16,
    marginBottom: 12,
    elevation: 2,
    backgroundColor: Colors.light.card,
  },
  filtersContainer: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  filterButton: {
    borderColor: Colors.light.border,
  },
  activeFilters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  listContainer: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  card: {
    marginBottom: 12,
    backgroundColor: Colors.light.card,
    elevation: 2,
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
  salesBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  salesBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#F57C00',
    textTransform: 'uppercase',
  },
  historyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  historyBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#757575',
    textTransform: 'uppercase',
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
  kpiRow: {
    flexDirection: 'row',
    gap: 16,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
  },
  kpiItem: {
    flex: 1,
  },
  kpiLabel: {
    fontSize: 11,
    color: Colors.light.textSecondary,
    marginBottom: 2,
  },
  kpiValueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  kpiValue: {
    fontSize: 14,
    fontWeight: '700',
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
