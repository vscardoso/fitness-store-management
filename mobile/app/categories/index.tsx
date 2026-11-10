import { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Text,
  TextInput,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useCategories, useDeleteCategory } from '@/hooks/useCategories';
import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import type { Category } from '@/types';
import FAB from '@/components/FAB';
import PageHeader from '@/components/layout/PageHeader';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useDesktopContentStyle, useListGrid } from '@/hooks/useLayout';

// ── Ícone por palavra-chave no nome da categoria ──
const getCategoryIcon = (name: string): keyof typeof Ionicons.glyphMap => {
  const lower = name.toLowerCase();
  if (lower.includes('suplement') || lower.includes('proteína') || lower.includes('whey')) return 'fitness-outline';
  if (lower.includes('roupa') || lower.includes('camisa') || lower.includes('camiseta') || lower.includes('short')) return 'shirt-outline';
  if (lower.includes('sapato') || lower.includes('tênis') || lower.includes('calçad')) return 'footsteps-outline';
  if (lower.includes('acessór') || lower.includes('bolsa') || lower.includes('mochila')) return 'bag-handle-outline';
  if (lower.includes('equipament') || lower.includes('haltere') || lower.includes('peso')) return 'barbell-outline';
  if (lower.includes('bebida') || lower.includes('energét') || lower.includes('isotônic')) return 'cafe-outline';
  if (lower.includes('vitamina') || lower.includes('minerais') || lower.includes('saúde')) return 'medkit-outline';
  return 'pricetag-outline';
};

// ── Cores para ícones de categorias (ciclo) ──
const CATEGORY_COLORS = [
  Colors.light.primary, Colors.light.success, Colors.light.warning, Colors.light.error,
  Colors.light.info, '#EC4899', '#8B5CF6', '#06B6D4',
];

const getCategoryColor = (id: number): string => {
  return CATEGORY_COLORS[id % CATEGORY_COLORS.length];
};

export default function CategoriesScreen() {
  // PC: a rolagem ocupa a largura toda (barra na borda da janela), conteúdo na coluna
  const listGrid = useListGrid(340, 12, 16);
  const desktopColumn = useDesktopContentStyle();
  const router = useRouter();
  const brandingColors = useBrandingColors();
  const [search, setSearch] = useState('');
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null);
  const [deletedName, setDeletedName] = useState('');
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [showErrorDialog, setShowErrorDialog] = useState(false);
  const { categories, isLoading, refetch, isRefetching } = useCategories();
  const deleteMutation = useDeleteCategory();

  // ── Animação de entrada ──
  const headerOpacity  = useSharedValue(0);
  const headerScale    = useSharedValue(0.94);
  const contentOpacity = useSharedValue(0);
  const contentTransY  = useSharedValue(24);

  useFocusEffect(
    useCallback(() => {
      refetch();

      headerOpacity.value  = 0;
      headerScale.value    = 0.94;
      contentOpacity.value = 0;
      contentTransY.value  = 24;

      headerOpacity.value = withTiming(1, { duration: 380, easing: Easing.out(Easing.quad) });
      headerScale.value   = withSpring(1, { damping: 16, stiffness: 200 });
      const t = setTimeout(() => {
        contentOpacity.value = withTiming(1, { duration: 340 });
        contentTransY.value  = withSpring(0, { damping: 18, stiffness: 200 });
      }, 140);
      return () => clearTimeout(t);
    }, [refetch])
  );

  const headerAnimStyle  = useAnimatedStyle(() => ({
    opacity: headerOpacity.value,
    transform: [{ scale: headerScale.value }],
  }));
  const contentAnimStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ translateY: contentTransY.value }],
  }));

  const handleDelete = (category: Category) => {
    setCategoryToDelete(category);
  };

  const confirmDelete = async () => {
    if (!categoryToDelete) return;
    const name = categoryToDelete.name;
    try {
      await deleteMutation.mutateAsync(categoryToDelete.id);
      setCategoryToDelete(null);
      setDeletedName(name);
      setShowSuccessDialog(true);
    } catch (err: any) {
      setCategoryToDelete(null);
      setDeleteError(err?.response?.data?.detail || 'Não foi possível excluir a categoria.');
      setShowErrorDialog(true);
    }
  };

  // Separar raízes e filhas
  const rootCategories = categories.filter((c) => !c.parent_id);
  const childCategories = categories.filter((c) => !!c.parent_id);
  const getChildren = (parentId: number) =>
    childCategories.filter((c) => c.parent_id === parentId);

  // Busca por nome (sem acento nem caixa), como em Fornecedores
  const norm = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const filtered = search.trim()
    ? rootCategories.filter((c) => norm(c.name).includes(norm(search.trim())))
    : rootCategories;

  // ── Uma categoria por linha (mesmo desenho dos cartões de Fornecedores) ──
  const renderCategory = ({ item }: { item: Category }) => {
    const color = getCategoryColor(item.id);
    const icon = getCategoryIcon(item.name);
    const children = getChildren(item.id);
    const productCount = (item as any).product_count || 0;
    const meta = [
      productCount > 0 ? `${productCount} produto${productCount !== 1 ? 's' : ''}` : '',
      children.length > 0 ? `${children.length} subcategoria${children.length !== 1 ? 's' : ''}` : '',
    ].filter(Boolean).join(' · ') || item.description || '';

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push(`/categories/edit/${item.id}`)}
        activeOpacity={0.75}
      >
        <View style={[styles.cardIcon, { backgroundColor: color + '20' }]}>
          <Ionicons name={icon} size={22} color={color} />
        </View>
        <View style={styles.cardContent}>
          <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
          {meta ? <Text style={styles.cardMeta} numberOfLines={1}>{meta}</Text> : null}
        </View>
        <TouchableOpacity
          onPress={(e) => {
            e.stopPropagation();
            handleDelete(item);
          }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel={`Excluir categoria ${item.name}`}
          style={styles.deleteBtn}
        >
          <Ionicons name="trash-outline" size={18} color={Colors.light.error} />
        </TouchableOpacity>
        <Ionicons name="chevron-forward" size={16} color={Colors.light.textTertiary} />
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* ── Header animado ── */}
      <Animated.View style={headerAnimStyle}>
        <PageHeader
          title="Categorias"
          subtitle={`${rootCategories.length} ${rootCategories.length === 1 ? 'categoria' : 'categorias'}`}
          showBackButton
         
        />
      </Animated.View>
      {/* notebook: corpo da tela numa coluna central (no celular é só uma View com flex 1) */}
      <View style={[{ flex: 1 }, desktopColumn]}>

      {/* ── Conteúdo animado ── */}
      <Animated.View style={[{ flex: 1 }, contentAnimStyle]}>
        {/* Busca, como em Fornecedores */}
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={16} color={Colors.light.textTertiary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar categoria..."
            placeholderTextColor={Colors.light.textTertiary}
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={Colors.light.textTertiary} />
            </TouchableOpacity>
          )}
        </View>

        {isLoading && !isRefetching ? (
          <View style={styles.loadingContainer}>
            {[1, 2, 3, 4, 5].map((i) => (
              <View key={i} style={styles.skeletonCard} />
            ))}
          </View>
        ) : (
          <FlatList
            key={listGrid.listKey}
            style={listGrid.bleedStyle}
            {...listGrid.listProps}
            data={filtered}
            keyExtractor={(item) => item.id.toString()}
            renderItem={listGrid.wrap(renderCategory)}
            contentContainerStyle={[styles.listContent, listGrid.bleedContent]}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={isRefetching}
                onRefresh={refetch}
                colors={[brandingColors.primary]}
              />
            }
            ListEmptyComponent={
              search ? (
                <View style={styles.emptyState}>
                  <Ionicons name="search-outline" size={48} color={Colors.light.textTertiary} />
                  <Text style={styles.emptyTitle}>Nenhum resultado para "{search}"</Text>
                </View>
              ) : (
                <View style={styles.emptyState}>
                  <Ionicons name="pricetags-outline" size={64} color={Colors.light.textTertiary} />
                  <Text style={styles.emptyTitle}>Nenhuma categoria</Text>
                  <Text style={styles.emptySubtitle}>Toque no botão + para criar a primeira categoria</Text>
                </View>
              )
            }
          />
        )}
      </Animated.View>

      {/* FAB */}
      <FAB directRoute="/categories/add" />

      {/* Sucesso de exclusão */}
      <ConfirmDialog
        visible={showSuccessDialog}
        title="Categoria excluída"
        message={`"${deletedName}" foi excluída com sucesso.`}
        confirmText="OK"
        onConfirm={() => setShowSuccessDialog(false)}
        onCancel={() => setShowSuccessDialog(false)}
        type="success"
        icon="checkmark-circle"
      />

      {/* Confirmação de exclusão */}
      <ConfirmDialog
        visible={!!categoryToDelete}
        title="Excluir Categoria"
        message={`Deseja excluir a categoria "${categoryToDelete?.name}"?\n\nProdutos vinculados não serão afetados.`}
        confirmText="Excluir"
        cancelText="Cancelar"
        onConfirm={confirmDelete}
        onCancel={() => setCategoryToDelete(null)}
        type="danger"
        icon="trash"
      />

      {/* Erro de exclusão */}
      <ConfirmDialog
        visible={showErrorDialog}
        title="Erro ao excluir"
        message={deleteError}
        confirmText="OK"
        onConfirm={() => setShowErrorDialog(false)}
        onCancel={() => setShowErrorDialog(false)}
        type="danger"
        icon="alert-circle"
      />
      </View>
    </View>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.backgroundSecondary,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.backgroundSecondary,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    marginHorizontal: theme.spacing.md,
    marginTop: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  searchInput: {
    flex: 1,
    fontSize: theme.fontSize.sm,
    color: Colors.light.text,
  },
  listContent: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.xxl + 60,
    paddingTop: 4,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: Colors.light.border,
    gap: theme.spacing.sm,
    ...theme.shadows.sm,
  },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContent: {
    flex: 1,
    minWidth: 0,
  },
  cardName: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.text,
  },
  cardMeta: {
    fontSize: theme.fontSize.xs,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  deleteBtn: {
    padding: 6,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: theme.spacing.xl,
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.light.text,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: theme.fontSize.sm,
    color: Colors.light.textSecondary,
    textAlign: 'center',
  },
  loadingContainer: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: 4,
    gap: theme.spacing.sm,
  },
  skeletonCard: {
    height: 80,
    borderRadius: theme.borderRadius.xl,
    backgroundColor: Colors.light.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
});
