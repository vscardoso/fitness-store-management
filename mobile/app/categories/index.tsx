import React, { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  StatusBar,
} from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { useCategories, useDeleteCategory } from '@/hooks/useCategories';
import { Colors, theme } from '@/constants/Colors';
import type { Category } from '@/types';
import FAB from '@/components/FAB';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

// Ícones por palavra-chave no nome da categoria
const getCategoryIcon = (name: string): keyof typeof Ionicons.glyphMap => {
  const lower = name.toLowerCase();
  if (lower.includes('suplement') || lower.includes('proteína') || lower.includes('whey')) return 'fitness';
  if (lower.includes('roupa') || lower.includes('camisa') || lower.includes('camiseta') || lower.includes('short')) return 'shirt';
  if (lower.includes('sapato') || lower.includes('tênis') || lower.includes('calçad')) return 'footsteps';
  if (lower.includes('acessór') || lower.includes('bolsa') || lower.includes('mochila')) return 'bag-handle';
  if (lower.includes('equipament') || lower.includes('haltere') || lower.includes('peso')) return 'barbell';
  if (lower.includes('bebida') || lower.includes('energét') || lower.includes('isotônic')) return 'cafe';
  if (lower.includes('vitamina') || lower.includes('minerais') || lower.includes('saúde')) return 'medkit';
  return 'pricetag';
};

// Cores fixas para categorias raiz
const ROOT_CATEGORY_COLORS: [string, string][] = [
  ['#6366F1', '#8B5CF6'],
  ['#10B981', '#059669'],
  ['#F59E0B', '#D97706'],
  ['#EF4444', '#DC2626'],
  ['#3B82F6', '#2563EB'],
  ['#EC4899', '#DB2777'],
  ['#8B5CF6', '#7C3AED'],
];

export default function CategoriesScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null);
  const [deletedName, setDeletedName] = useState('');
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [showErrorDialog, setShowErrorDialog] = useState(false);
  const { categories, isLoading, refetch } = useCategories();
  const deleteMutation = useDeleteCategory();

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

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

  const renderSubcategory = (sub: Category) => (
    <View key={sub.id} style={styles.subItem}>
      <View style={styles.subIconWrap}>
        <Ionicons name="arrow-forward" size={12} color={Colors.light.textSecondary} />
      </View>
      <Text style={styles.subName} numberOfLines={1}>
        {sub.name}
      </Text>
      {sub.description ? (
        <Text style={styles.subDescription} numberOfLines={1}>
          {sub.description}
        </Text>
      ) : null}
      <TouchableOpacity
        style={styles.editBtn}
        onPress={() => router.push(`/categories/edit/${sub.id}`)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="pencil-outline" size={16} color={Colors.light.primary} />
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.deleteBtn}
        onPress={() => handleDelete(sub)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="trash-outline" size={16} color={Colors.light.error} />
      </TouchableOpacity>
    </View>
  );

  const renderCategory = ({ item, index }: { item: Category; index: number }) => {
    const colors = ROOT_CATEGORY_COLORS[index % ROOT_CATEGORY_COLORS.length];
    const children = getChildren(item.id);
    const icon = getCategoryIcon(item.name);

    return (
      <View style={styles.card}>
        {/* Header da categoria raiz */}
        <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.cardHeader}>
          <View style={styles.cardIconWrap}>
            <Ionicons name={icon} size={24} color="#fff" />
          </View>
          <View style={styles.cardInfo}>
            <Text style={styles.cardName}>{item.name}</Text>
            {item.description ? (
              <Text style={styles.cardDescription} numberOfLines={1}>
                {item.description}
              </Text>
            ) : null}
            <Text style={styles.cardMeta}>
              {children.length} subcategoria{children.length !== 1 ? 's' : ''}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.cardEditBtn}
            onPress={() => router.push(`/categories/edit/${item.id}`)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="pencil-outline" size={18} color="rgba(255,255,255,0.9)" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.cardDeleteBtn}
            onPress={() => handleDelete(item)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="trash-outline" size={18} color="rgba(255,255,255,0.9)" />
          </TouchableOpacity>
        </LinearGradient>

        {/* Subcategorias */}
        {children.length > 0 && (
          <View style={styles.childrenWrap}>
            {children.map(renderSubcategory)}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.light.primary} />

      {/* Header */}
      <LinearGradient
        colors={[Colors.light.primary, Colors.light.secondary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerTitles}>
          <Text style={styles.headerTitle}>Categorias</Text>
          <Text style={styles.headerSubtitle}>
            {categories.length} categoria{categories.length !== 1 ? 's' : ''} cadastrada{categories.length !== 1 ? 's' : ''}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => router.push('/categories/add')}
        >
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </LinearGradient>

      {/* Conteúdo */}
      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={Colors.light.primary} />
        </View>
      ) : (
        <FlatList
          data={rootCategories}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderCategory}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[Colors.light.primary]}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Ionicons name="pricetags-outline" size={64} color={Colors.light.textTertiary} />
              <Text style={styles.emptyTitle}>Nenhuma categoria</Text>
              <Text style={styles.emptyDesc}>
                Toque no botão + para criar a primeira categoria
              </Text>
            </View>
          }
        />
      )}

      <FAB directRoute="/categories/add" bottom={24} />

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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.backgroundSecondary,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 50,
    paddingBottom: theme.spacing.lg,
    paddingHorizontal: theme.spacing.md,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    gap: theme.spacing.md,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitles: {
    flex: 1,
  },
  headerTitle: {
    fontSize: theme.fontSize.xxl,
    fontWeight: '700',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: theme.fontSize.sm,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Loading
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // List
  list: {
    padding: theme.spacing.md,
    paddingBottom: 120,
    gap: theme.spacing.md,
  },

  // Card (categoria raiz)
  card: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    backgroundColor: Colors.light.card,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.md,
    gap: theme.spacing.md,
  },
  cardIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardInfo: {
    flex: 1,
  },
  cardName: {
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    color: '#fff',
  },
  cardDescription: {
    fontSize: theme.fontSize.xs,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
  },
  cardMeta: {
    fontSize: theme.fontSize.xs,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 4,
  },
  cardEditBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardDeleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Subcategorias
  childrenWrap: {
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    gap: 2,
  },
  subItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    gap: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
  },
  subIconWrap: {
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  subName: {
    flex: 1,
    fontSize: theme.fontSize.base,
    color: Colors.light.text,
    fontWeight: '500',
  },
  subDescription: {
    fontSize: theme.fontSize.xs,
    color: Colors.light.textSecondary,
    flex: 1,
  },
  editBtn: {
    padding: 4,
  },
  deleteBtn: {
    padding: 4,
  },

  // Empty state
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    gap: theme.spacing.md,
  },
  emptyTitle: {
    fontSize: theme.fontSize.xl,
    fontWeight: '700',
    color: Colors.light.text,
  },
  emptyDesc: {
    fontSize: theme.fontSize.base,
    color: Colors.light.textSecondary,
    textAlign: 'center',
    paddingHorizontal: theme.spacing.xl,
  },
});
