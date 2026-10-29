/**
 * Look Builder — monta (ou edita) um look escolhendo produtos E a variação (cor e tamanho) de cada peça.
 * Sem variação escolhida o look não salva: um look "Legging P + Top M" precisa dos tamanhos certos.
 * Com ?id=<look> abre em modo edição: nome, descrição, troca de variação, tirar peça e acrescentar peça.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  Text as RNText,
} from 'react-native';
import { Text, Button, Card, Searchbar, TextInput } from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import PageHeader from '@/components/layout/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import BottomSheet from '@/components/ui/BottomSheet';
import { getAllGroupedProducts } from '@/services/productService';
import {
  createLook,
  getLook,
  updateLook,
  addItemToLook,
  changeLookItemVariant,
  removeItemFromLook,
} from '@/services/lookService';
import { Colors, theme } from '@/constants/Colors';
import { getImageUrl } from '@/constants/Config';
import { formatCurrency } from '@/utils/format';
import { PriceRange } from '@/components/ui/PriceDisplay';
import type { ProductGrouped, ProductVariant } from '@/types';
import type { Look } from '@/types/look';
import { ActivityIndicator } from '@/components/ui/MagnifierLoader';

interface SelectedItem {
  product: ProductGrouped;
  variant: ProductVariant;
  /** Id do item no look salvo (só no modo edição) */
  itemId?: number;
}

const variantLabel = (v: Pick<ProductVariant, 'color' | 'size' | 'sku'>) =>
  [v.color, v.size].filter(Boolean).join(' · ') || v.sku;

export default function LookBuilderScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editId = id ? parseInt(id, 10) : null;
  const isEdit = editId != null && !Number.isNaN(editId);

  const [lookName, setLookName] = useState('');
  const [description, setDescription] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [step, setStep] = useState<'info' | 'products'>(isEdit ? 'products' : 'info');
  // Produto cuja variação está sendo escolhida (folha de cor e tamanho)
  const [choosing, setChoosing] = useState<ProductGrouped | null>(null);
  const [removedItemIds, setRemovedItemIds] = useState<number[]>([]);
  const [original, setOriginal] = useState<Look | null>(null);

  type DialogState = {
    visible: boolean;
    type: 'danger' | 'warning' | 'info' | 'success';
    title: string;
    message: string;
    confirmText?: string;
    onConfirm?: () => void;
  };
  const DIALOG_HIDDEN: DialogState = { visible: false, type: 'info', title: '', message: '' };
  const [dialog, setDialog] = useState<DialogState>(DIALOG_HIDDEN);

  const { data: pages, isLoading } = useQuery({
    queryKey: ['grouped-products', 'all'],
    queryFn: getAllGroupedProducts,
  });

  const { data: existing } = useQuery({
    queryKey: ['look', editId],
    queryFn: () => getLook(editId as number),
    enabled: isEdit,
  });

  // Modo edição: carrega o look salvo uma vez
  useEffect(() => {
    if (!isEdit || !existing || original || !pages) return;
    setOriginal(existing);
    setLookName(existing.name);
    setDescription(existing.description ?? '');
    const items: SelectedItem[] = [];
    for (const it of existing.items) {
      const product = pages.find((p: ProductGrouped) => p.id === it.product_id);
      const variant = product?.variants.find((v: ProductVariant) => v.id === it.variant_id);
      if (product && variant) items.push({ product, variant, itemId: it.id });
    }
    setSelectedItems(items);
  }, [isEdit, existing, original, pages]);

  const allProducts: ProductGrouped[] = useMemo(() => {
    const arr = pages ?? [];
    if (!searchQuery.trim()) return arr;
    const q = searchQuery.toLowerCase();
    return arr.filter(
      (p: ProductGrouped) =>
        p.name.toLowerCase().includes(q) ||
        (p.brand?.toLowerCase().includes(q) ?? false)
    );
  }, [pages, searchQuery]);

  const totalPrice = useMemo(
    () => selectedItems.reduce((acc, i) => acc + (i.variant.price ?? 0), 0),
    [selectedItems]
  );

  const discount = selectedItems.length >= 3 ? 10 : 0;
  const finalPrice = totalPrice * (1 - discount / 100);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (isEdit && original) {
        await updateLook(original.id, { name: lookName.trim(), description: description.trim() || undefined });
        for (const itemId of removedItemIds) await removeItemFromLook(original.id, itemId);
        for (const [idx, item] of selectedItems.entries()) {
          if (item.itemId) {
            const before = original.items.find((o) => o.id === item.itemId);
            if (before && before.variant_id !== item.variant.id) await changeLookItemVariant(original.id, item.itemId, item.variant.id);
          } else {
            await addItemToLook(original.id, { product_id: item.product.id, variant_id: item.variant.id, position: idx });
          }
        }
        return getLook(original.id);
      }
      return createLook({
        name: lookName.trim(),
        description: description.trim() || undefined,
        is_public: true,
        items: selectedItems.map((item, idx) => ({
          product_id: item.product.id,
          variant_id: item.variant.id,
          position: idx,
        })),
      });
    },
    onSuccess: (look) => {
      queryClient.invalidateQueries({ queryKey: ['looks'] });
      queryClient.invalidateQueries({ queryKey: ['look', look.id] });
      router.replace(`/looks/${look.id}`);
    },
    onError: () => {
      setDialog({ visible: true, type: 'danger', title: 'Erro', message: 'Não foi possível salvar o look. Tente novamente.', confirmText: 'OK', onConfirm: () => setDialog(DIALOG_HIDDEN) });
    },
  });

  const handleSave = () => {
    if (!lookName.trim()) {
      setDialog({ visible: true, type: 'warning', title: 'Nome obrigatório', message: 'Informe um nome para o look.', confirmText: 'OK', onConfirm: () => setDialog(DIALOG_HIDDEN) });
      return;
    }
    if (selectedItems.length === 0) {
      setDialog({ visible: true, type: 'warning', title: 'Adicione produtos', message: 'Selecione ao menos um produto.', confirmText: 'OK', onConfirm: () => setDialog(DIALOG_HIDDEN) });
      return;
    }
    saveMutation.mutate();
  };

  const removeProduct = (productId: number) => {
    const found = selectedItems.find((i) => i.product.id === productId);
    if (found?.itemId) setRemovedItemIds((prev) => [...prev, found.itemId as number]);
    setSelectedItems((prev) => prev.filter((i) => i.product.id !== productId));
  };

  const toggleProduct = (product: ProductGrouped) => {
    if (selectedItems.some((i) => i.product.id === product.id)) {
      removeProduct(product.id);
      return;
    }
    if (product.variants.length === 1) {
      setSelectedItems((prev) => [...prev, { product, variant: product.variants[0] }]);
      return;
    }
    if (product.variants.length === 0) {
      setDialog({ visible: true, type: 'warning', title: 'Produto sem variação', message: 'Este produto não tem cor e tamanho cadastrados, então não dá para usá-lo no look.', confirmText: 'OK', onConfirm: () => setDialog(DIALOG_HIDDEN) });
      return;
    }
    setChoosing(product); // várias cores/tamanhos: a lojista escolhe qual vai no look
  };

  const pickVariant = (product: ProductGrouped, variant: ProductVariant) => {
    setSelectedItems((prev) => {
      const idx = prev.findIndex((i) => i.product.id === product.id);
      if (idx >= 0) return prev.map((i, n) => (n === idx ? { ...i, variant } : i));
      return [...prev, { product, variant }];
    });
    setChoosing(null);
  };

  const selectedVariantOf = (productId: number) => selectedItems.find((i) => i.product.id === productId)?.variant ?? null;

  // ── Step 1: Informações do look ──────────────────────────────────────────
  if (step === 'info') {
    return (
      <View style={styles.container}>
        <PageHeader
          title={isEdit ? 'Editar Look' : 'Novo Look'}
          subtitle={isEdit ? 'Nome e descrição' : 'Passo 1 de 2'}
          showBackButton
        />
        <View style={styles.formContainer}>
          <TextInput
            label="Nome do look *"
            value={lookName}
            onChangeText={setLookName}
            mode="outlined"
            placeholder="Ex: Look Treino Moderno"
            style={styles.input}
          />
          <TextInput
            label="Descrição (opcional)"
            value={description}
            onChangeText={setDescription}
            mode="outlined"
            multiline
            numberOfLines={3}
            placeholder="Descreva o estilo ou ocasião..."
            style={styles.input}
          />
          <Button
            mode="contained"
            onPress={() => {
              if (!lookName.trim()) {
                setDialog({ visible: true, type: 'warning', title: 'Nome obrigatório', message: 'Informe um nome para o look.', confirmText: 'OK', onConfirm: () => setDialog(DIALOG_HIDDEN) });
                return;
              }
              setStep('products');
            }}
            style={styles.nextButton}
            icon="arrow-forward"
          >
            Selecionar Produtos
          </Button>
        </View>

        <ConfirmDialog
          visible={dialog.visible}
          type={dialog.type}
          title={dialog.title}
          message={dialog.message}
          confirmText={dialog.confirmText}
          onConfirm={dialog.onConfirm ?? (() => setDialog(DIALOG_HIDDEN))}
          onCancel={() => setDialog(DIALOG_HIDDEN)}
        />
      </View>
    );
  }

  // ── Step 2: Seleção de produtos e variações ───────────────────────────────
  return (
    <View style={styles.container}>
      <PageHeader
        title={lookName || 'Look'}
        subtitle={`${selectedItems.length} peças selecionadas`}
        rightActions={[{ icon: 'create-outline', onPress: () => setStep('info') }]}
      />

      <Searchbar
        placeholder="Buscar produto ou marca..."
        value={searchQuery}
        onChangeText={setSearchQuery}
        style={styles.searchbar}
      />

      {/* Resumo do look */}
      {selectedItems.length > 0 && (
        <Card style={styles.summaryCard}>
          <Card.Content style={styles.summaryContent}>
            <View style={styles.summaryLeft}>
              <Text style={styles.summaryLabel}>
                {selectedItems.length} peças • Total: {formatCurrency(totalPrice)}
              </Text>
              {discount > 0 && (
                <Text style={styles.discountText}>
                  Desconto 3+ peças: -{discount}% → {formatCurrency(finalPrice)}
                </Text>
              )}
            </View>
            <Button
              mode="contained"
              onPress={handleSave}
              loading={saveMutation.isPending}
              compact
            >
              Salvar
            </Button>
          </Card.Content>
        </Card>
      )}

      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.light.primary} />
        </View>
      ) : (
        <FlatList
          data={allProducts}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <ProductSelectCard
              product={item}
              selected={selectedVariantOf(item.id) != null}
              chosen={selectedVariantOf(item.id)}
              onPress={() => toggleProduct(item)}
              onChange={() => setChoosing(item)}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              icon="search-outline"
              title="Nenhum produto encontrado"
              description="Tente buscar por outro termo"
            />
          }
        />
      )}

      {/* Escolha de cor e tamanho da peça */}
      <BottomSheet
        visible={choosing != null}
        onDismiss={() => setChoosing(null)}
        title="Escolha a cor e o tamanho"
        subtitle={choosing?.name}
        icon="color-palette-outline"
      >
        {(choosing?.variants ?? []).map((v) => {
          const on = selectedVariantOf(choosing!.id)?.id === v.id;
          const out = (v.current_stock ?? 0) <= 0;
          return (
            <TouchableOpacity
              key={v.id}
              onPress={() => pickVariant(choosing!, v)}
              style={[styles.sheetOption, on && styles.sheetOptionOn]}
              activeOpacity={0.7}
            >
              <View>
                <RNText style={styles.sheetOptionTitle}>{variantLabel(v)}</RNText>
                <RNText style={[styles.sheetOptionSub, { color: out ? Colors.light.error : Colors.light.success }]}>
                  {out ? 'Sem estoque agora' : `${v.current_stock} em estoque`}
                </RNText>
              </View>
              <RNText style={styles.sheetOptionPrice}>{formatCurrency(v.price)}</RNText>
            </TouchableOpacity>
          );
        })}
      </BottomSheet>

      <ConfirmDialog
        visible={dialog.visible}
        type={dialog.type}
        title={dialog.title}
        message={dialog.message}
        confirmText={dialog.confirmText}
        onConfirm={dialog.onConfirm ?? (() => setDialog(DIALOG_HIDDEN))}
        onCancel={() => setDialog(DIALOG_HIDDEN)}
      />
    </View>
  );
}

function ProductSelectCard({
  product,
  selected,
  chosen,
  onPress,
  onChange,
}: {
  product: ProductGrouped;
  selected: boolean;
  chosen: ProductVariant | null;
  onPress: () => void;
  onChange: () => void;
}) {

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <Card style={[styles.card, selected && styles.cardSelected]}>
        <Card.Content style={styles.cardContent}>
          <View style={styles.iconContainer}>
            {product.image_url ? (
              <Image
                source={{ uri: getImageUrl(product.image_url) }}
                style={styles.productImage}
                resizeMode="cover"
              />
            ) : (
              <Ionicons name="cube" size={28} color={Colors.light.primary} />
            )}
          </View>

          <View style={styles.infoContainer}>
            <Text style={styles.productName} numberOfLines={1}>
              {product.name}
            </Text>
            {product.brand && (
              <Text style={styles.productBrand}>{product.brand}</Text>
            )}
            {chosen ? (
              <View style={styles.variantRow}>
                <RNText style={styles.variantChosen}>{variantLabel(chosen)}</RNText>
                {product.variants.length > 1 && (
                  <TouchableOpacity onPress={onChange} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <RNText style={styles.changeLink}>Trocar</RNText>
                  </TouchableOpacity>
                )}
              </View>
            ) : product.variant_count > 1 ? (
              <RNText style={styles.variantText}>{product.variant_count} variações: toque para escolher</RNText>
            ) : null}
            <View style={styles.productPriceWrap}>
              <PriceRange min={product.min_price} max={product.max_price} inline size={13} minSize={10} color={Colors.light.primary} />
            </View>
          </View>

          <View style={[styles.checkContainer, selected && styles.checkActive]}>
            <Ionicons
              name={selected ? 'checkmark-circle' : 'add-circle-outline'}
              size={28}
              color={selected ? Colors.light.primary : Colors.light.textTertiary}
            />
          </View>
        </Card.Content>
      </Card>
    </TouchableOpacity>
  );
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
  formContainer: {
    padding: 16,
  },
  input: {
    marginBottom: 16,
    backgroundColor: Colors.light.card,
  },
  nextButton: {
    marginTop: 8,
    borderRadius: 12,
  },
  searchbar: {
    marginHorizontal: 16,
    marginBottom: 8,
    elevation: 2,
    backgroundColor: Colors.light.card,
  },
  summaryCard: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: theme.borderRadius.lg,
    elevation: 2,
    backgroundColor: `${Colors.light.primary}10`,
  },
  summaryContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  summaryLeft: {
    flex: 1,
    marginRight: 12,
  },
  summaryLabel: {
    fontWeight: '600',
    fontSize: 13,
  },
  discountText: {
    fontSize: 12,
    color: Colors.light.success,
    marginTop: 2,
  },
  listContent: {
    paddingTop: 8,
    paddingBottom: 80,
  },
  card: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: theme.borderRadius.lg,
    elevation: 1,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  cardSelected: {
    borderColor: Colors.light.primary,
    backgroundColor: `${Colors.light.primary}08`,
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: theme.borderRadius.full,
    backgroundColor: `${Colors.light.primary}15`,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  productImage: {
    width: '100%',
    height: '100%',
  },
  infoContainer: {
    flex: 1,
    marginRight: 8,
  },
  productName: {
    fontWeight: '600',
    fontSize: 14,
  },
  productBrand: {
    fontSize: 11,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  variantText: {
    fontSize: 10,
    color: Colors.light.primary,
    marginTop: 2,
    fontWeight: '600',
  },
  productPriceWrap: {
    marginTop: 4,
  },
  checkContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkActive: {},
  variantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  variantChosen: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.light.primary,
  },
  changeLink: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    textDecorationLine: 'underline',
  },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
    marginBottom: 8,
  },
  sheetOptionOn: {
    borderColor: Colors.light.primary,
    backgroundColor: `${Colors.light.primary}10`,
  },
  sheetOptionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.text,
  },
  sheetOptionSub: {
    fontSize: 12,
    marginTop: 2,
  },
  sheetOptionPrice: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.light.primary,
  },
});

