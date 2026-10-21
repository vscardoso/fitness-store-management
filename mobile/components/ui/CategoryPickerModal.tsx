import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  TouchableOpacity,
  FlatList,
  Dimensions,
  TextInput,
  Animated,
  Text,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, theme } from '@/constants/Colors';
import { useCreateCategory } from '@/hooks/useCategories';
import { ActivityIndicator } from '@/components/ui/MagnifierLoader';
import { useBrandingColors } from '@/store/brandingStore';
import type { Category } from '@/types';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface CategoryPickerModalProps {
  visible: boolean;
  categories: Category[];
  selectedId?: number;
  onSelect: (category: Category) => void;
  onDismiss: () => void;
  showProductCount?: boolean;
  /** Mostra "Nova categoria" e cria a categoria direto do seletor (exige perfil admin/gerente) */
  allowCreate?: boolean;
}

// ─── Ícone por nome de categoria ─────────────────────────────────────────────

function getCategoryIcon(category: Category): keyof typeof Ionicons.glyphMap {
  const name = category.name.toLowerCase();
  if (name.includes('roupa') || name.includes('vestuário') || name.includes('camiseta')) return 'shirt-outline';
  if (name.includes('calça') || name.includes('legging') || name.includes('shorts')) return 'fitness-outline';
  if (name.includes('sapato') || name.includes('tênis') || name.includes('calçado')) return 'footsteps-outline';
  if (name.includes('acessório') || name.includes('relógio') || name.includes('óculos')) return 'watch-outline';
  if (name.includes('suplemento') || name.includes('whey') || name.includes('proteína')) return 'nutrition-outline';
  if (name.includes('equipamento') || name.includes('haltere') || name.includes('musculação')) return 'barbell-outline';
  if (name.includes('feminino') || name.includes('feminina')) return 'woman-outline';
  if (name.includes('masculino') || name.includes('masculina')) return 'man-outline';
  if (name.includes('unissex') || name.includes('infantil')) return 'people-outline';
  if (name.includes('mochila') || name.includes('bolsa') || name.includes('bag')) return 'bag-outline';
  return 'pricetag-outline';
}

// Cores neutras para os ícones de categoria (não branding — categorias são entidades neutras)
const CATEGORY_ICON_COLORS = [
  '#6366F1', '#8B5CF6', '#EC4899', '#F59E0B',
  '#10B981', '#3B82F6', '#EF4444', '#06B6D4',
];

function getCategoryColor(id: number): string {
  return CATEGORY_ICON_COLORS[id % CATEGORY_ICON_COLORS.length];
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function CategoryPickerModal({
  visible,
  categories,
  selectedId,
  onSelect,
  onDismiss,
  showProductCount = false,
  allowCreate = false,
}: CategoryPickerModalProps) {
  const brandingColors = useBrandingColors();
  const [searchQuery, setSearchQuery] = useState('');
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  // ── Criação de categoria ──
  const createMutation = useCreateCategory();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);

  const openCreate = (prefill?: string) => {
    setNewName((prefill ?? '').trim());
    setCreateError(null);
    setCreating(true);
  };

  const closeCreate = () => {
    setCreating(false);
    setNewName('');
    setCreateError(null);
  };

  // ── Animação de entrada/saída ──
  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          damping: 22,
          stiffness: 200,
        }),
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: SCREEN_HEIGHT,
          duration: 240,
          useNativeDriver: true,
        }),
        Animated.timing(backdropAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return categories;
    const q = searchQuery.toLowerCase().trim();
    return categories.filter(
      (cat) =>
        cat.name.toLowerCase().includes(q) ||
        (cat.description && cat.description.toLowerCase().includes(q))
    );
  }, [categories, searchQuery]);

  const handleDismiss = () => {
    setSearchQuery('');
    closeCreate();
    onDismiss();
  };

  const handleSelect = (category: Category) => {
    setSearchQuery('');
    closeCreate();
    onSelect(category);
  };

  const handleCreate = async () => {
    const name = newName.trim().replace(/\s+/g, ' ');
    if (name.length < 2) {
      setCreateError('Digite o nome da categoria (mínimo 2 letras).');
      return;
    }
    // Já existe com o mesmo nome? Seleciona a existente em vez de duplicar.
    const existing = categories.find((c) => c.name.trim().toLowerCase() === name.toLowerCase());
    if (existing) {
      handleSelect(existing);
      return;
    }
    try {
      setCreateError(null);
      const created = await createMutation.mutateAsync({ name });
      handleSelect(created);
    } catch (err: any) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail;
      if (status === 403) {
        setCreateError('Você não tem permissão para criar categorias. Peça a um administrador ou gerente.');
      } else if (typeof detail === 'string') {
        setCreateError(detail);
      } else {
        setCreateError('Não foi possível criar a categoria. Tente novamente.');
      }
    }
  };

  // ── Item de categoria ──
  const renderCategory = ({ item }: { item: Category }) => {
    const isSelected = item.id === selectedId;
    const iconColor = getCategoryColor(item.id);
    const icon = getCategoryIcon(item);

    return (
      <TouchableOpacity
        onPress={() => handleSelect(item)}
        style={[
          styles.item,
          isSelected && {
            backgroundColor: brandingColors.primary + '0C',
            borderColor: brandingColors.primary + '40',
          },
        ]}
        activeOpacity={0.65}
      >
        {/* Acento esquerdo — visível apenas quando selecionado */}
        {isSelected && (
          <View style={[styles.itemAccent, { backgroundColor: brandingColors.primary }]} />
        )}

        {/* Ícone */}
        <View style={[styles.iconBox, { backgroundColor: iconColor + '15' }]}>
          <Ionicons name={icon} size={22} color={iconColor} />
        </View>

        {/* Texto */}
        <View style={styles.itemText}>
          <Text style={styles.itemName}>{item.name}</Text>
          {item.description ? (
            <Text style={styles.itemDesc} numberOfLines={1}>{item.description}</Text>
          ) : null}
        </View>

        {/* Indicador de seleção */}
        {isSelected ? (
          <Ionicons name="checkmark-circle" size={22} color={brandingColors.primary} />
        ) : (
          <Ionicons name="chevron-forward" size={16} color={Colors.light.textTertiary} />
        )}
      </TouchableOpacity>
    );
  };

  const renderEmpty = () => (
    <View style={styles.empty}>
      <Ionicons name="search-outline" size={48} color={Colors.light.textTertiary} />
      <Text style={styles.emptyTitle}>
        {searchQuery ? 'Nenhuma categoria encontrada' : 'Sem categorias'}
      </Text>
      <Text style={styles.emptySubtitle}>
        {searchQuery
          ? 'Tente outros termos'
          : allowCreate
            ? 'Crie a primeira categoria acima'
            : 'Cadastre categorias primeiro'}
      </Text>
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType="none"
      onRequestClose={handleDismiss}
    >
      {/* Backdrop animado */}
      <Animated.View
        style={[styles.backdrop, { opacity: backdropAnim }]}
        pointerEvents="box-none"
      >
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={handleDismiss} />
      </Animated.View>

      {/* Sheet deslizante */}
      <Animated.View
        style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}
      >
        {/* Handle */}
        <View style={styles.handle} />

        {/* Header */}
        <View style={styles.header}>
          <View style={[styles.headerIcon, { backgroundColor: brandingColors.primary + '15' }]}>
            <Ionicons name="grid-outline" size={20} color={brandingColors.primary} />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.headerTitle}>Selecionar Categoria</Text>
            <Text style={styles.headerSub}>
              {filteredCategories.length}{' '}
              {filteredCategories.length === 1 ? 'categoria disponível' : 'categorias disponíveis'}
            </Text>
          </View>
          <TouchableOpacity
            onPress={handleDismiss}
            style={styles.closeBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="close" size={20} color={Colors.light.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Busca */}
        <View style={styles.searchRow}>
          <Ionicons name="search-outline" size={18} color={Colors.light.textTertiary} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar categoria..."
            placeholderTextColor={Colors.light.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCorrect={false}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearchQuery('')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close-circle" size={18} color={Colors.light.textTertiary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Nova categoria */}
        {allowCreate && !creating && (
          <TouchableOpacity
            style={[styles.createRow, { borderColor: brandingColors.primary + '55' }]}
            onPress={() => openCreate(searchQuery)}
            activeOpacity={0.7}
          >
            <View style={[styles.createIcon, { backgroundColor: brandingColors.primary + '15' }]}>
              <Ionicons name="add" size={20} color={brandingColors.primary} />
            </View>
            <Text style={[styles.createText, { color: brandingColors.primary }]} numberOfLines={1}>
              {searchQuery.trim() ? `Criar categoria "${searchQuery.trim()}"` : 'Nova categoria'}
            </Text>
          </TouchableOpacity>
        )}

        {allowCreate && creating && (
          <View style={styles.createForm}>
            <Text style={styles.createLabel}>Nome da nova categoria</Text>
            <TextInput
              style={styles.createInput}
              placeholder="Ex: Leggings, Tops, Acessórios"
              placeholderTextColor={Colors.light.textTertiary}
              value={newName}
              onChangeText={(t) => {
                setNewName(t);
                if (createError) setCreateError(null);
              }}
              autoFocus
              maxLength={80}
              returnKeyType="done"
              onSubmitEditing={handleCreate}
              editable={!createMutation.isPending}
            />
            {createError ? <Text style={styles.createError}>{createError}</Text> : null}
            <View style={styles.createActions}>
              <TouchableOpacity
                style={styles.createCancel}
                onPress={closeCreate}
                disabled={createMutation.isPending}
              >
                <Text style={styles.createCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.createSubmit, { backgroundColor: brandingColors.primary }]}
                onPress={handleCreate}
                disabled={createMutation.isPending}
                activeOpacity={0.85}
              >
                {createMutation.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.createSubmitText}>Criar e selecionar</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Divisor */}
        <View style={styles.divider} />

        {/* Lista */}
        <FlatList
          data={filteredCategories}
          renderItem={renderCategory}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={renderEmpty}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={5}
        />
      </Animated.View>
    </Modal>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  createRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 20,
    marginBottom: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  createIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createText: { flex: 1, fontSize: 14, fontWeight: '700' },
  createForm: {
    marginHorizontal: 20,
    marginBottom: 10,
    padding: 14,
    borderRadius: 14,
    backgroundColor: Colors.light.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.light.border,
    gap: 8,
  },
  createLabel: { fontSize: 12, fontWeight: '700', color: Colors.light.textSecondary },
  createInput: {
    height: 44,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.card,
    fontSize: 15,
    color: Colors.light.text,
  },
  createError: { fontSize: 12, color: Colors.light.error },
  createActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 2 },
  createCancel: { paddingVertical: 10, paddingHorizontal: 14, justifyContent: 'center' },
  createCancelText: { fontSize: 14, fontWeight: '600', color: Colors.light.textSecondary },
  createSubmit: {
    minWidth: 150,
    height: 42,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createSubmitText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.52)',
  },

  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: SCREEN_HEIGHT * 0.84,
    backgroundColor: Colors.light.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 32,
    elevation: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
  },

  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.light.border,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 4,
  },

  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.light.text,
  },
  headerSub: {
    fontSize: 12,
    color: Colors.light.textSecondary,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.light.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Busca ──
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    backgroundColor: Colors.light.backgroundSecondary,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  searchIcon: {
    flexShrink: 0,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: Colors.light.text,
    paddingVertical: 0,
  },

  divider: {
    height: 1,
    backgroundColor: Colors.light.border,
    marginBottom: 4,
  },

  // ── Lista ──
  listContent: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.lg,
    gap: 6,
  },

  // ── Item ──
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: Colors.light.backgroundSecondary,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.light.border,
    overflow: 'hidden',
    minHeight: 56,
  },
  itemAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  itemText: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  itemName: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.text,
  },
  itemDesc: {
    fontSize: 12,
    color: Colors.light.textSecondary,
  },

  // ── Empty ──
  empty: {
    alignItems: 'center',
    paddingVertical: theme.spacing.xxl * 1.5,
    gap: theme.spacing.sm,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.light.text,
    marginTop: theme.spacing.sm,
  },
  emptySubtitle: {
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
});
