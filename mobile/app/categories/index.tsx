import { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Text,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useCategories, useDeleteCategory } from '@/hooks/useCategories';
import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import type { Category } from '@/types';
import FAB from '@/components/FAB';
import PageHeader from '@/components/layout/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

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
  '#6366F1', '#10B981', '#F59E0B', '#EF4444',
  '#3B82F6', '#EC4899', '#8B5CF6', '#06B6D4',
];

const getCategoryColor = (id: number): string => {
  return CATEGORY_COLORS[id % CATEGORY_COLORS.length];
};

export default function CategoriesScreen() {
  const router = useRouter();
  const brandingColors = useBrandingColors();
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

  // ── Renderizar categoria (2 por linha) ──
  const renderCategory = ({ item }: { item: Category }) => {
    const color = getCategoryColor(item.id);
    const icon = getCategoryIcon(item.name);
    const children = getChildren(item.id);
    const productCount = (item as any).product_count || 0;

    return (
      <TouchableOpacity
        style={styles.cardWrapper}
        onPress={() => router.push(`/categories/edit/${item.id}`)}
        activeOpacity={0.7}
      >
        <View style={styles.card}>
          {/* Ícone */}
          <View style={[styles.iconContainer, { backgroundColor: color + '15' }]}>
            <Ionicons name={icon} size={32} color={color} />
          </View>

          {/* Nome */}
          <Text style={styles.categoryName} numberOfLines={2}>
            {item.name}
          </Text>

          {/* Descrição */}
          {item.description ? (
            <Text style={styles.categoryDescription} numberOfLines={2}>
              {item.description}
            </Text>
          ) : null}

          {/* Contador */}
          <View style={styles.statsRow}>
            {children.length > 0 && (
              <View style={styles.statBadge}>
                <Ionicons name="folder-outline" size={12} color={Colors.light.textSecondary} />
                <Text style={styles.statText}>{children.length}</Text>
              </View>
            )}
            {productCount > 0 && (
              <View style={styles.statBadge}>
                <Ionicons name="pricetag-outline" size={12} color={Colors.light.textSecondary} />
                <Text style={styles.statText}>{productCount}</Text>
              </View>
            )}
          </View>

          {/* Botões de ação */}
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[styles.actionBtn, { borderColor: brandingColors.primary + '40' }]}
              onPress={(e) => {
                e.stopPropagation();
                router.push(`/categories/edit/${item.id}`);
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="pencil-outline" size={16} color={brandingColors.primary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, { borderColor: Colors.light.error + '40' }]}
              onPress={(e) => {
                e.stopPropagation();
                handleDelete(item);
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="trash-outline" size={16} color={Colors.light.error} />
            </TouchableOpacity>
          </View>
        </View>
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
          onBack={() => router.back()}
        />
      </Animated.View>

      {/* ── Conteúdo animado ── */}
      <Animated.View style={[{ flex: 1 }, contentAnimStyle]}>
        {isLoading && !isRefetching ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={brandingColors.primary} />
            <Text style={styles.loadingText}>Carregando categorias...</Text>
          </View>
        ) : (
          <FlatList
            data={rootCategories}
            keyExtractor={(item) => item.id.toString()}
            renderItem={renderCategory}
            numColumns={2}
            contentContainerStyle={styles.listContent}
            columnWrapperStyle={styles.columnWrapper}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={isRefetching}
                onRefresh={refetch}
                colors={[brandingColors.primary]}
              />
            }
            ListEmptyComponent={
              <EmptyState
                icon="pricetags-outline"
                title="Nenhuma categoria"
                description="Toque no botão + para criar a primeira categoria"
              />
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
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.backgroundSecondary,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.lg,
  },
  loadingText: {
    marginTop: theme.spacing.md,
    color: Colors.light.textSecondary,
    fontSize: theme.fontSize.sm,
  },

  // ── Lista ──
  listContent: {
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.xxl,
  },
  columnWrapper: {
    justifyContent: 'flex-start',
    paddingHorizontal: theme.spacing.sm,
  },

  // ── Card ──
  cardWrapper: {
    width: '47%',
    marginHorizontal: 6,
    marginBottom: theme.spacing.sm,
  },
  card: {
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.light.border,
    ...theme.shadows.sm,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  categoryName: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: theme.spacing.xs,
    color: Colors.light.text,
    minHeight: 36,
  },
  categoryDescription: {
    color: Colors.light.textSecondary,
    fontSize: theme.fontSize.xxs,
    textAlign: 'center',
    marginBottom: theme.spacing.xs,
  },

  // ── Stats ──
  statsRow: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
    marginTop: theme.spacing.xs,
    marginBottom: theme.spacing.sm,
  },
  statBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: Colors.light.backgroundSecondary,
  },
  statText: {
    fontSize: theme.fontSize.xxs,
    fontWeight: '600',
    color: Colors.light.textSecondary,
  },

  // ── Actions ──
  actionsRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    width: '100%',
    justifyContent: 'center',
  },
  actionBtn: {
    flex: 1,
    maxWidth: 60,
    height: 32,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.light.card,
  },
});
