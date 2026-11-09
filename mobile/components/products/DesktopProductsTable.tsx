/**
 * Produtos no modo notebook (app web com 1024 px ou mais): tabela com busca, filtros, ordenação e páginas.
 * O celular continua com a lista de cartões (app/(tabs)/products.tsx).
 */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import PageHeader from '@/components/layout/PageHeader';
import DataTable, { DataColumn } from '@/components/ui/DataTable';
import EmptyState from '@/components/ui/EmptyState';
import { useCategories } from '@/hooks/useCategories';
import { useBrandingColors } from '@/store/brandingStore';
import { getAllGroupedProducts } from '@/services/productService';
import { formatCurrency } from '@/utils/format';
import { matchesProduct, productCode, productCodeNumber } from '@/utils/productSearch';
import type { ProductGrouped } from '@/types';
import ScreenLoader from '@/components/ui/ScreenLoader';

const INK = '#160F28';
const MUTED = '#5B5670';
const LINE = '#E6E3EE';
type StockFilter = 'all' | 'low' | 'with' | 'none' | 'catalog';


const isLow = (p: ProductGrouped) => p.total_stock > 0 && p.total_stock <= (p.min_stock_threshold ?? 3);

export default function DesktopProductsTable() {
  const router = useRouter();
  const colors = useBrandingColors();
  const { filter } = useLocalSearchParams<{ filter?: string }>();
  const { categories } = useCategories();
  const [search, setSearch] = useState('');
  const [stock, setStock] = useState<StockFilter>(filter === 'low_stock' ? 'low' : 'all');
  const [categoryId, setCategoryId] = useState<number | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['grouped-products', 'desktop'],
    queryFn: getAllGroupedProducts,
  });
  const products = data ?? [];

  const categoryName = useMemo(() => {
    const map = new Map<number, string>();
    for (const c of categories as any[]) map.set(c.id, c.name);
    return map;
  }, [categories]);

  const usedCategories = useMemo(() => {
    const ids = new Set(products.map((p) => p.category_id).filter(Boolean) as number[]);
    return (categories as any[]).filter((c) => ids.has(c.id));
  }, [categories, products]);

  const summary = useMemo(() => ({
    total: products.length,
    pieces: products.reduce((a, p) => a + p.total_stock, 0),
    low: products.filter(isLow).length,
    // sem estoque = esgotou por venda; zerado que nunca vendeu é só catálogo e não conta como sem estoque
    none: products.filter((p) => p.total_stock <= 0 && p.has_sales).length,
    catalog: products.filter((p) => p.total_stock <= 0 && !p.has_sales).length,
    inStock: products.filter((p) => p.total_stock > 0).length,
  }), [products]);

  const rows = useMemo(() => {
    return products.filter((p) => {
      if (categoryId != null && p.category_id !== categoryId) return false;
      if (stock === 'low' && !isLow(p)) return false;
      if (stock === 'with' && p.total_stock <= 0) return false;
      if (stock === 'none' && !(p.total_stock <= 0 && p.has_sales)) return false;
      if (stock === 'catalog' && !(p.total_stock <= 0 && !p.has_sales)) return false;
      // cadastro guardado (zerado, nunca vendeu) só aparece no filtro próprio ou na busca
      if (stock === 'all' && !search.trim() && p.total_stock <= 0 && !p.has_sales) return false;
      return matchesProduct(p, search, [categoryName.get(p.category_id ?? -1)]);
    });
  }, [products, search, stock, categoryId, categoryName]);

  const columns: DataColumn<ProductGrouped>[] = useMemo(() => [
    {
      key: 'code', title: 'Código', flex: 0.6, minWidth: 80,
      sortValue: (p) => productCodeNumber(p),
      render: (p) => <Text style={styles.code}>{productCode(p) || '-'}</Text>,
    },
    {
      key: 'name', title: 'Produto', flex: 3, minWidth: 220,
      sortValue: (p) => p.name,
      render: (p) => (
        <View style={{ gap: 2 }}>
          <Text style={styles.name} numberOfLines={2}>{p.name}</Text>
          {p.brand ? <Text style={styles.sub} numberOfLines={1}>{p.brand}</Text> : null}
        </View>
      ),
    },
    {
      key: 'category', title: 'Categoria', flex: 1.4, minWidth: 120,
      sortValue: (p) => categoryName.get(p.category_id ?? -1) ?? '',
      render: (p) => <Text style={styles.cellText} numberOfLines={1}>{categoryName.get(p.category_id ?? -1) ?? '-'}</Text>,
    },
    {
      key: 'variants', title: 'Variações', flex: 0.8, minWidth: 90, align: 'center',
      sortValue: (p) => p.variant_count,
      render: (p) => <Text style={styles.cellText}>{p.variant_count}</Text>,
    },
    {
      key: 'stock', title: 'Estoque', flex: 1, minWidth: 110, align: 'center',
      sortValue: (p) => p.total_stock,
      render: (p) => {
        const none = p.total_stock <= 0;
        const catalogOnly = none && !p.has_sales;
        const low = isLow(p);
        const fg = catalogOnly ? '#6B7280' : none ? '#B4235C' : low ? '#B45309' : '#047857';
        const bg = catalogOnly ? '#F3F4F6' : none ? '#FDECF3' : low ? '#FEF3C7' : '#ECFDF5';
        return (
          <View style={[styles.badge, { backgroundColor: bg }]}>
            <Text style={[styles.badgeText, { color: fg }]}>{catalogOnly ? 'Cadastro guardado' : none ? 'Sem estoque' : `${p.total_stock} un.`}</Text>
          </View>
        );
      },
    },
    {
      key: 'price', title: 'Preço', flex: 1.6, minWidth: 210, align: 'right',
      sortValue: (p) => p.min_price,
      render: (p) => (
        <Text style={[styles.price, { color: colors.primary }]}>
          {p.min_price === p.max_price ? formatCurrency(p.min_price) : `${formatCurrency(p.min_price)} a ${formatCurrency(p.max_price)}`}
        </Text>
      ),
    },
    {
      key: 'open', title: '', flex: 0.3, minWidth: 40, align: 'right',
      render: () => <Ionicons name="chevron-forward" size={16} color="#B3ADC4" />,
    },
  ], [categoryName, colors.primary]);

  const header = (
    <PageHeader
      title="Produtos"
      subtitle={`${summary.inStock.toLocaleString('pt-BR')} em estoque (${summary.pieces.toLocaleString('pt-BR')} peças)${summary.none ? ` · ${summary.none} esgotado(s)` : ''}${summary.catalog ? ` · ${summary.catalog} cadastros guardados` : ''}`}
      rightActions={[
        { icon: 'scan', onPress: () => router.push('/products/wizard?method=scanner') },
      ]}
    />
  );

  if (isLoading) {
    return (
      <View style={styles.screen}>
        {header}
        <ScreenLoader message="Carregando produtos..." />
      </View>
    );
  }
  if (isError) {
    return (
      <View style={styles.screen}>
        {header}
        <EmptyState icon="alert-circle-outline" title="Erro ao carregar produtos" description="Verifique sua conexão e tente novamente" />
        <TouchableOpacity onPress={() => refetch()} style={[styles.primaryBtn, { backgroundColor: colors.primary, alignSelf: 'center' }]}>
          <Text style={styles.primaryBtnText}>Tentar de novo</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const stockChips: { key: StockFilter; label: string }[] = [
    { key: 'all', label: `Produtos (${(summary.total - summary.catalog).toLocaleString('pt-BR')})` },
    { key: 'with', label: 'Com estoque' },
    { key: 'low', label: `Estoque baixo (${summary.low})` },
    { key: 'none', label: `Sem estoque (${summary.none})` },
    { key: 'catalog', label: `Cadastros sem estoque (${summary.catalog})` },
  ];

  return (
    <View style={styles.screen}>
      {header}
      {/* rolagem da página inteira (a barra fica na borda da janela; o conteúdo segue na largura padrão) */}
      <ScrollView style={styles.scroll} contentContainerStyle={styles.body}>
        <View style={styles.toolbar}>
          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={18} color="#8A839E" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Buscar por nome, código, SKU, cor ou marca"
              placeholderTextColor="#8A839E"
              style={styles.searchInput}
              autoCorrect={false}
              accessibilityLabel="Buscar produto"
            />
            {search ? (
              <TouchableOpacity onPress={() => setSearch('')} accessibilityLabel="Limpar busca">
                <Ionicons name="close-circle" size={18} color="#8A839E" />
              </TouchableOpacity>
            ) : null}
          </View>
          <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.primary }]} onPress={() => router.push('/products/wizard')}>
            <Ionicons name="add" size={18} color="#FFFFFF" />
            <Text style={styles.primaryBtnText}>Novo produto</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.chips}>
          {stockChips.map((c) => (
            <TouchableOpacity key={c.key} onPress={() => setStock(c.key)} style={[styles.chip, stock === c.key && styles.chipOn]}>
              <Text style={[styles.chipText, stock === c.key && styles.chipTextOn]}>{c.label}</Text>
            </TouchableOpacity>
          ))}
          {usedCategories.length > 1 && <View style={styles.chipGap} />}
          {usedCategories.length > 1 && usedCategories.map((c: any) => (
            <TouchableOpacity key={c.id} onPress={() => setCategoryId(categoryId === c.id ? null : c.id)} style={[styles.chip, categoryId === c.id && styles.chipOn]}>
              <Text style={[styles.chipText, categoryId === c.id && styles.chipTextOn]}>{c.name}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {products.length === 0 ? (
          <EmptyState icon="cube-outline" title="Nenhum produto cadastrado" description="Cadastre o primeiro produto para começar a vender" />
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(p) => p.id}
            onRowPress={(p) => router.push(`/products/${p.id}`)}
            defaultSort={{ key: 'name', dir: 'asc' }}
            resetKey={`${search}|${stock}|${categoryId}`}
            emptyTitle="Nenhum produto encontrado"
            emptyHint="Tente outro nome ou limpe os filtros."
          />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F6F5FA' },
  // no PC largo as colunas espalhavam por 1.800 px: tabela na largura padrão do PC, centralizada
  scroll: { flex: 1 },
  body: { flexGrow: 1, padding: 20, gap: 12, width: '100%', maxWidth: 1200, alignSelf: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: LINE, backgroundColor: '#FFFFFF' },
  searchInput: { flex: 1, minWidth: 0, fontSize: 14, color: INK, outlineStyle: 'none' } as any,
  primaryBtn: { height: 44, paddingHorizontal: 16, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  primaryBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  chip: { height: 32, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: '#E0DBEA', backgroundColor: '#FFFFFF', justifyContent: 'center' },
  chipOn: { backgroundColor: INK, borderColor: INK },
  chipText: { fontSize: 13, fontWeight: '600', color: INK },
  chipTextOn: { color: '#FFFFFF' },
  chipGap: { width: 12 },
  code: { fontSize: 13, color: MUTED, fontWeight: '600' },
  name: { fontSize: 14, fontWeight: '600', color: INK },
  sub: { fontSize: 12, color: MUTED },
  cellText: { fontSize: 14, color: INK },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  price: { fontSize: 14, fontWeight: '700' },
});
