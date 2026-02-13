import React, { useState, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  TouchableOpacity,
  FlatList,
  Dimensions,
  StatusBar,
} from 'react-native';
import { Text, Searchbar } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors, theme } from '@/constants/Colors';
import type { Category } from '@/types';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface CategoryPickerModalProps {
  visible: boolean;
  categories: Category[];
  selectedId?: number;
  onSelect: (category: Category) => void;
  onDismiss: () => void;
  showProductCount?: boolean;
}

/**
 * Modal premium para seleção de categorias com busca e design visual rico
 */
export default function CategoryPickerModal({
  visible,
  categories,
  selectedId,
  onSelect,
  onDismiss,
  showProductCount = false,
}: CategoryPickerModalProps) {
  const [searchQuery, setSearchQuery] = useState('');

  /**
   * Filtrar categorias por busca
   */
  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return categories;
    
    const query = searchQuery.toLowerCase().trim();
    return categories.filter((cat) =>
      cat.name.toLowerCase().includes(query) ||
      (cat.description && cat.description.toLowerCase().includes(query))
    );
  }, [categories, searchQuery]);

  /**
   * Limpar busca ao fechar
   */
  const handleDismiss = () => {
    setSearchQuery('');
    onDismiss();
  };

  /**
   * Selecionar categoria
   */
  const handleSelect = (category: Category) => {
    setSearchQuery('');
    onSelect(category);
  };

  /**
   * Obter ícone da categoria (pode ser expandido com lógica de mapeamento)
   */
  const getCategoryIcon = (category: Category): keyof typeof Ionicons.glyphMap => {
    // Mapear por nome ou adicionar campo icon no backend futuramente
    const name = category.name.toLowerCase();
    
    if (name.includes('roupa') || name.includes('vestuário')) return 'shirt-outline';
    if (name.includes('calça') || name.includes('legging')) return 'fitness-outline';
    if (name.includes('sapato') || name.includes('tênis')) return 'footsteps-outline';
    if (name.includes('acessório')) return 'watch-outline';
    if (name.includes('suplemento')) return 'nutrition-outline';
    if (name.includes('equipamento')) return 'barbell-outline';
    if (name.includes('feminino')) return 'woman-outline';
    if (name.includes('masculino')) return 'man-outline';
    if (name.includes('unissex')) return 'people-outline';
    
    // Ícone padrão
    return 'pricetag-outline';
  };

  /**
   * Obter cor da categoria baseado no ID (gradiente de cores)
   */
  const getCategoryColor = (id: number): string => {
    const colors = [
      '#6366F1', // Indigo
      '#8B5CF6', // Purple
      '#EC4899', // Pink
      '#F59E0B', // Amber
      '#10B981', // Emerald
      '#3B82F6', // Blue
      '#EF4444', // Red
      '#06B6D4', // Cyan
    ];
    
    return colors[id % colors.length];
  };

  /**
   * Renderizar item da categoria
   */
  const renderCategory = ({ item, index }: { item: Category; index: number }) => {
    const isSelected = item.id === selectedId;
    const categoryColor = getCategoryColor(item.id);
    const categoryIcon = getCategoryIcon(item);

    return (
      <TouchableOpacity
        onPress={() => handleSelect(item)}
        style={[
          styles.categoryItem,
          isSelected && styles.categoryItemSelected,
        ]}
        activeOpacity={0.7}
      >
        <View style={styles.categoryItemContent}>
          {/* Ícone */}
          <View
            style={[
              styles.categoryIconContainer,
              { backgroundColor: categoryColor + '15' },
            ]}
          >
            <Ionicons
              name={categoryIcon}
              size={24}
              color={categoryColor}
            />
          </View>

          {/* Informações */}
          <View style={styles.categoryInfo}>
            <Text style={styles.categoryName}>{item.name}</Text>
            {item.description && (
              <Text style={styles.categoryDescription} numberOfLines={1}>
                {item.description}
              </Text>
            )}
          </View>

          {/* Indicador de seleção */}
          {isSelected && (
            <View style={styles.selectedIndicator}>
              <Ionicons name="checkmark-circle" size={24} color={Colors.light.success} />
            </View>
          )}
        </View>

        {/* Borda colorida para item selecionado */}
        {isSelected && (
          <View
            style={[
              styles.selectedBorder,
              { backgroundColor: Colors.light.success },
            ]}
          />
        )}
      </TouchableOpacity>
    );
  };

  /**
   * Renderizar lista vazia
   */
  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIconContainer}>
        <Ionicons name="search-outline" size={64} color={Colors.light.textTertiary} />
      </View>
      <Text style={styles.emptyTitle}>
        {searchQuery ? 'Nenhuma categoria encontrada' : 'Sem categorias'}
      </Text>
      <Text style={styles.emptyMessage}>
        {searchQuery
          ? 'Tente buscar com outros termos'
          : 'Cadastre categorias primeiro'}
      </Text>
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleDismiss}
      statusBarTranslucent
    >
      <View style={styles.modalOverlay}>
        <StatusBar backgroundColor="rgba(0, 0, 0, 0.5)" barStyle="light-content" />
        
        {/* Fundo escuro clicável para fechar */}
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={handleDismiss}
        />

        {/* Container do modal */}
        <View style={styles.modalContainer}>
          {/* Header com gradiente */}
          <LinearGradient
            colors={[Colors.light.primary, Colors.light.secondary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.modalHeader}
          >
            <View style={styles.headerContent}>
              <View style={styles.headerTop}>
                <View style={styles.headerIconContainer}>
                  <Ionicons name="grid" size={24} color="#fff" />
                </View>
                <Text style={styles.modalTitle}>Selecionar Categoria</Text>
                <TouchableOpacity
                  onPress={handleDismiss}
                  style={styles.closeButton}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="close" size={24} color="#fff" />
                </TouchableOpacity>
              </View>

              {/* Contador de categorias */}
              <View style={styles.statsContainer}>
                <View style={styles.statBadge}>
                  <Ionicons name="pricetags" size={16} color="#fff" />
                  <Text style={styles.statText}>
                    {filteredCategories.length} {filteredCategories.length === 1 ? 'categoria' : 'categorias'}
                  </Text>
                </View>
              </View>
            </View>
          </LinearGradient>

          {/* Barra de Busca */}
          <View style={styles.searchContainer}>
            <Searchbar
              placeholder="Buscar categoria..."
              onChangeText={setSearchQuery}
              value={searchQuery}
              style={styles.searchBar}
              inputStyle={styles.searchInput}
              iconColor={Colors.light.primary}
              placeholderTextColor={Colors.light.textTertiary}
              elevation={0}
            />
          </View>

          {/* Lista de Categorias */}
          <FlatList
            data={filteredCategories}
            renderItem={renderCategory}
            keyExtractor={(item) => item.id.toString()}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={renderEmpty}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            initialNumToRender={10}
            maxToRenderPerBatch={10}
            windowSize={5}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  modalContainer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: SCREEN_HEIGHT * 0.85,
    overflow: 'hidden',
  },
  modalHeader: {
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
  },
  headerContent: {
    gap: theme.spacing.sm,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginHorizontal: theme.spacing.sm,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: theme.spacing.sm,
  },
  statBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  statText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  searchContainer: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  searchBar: {
    elevation: 0,
    backgroundColor: Colors.light.backgroundSecondary,
    borderRadius: 12,
  },
  searchInput: {
    fontSize: 15,
  },
  listContent: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.lg,
  },
  categoryItem: {
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  categoryItemSelected: {
    borderColor: Colors.light.success,
    backgroundColor: Colors.light.success + '05',
  },
  categoryItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.md,
    gap: theme.spacing.md,
  },
  categoryIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryInfo: {
    flex: 1,
    gap: 4,
  },
  categoryName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.light.text,
  },
  categoryDescription: {
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  selectedIndicator: {
    marginLeft: 'auto',
  },
  selectedBorder: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  separator: {
    height: theme.spacing.sm,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.xxl,
    paddingHorizontal: theme.spacing.xl,
  },
  emptyIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.light.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.lg,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.light.text,
    marginBottom: theme.spacing.xs,
    textAlign: 'center',
  },
  emptyMessage: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
});
