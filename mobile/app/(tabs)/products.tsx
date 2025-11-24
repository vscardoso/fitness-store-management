import { useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Searchbar, FAB, Text, Button } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import ListHeader from '@/components/layout/ListHeader';
import EmptyState from '@/components/ui/EmptyState';
import ProductCard from '@/components/products/ProductCard';
import { getActiveProducts, searchProducts } from '@/services/productService';
import { Colors } from '@/constants/Colors';
import type { Product } from '@/types';

export default function ProductsScreen() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');

  /**
   * Query para buscar produtos ATIVOS (não inclui catálogo)
   */
  const {
    data: products,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['active-products', searchQuery],
    queryFn: () => {
      if (searchQuery.trim()) {
        return searchProducts(searchQuery);
      }
      return getActiveProducts({ limit: 100 });
    },
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
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.container}>
          <ListHeader
            title="Produtos"
            count={0}
            singularLabel="produto"
            pluralLabel="produtos"
            showCount={false}
          />
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={Colors.light.primary} />
            <Text style={styles.loadingText}>Carregando produtos...</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  /**
   * Renderizar erro
   */
  if (isError) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.container}>
          <ListHeader
            title="Produtos"
            count={0}
            singularLabel="produto"
            pluralLabel="produtos"
            showCount={false}
          />
          <EmptyState
            icon="alert-circle-outline"
            title="Erro ao carregar produtos"
            description="Verifique sua conexão e tente novamente"
          />
        </View>
      </SafeAreaView>
    );
  }

  const productCount = products?.length || 0;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.container}>
        {/* Header com contador */}
        <ListHeader
          title="Produtos"
          count={productCount}
          singularLabel="produto"
          pluralLabel="produtos"
        />

        {/* Barra de busca */}
        <Searchbar
          placeholder="Buscar por nome, SKU ou marca..."
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={styles.searchbar}
        />

        {/* Botões de ações */}
        <View style={styles.actionsRow}>
          <Button
            mode="contained"
            onPress={() => router.push('/catalog')}
            style={styles.catalogButton}
            icon="storefront-outline"
          >
            Explorar Catálogo
          </Button>
          <Button
            mode="outlined"
            onPress={() => router.push('/(tabs)/entries')}
            style={styles.batchesButton}
            icon="layers-outline"
          >
            Entradas
          </Button>
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
                    Explorar Catálogo (115 produtos)
                  </Button>
                </View>
              )}
            </View>
          }
        />

        {/* Botão flutuante para adicionar */}
        <FAB
          icon="plus"
          style={styles.fab}
          onPress={handleAddProduct}
          label="Adicionar"
        />
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
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
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
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    backgroundColor: Colors.light.primary,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  catalogButton: {
    flex: 1,
    backgroundColor: Colors.light.primary,
  },
  batchesButton: {
    flex: 1,
    borderColor: Colors.light.primary,
  },
  emptyActions: {
    paddingHorizontal: 24,
    marginTop: 24,
  },
});
