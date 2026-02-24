import { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import {
  TextInput,
  Button,
  HelperText,
  Text,
  ActivityIndicator,
} from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import PageHeader from '@/components/layout/PageHeader';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import CategoryPickerModal from '@/components/ui/CategoryPickerModal';
import useBackToList from '@/hooks/useBackToList';
import { useQuery } from '@tanstack/react-query';
import { useCategories, useUpdateProduct } from '@/hooks';
import { getProductById, adjustProductQuantity } from '@/services/productService';
import { getProductStock } from '@/services/inventoryService';
import { getProductVariants, updateVariant, formatVariantLabel } from '@/services/productVariantService';
import { Colors, theme } from '@/constants/Colors';
import type { ProductUpdate } from '@/types';
import api from '@/services/api';
import { formatPriceInput, formatPriceDisplay, formatMoneyDisplay } from '@/utils/priceFormatter';
import { getEntryTypeLabel, getEntryTypeColor } from '@/constants/entryTypes';
import EntryItemCostEditor from '@/components/products/EntryItemCostEditor';

export default function EditProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { categories, isLoading: loadingCategories } = useCategories();
  const updateMutation = useUpdateProduct();

  // Validar ID do produto
  const productId = id ? parseInt(id as string) : NaN;
  const isValidId = !isNaN(productId) && productId > 0;

  // Estados do formulário
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
  const [description, setDescription] = useState('');
  const [brand, setBrand] = useState('');
  const [color, setColor] = useState('');
  const [size, setSize] = useState('');
  const [categoryId, setCategoryId] = useState<number | undefined>();
  const [costPrice, setCostPrice] = useState('');
  const [salePrice, setSalePrice] = useState('');

  // Estados de validação e UI
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [menuVisible, setMenuVisible] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [showErrorDialog, setShowErrorDialog] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showCostChangeDialog, setShowCostChangeDialog] = useState(false);
  const [pendingProductData, setPendingProductData] = useState<ProductUpdate | null>(null);
  const [originalCostPrice, setOriginalCostPrice] = useState<number | null>(null);
  // Estoque e Entradas
  const [currentStock, setCurrentStock] = useState<number>(0);
  const [entryItems, setEntryItems] = useState<any[]>([]);
  const [showEntryUpdateDialog, setShowEntryUpdateDialog] = useState(false);
  const [entryToUpdate, setEntryToUpdate] = useState<any>(null);
  const [entryUpdateLoading, setEntryUpdateLoading] = useState(false);
  const [showEntryCostSuccessDialog, setShowEntryCostSuccessDialog] = useState(false);

  /**
   * Query: Buscar produto
   */
  const { data: product, isLoading: loadingProduct, refetch } = useQuery({
    queryKey: ['product', productId],
    queryFn: () => getProductById(productId),
    enabled: isValidId,
  });

  /**
   * Query: Buscar variantes do produto
   */
  const { data: variants } = useQuery({
    queryKey: ['product-variants', productId],
    queryFn: () => getProductVariants(productId),
    enabled: isValidId,
  });

  // Estado para edição inline das variantes
  const [variantEdits, setVariantEdits] = useState<Record<number, {
    sku: string;
    price: string;
    cost_price: string;
  }>>({});

  // Inicializar edits quando variantes carregam
  useEffect(() => {
    if (variants && variants.length > 0) {
      const initial: Record<number, { sku: string; price: string; cost_price: string }> = {};
      variants.forEach(v => {
        initial[v.id] = {
          sku: v.sku,
          price: (Number(v.price) || 0).toFixed(2),
          cost_price: (Number((v as any).cost_price) || 0).toFixed(2),
        };
      });
      setVariantEdits(initial);
    }
  }, [variants]);

  /**
   * Preencher formulário com dados do produto
   */
  useEffect(() => {
    if (product) {
      setName(product.name || '');
      setSku(product.sku || '');
      setBarcode(product.barcode || '');
      setDescription(product.description || '');
      setBrand(product.brand || '');
      setColor(product.color || '');
      setSize(product.size || '');
      setCategoryId(product.category_id);
      
      const safeToFixed = (value: any): string => {
        if (value == null) return '';
        const num = typeof value === 'number' ? value : parseFloat(String(value).replace(',', '.'));
        if (isNaN(num)) return '';
        return num.toFixed(2);
      };

      // Helper para converter unit_cost (pode ser string ou number) para number
      const parseUnitCost = (value: any): number => {
        if (value == null) return 0;
        const num = typeof value === 'number' ? value : parseFloat(String(value).replace(',', '.'));
        return isNaN(num) ? 0 : num;
      };

      // Formatar custo e preço de venda com segurança (aceita number ou string vinda da API)
      setCostPrice(safeToFixed(product.cost_price));
      setSalePrice(safeToFixed(product.price));
      
      // Armazenar custo original (converter para number se vier string)
      const originalCost = product.cost_price != null ? Number(product.cost_price) : null;
      setOriginalCostPrice(isNaN(originalCost as number) ? null : originalCost);
      
      console.log('📦 Produto carregado - Custo original:', product.cost_price);
      
      // Buscar estoque e entry_items
      (async () => {
        try {
          const inv = await getProductStock(productId);
          setCurrentStock(inv.quantity || 0);
          
          // Carregar entry_items se disponível (normalizando unit_cost para number)
          if (product.entry_items && Array.isArray(product.entry_items)) {
            const normalizedEntries = product.entry_items.map((entry: any) => ({
              ...entry,
              unit_cost: typeof entry.unit_cost === 'number' 
                ? entry.unit_cost 
                : parseFloat(String(entry.unit_cost || '0').replace(',', '.')),
            }));
            setEntryItems(normalizedEntries);
          }
        } catch (e) {
          console.error('Erro ao buscar dados:', e);
        }
      })();
    }
  }, [product]);

  // Produto tem variantes configuradas?
  const hasVariants = (variants ?? []).length > 0;

  /**
   * Validar campos obrigatórios
   */
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!name.trim()) {
      newErrors.name = 'Nome é obrigatório';
    }

    // SKU só é obrigatório no nível do produto quando NÃO há variantes
    if (!hasVariants && !sku.trim()) {
      newErrors.sku = 'SKU é obrigatório';
    }

    if (!categoryId) {
      newErrors.categoryId = 'Categoria é obrigatória';
    }

    // Validação de preço só se o produto NÃO tiver variantes
    if (!hasVariants) {
      if (!costPrice || parseFloat(costPrice) <= 0) {
        newErrors.costPrice = 'Preço de custo inválido';
      }

      if (!salePrice || parseFloat(salePrice) <= 0) {
        newErrors.salePrice = 'Preço de venda inválido';
      }

      if (parseFloat(salePrice) < parseFloat(costPrice)) {
        newErrors.salePrice = 'Preço de venda deve ser maior que o custo';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Removido fluxo separado de ajuste de estoque (agora integrado ao salvar)

  /**
   * Salvar variantes alteradas
   */
  const saveVariantChanges = async () => {
    if (!variants || variants.length === 0) return;
    const promises = variants.map(async v => {
      const edit = variantEdits[v.id];
      if (!edit) return;
      const newPrice = parseFloat(edit.price.replace(',', '.'));
      const newCost = parseFloat(edit.cost_price.replace(',', '.'));
      const originalCost = (v as any).cost_price ?? 0;
      const hasChange =
        edit.sku !== v.sku ||
        Math.abs(newPrice - v.price) > 0.001 ||
        Math.abs(newCost - originalCost) > 0.001;
      if (hasChange) {
        await updateVariant(v.id, {
          sku: edit.sku.trim().toUpperCase(),
          price: isNaN(newPrice) ? v.price : newPrice,
          cost_price: isNaN(newCost) ? undefined : newCost,
        });
      }
    });
    await Promise.all(promises);
  };

  /**
   * Salvar alterações
   */
  const handleSave = () => {
    if (!isValidId) return;
    if (!validate()) return;

    // Para produtos com variantes, os preços são por variante
    const productData: ProductUpdate = {
      name: name.trim(),
      sku: hasVariants ? undefined : sku.trim().toUpperCase(),
      barcode: barcode.trim() || undefined,
      description: description.trim() || undefined,
      brand: brand.trim() || undefined,
      color: hasVariants ? undefined : (color.trim() || undefined),
      size: hasVariants ? undefined : (size.trim() || undefined),
      category_id: categoryId!,
      cost_price: hasVariants ? undefined : parseFloat(costPrice),
      price: hasVariants ? undefined : parseFloat(salePrice),
    };

    if (!hasVariants) {
      // Fluxo legado: produto sem variantes, verificar mudança de custo
      const newCost = parseFloat(costPrice);
      if (originalCostPrice !== null && !isNaN(newCost) && Math.abs(newCost - originalCostPrice) > 0.01) {
        setPendingProductData(productData);
        setShowCostChangeDialog(true);
      } else {
        updateMutation.mutate(
          { id: productId, data: productData },
          {
            onSuccess: () => setShowSuccessDialog(true),
            onError: (error: any) => {
              setErrorMessage(error?.response?.data?.detail || 'Falha ao atualizar produto. Verifique os dados.');
              setShowErrorDialog(true);
            },
          }
        );
      }
    } else {
      // Produto com variantes: salvar produto + variantes
      updateMutation.mutate(
        { id: productId, data: productData },
        {
          onSuccess: async () => {
            try {
              await saveVariantChanges();
              setShowSuccessDialog(true);
            } catch (err: any) {
              setErrorMessage(err?.response?.data?.detail || 'Produto salvo, mas houve erro ao atualizar variantes.');
              setShowErrorDialog(true);
            }
          },
          onError: (error: any) => {
            setErrorMessage(error?.response?.data?.detail || 'Falha ao atualizar produto. Verifique os dados.');
            setShowErrorDialog(true);
          },
        }
      );
    }
  };

  /**
   * Confirmar mudança de custo e salvar
   */
  const handleConfirmCostChange = () => {
    console.log('✅ Usuário confirmou mudança de custo');
    setShowCostChangeDialog(false);
    if (pendingProductData) {
      console.log('📤 Enviando atualização:', pendingProductData);
      updateMutation.mutate(
        { id: productId, data: pendingProductData },
        {
          onSuccess: () => {
            console.log('✅ updateProduct sucesso (custo mudou)');
            setShowSuccessDialog(true);
          },
          onError: (error: any) => {
            setErrorMessage(error?.response?.data?.detail || 'Falha ao atualizar produto. Verifique os dados.');
            setShowErrorDialog(true);
          },
        }
      );
      setPendingProductData(null);
    }
  };

  /**
   * Cancelar mudança de custo
   */
  const handleCancelCostChange = () => {
    console.log('❌ Usuário cancelou mudança de custo');
    setShowCostChangeDialog(false);
    setPendingProductData(null);
  };

  /**
   * Iniciar edição de custo de uma entrada
   */
  const handleEditEntryClick = (entry: any) => {
    if (entry.quantity_sold > 0) {
      setErrorMessage(
        `Esta entrada já vendeu ${entry.quantity_sold} unidade(s). ` +
        `Não é possível editar custos de entradas com vendas para manter a rastreabilidade FIFO. ` +
        `Para ajustar custos, crie uma nova entrada de ajuste.`
      );
      setShowErrorDialog(true);
      return;
    }

    setEntryToUpdate(entry);
    setShowEntryUpdateDialog(true);
  };

  /**
   * Confirmar atualização de custo da entrada (via EntryItemCostEditor)
   */
  const handleConfirmEntryUpdate = async (data: { unit_cost: number }) => {
    if (!entryToUpdate) return;
    setEntryUpdateLoading(true);
    try {
      await api.put(`/stock-entries/entry-items/${entryToUpdate.entry_item_id}`, {
        unit_cost: data.unit_cost,
      });
      setEntryItems(prev =>
        prev.map(item =>
          item.entry_item_id === entryToUpdate.entry_item_id
            ? { ...item, unit_cost: data.unit_cost }
            : item
        )
      );
      refetch();
      setShowEntryUpdateDialog(false);
      setEntryToUpdate(null);
      setShowEntryCostSuccessDialog(true);
    } catch (error: any) {
      setErrorMessage(error.response?.data?.detail || 'Erro ao atualizar custo da entrada');
      setShowErrorDialog(true);
    } finally {
      setEntryUpdateLoading(false);
    }
  };



  // Verificar ID inválido
  if (!isValidId) {
    return (
      <View style={styles.loadingContainer}>
        <Ionicons name="alert-circle" size={64} color={Colors.light.error} />
        <Text style={styles.errorTitle}>ID inválido</Text>
        <Text style={styles.errorMessage}>O ID do produto fornecido não é válido.</Text>
        <Text
          style={styles.errorLink}
          onPress={() => router.push('/(tabs)/products')}
        >
          Voltar para produtos
        </Text>
      </View>
    );
  }

  if (loadingProduct) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.light.primary} />
        <Text style={styles.loadingText}>Carregando produto...</Text>
      </View>
    );
  }

  if (!product) {
    return (
      <View style={styles.loadingContainer}>
        <Text>Produto não encontrado</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <PageHeader
        title={product?.name || 'Editar Produto'}
        subtitle={
          (() => {
            const varCount = variants?.length ?? 0;
            if (varCount > 1) {
              return [product?.brand, `${varCount} variações`].filter(Boolean).join(' • ') || undefined;
            }
            // Produto sem variantes múltiplas: mostrar marca, cor, tamanho
            const parts = [product?.brand, product?.color, product?.size].filter(Boolean);
            return parts.length > 0 ? parts.join(' • ') : undefined;
          })()
        }
        showBackButton
        onBack={() => router.back()}
      />

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets={true}
        >
        {/* Informações Básicas */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="information-circle-outline" size={20} color={Colors.light.primary} />
            <Text style={styles.cardTitle}>Informações Básicas</Text>
          </View>
          <View style={styles.cardContent}>
            <TextInput
              label="Nome do Produto *"
              value={name}
              onChangeText={(text) => {
                setName(text);
                setErrors({ ...errors, name: '' });
              }}
              mode="outlined"
              error={!!errors.name}
              style={styles.input}
              placeholder="Ex: Legging Fitness Preta"
            />
            {errors.name ? (
              <HelperText type="error">{errors.name}</HelperText>
            ) : null}

            {/* SKU só fica no nível do produto quando NÃO há variantes */}
            {!hasVariants && (
              <>
                <TextInput
                  label="SKU (Código) *"
                  value={sku}
                  onChangeText={(text) => {
                    setSku(text);
                    setErrors({ ...errors, sku: '' });
                  }}
                  mode="outlined"
                  error={!!errors.sku}
                  style={styles.input}
                  placeholder="Ex: LEG-FIT-001"
                  autoCapitalize="characters"
                />
                {errors.sku ? (
                  <HelperText type="error">{errors.sku}</HelperText>
                ) : null}
              </>
            )}

            <TextInput
              label="Código de Barras"
              value={barcode}
              onChangeText={setBarcode}
              mode="outlined"
              style={styles.input}
              placeholder="Ex: 7891234567890"
              keyboardType="numeric"
            />

            <TextInput
              label="Marca"
              value={brand}
              onChangeText={setBrand}
              mode="outlined"
              style={styles.input}
              placeholder="Ex: Nike, Adidas, Under Armour"
            />

            {/* Cor e Tamanho só no produto quando NÃO há variantes (cada variante tem os seus) */}
            {!hasVariants && (
              <View style={styles.rowInputs}>
                <TextInput
                  label="Cor"
                  value={color}
                  onChangeText={setColor}
                  mode="outlined"
                  style={[styles.input, styles.inputHalf]}
                  placeholder="Ex: Preto, Rosa, Azul"
                />

                <TextInput
                  label="Tamanho"
                  value={size}
                  onChangeText={setSize}
                  mode="outlined"
                  style={[styles.input, styles.inputHalf]}
                  placeholder="PP, P, M, G, GG"
                />
              </View>
            )}

            <TextInput
              label="Descrição"
              value={description}
              onChangeText={setDescription}
              mode="outlined"
              style={styles.input}
              placeholder="Descrição detalhada do produto"
              multiline
              numberOfLines={3}
            />
          </View>
        </View>

        {/* Categoria */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="list-outline" size={20} color={Colors.light.primary} />
            <Text style={styles.cardTitle}>Categoria *</Text>
          </View>
          <View style={styles.cardContent}>
            {loadingCategories ? (
              <HelperText type="info">Carregando categorias...</HelperText>
            ) : categories.length === 0 ? (
              <HelperText type="error">Nenhuma categoria disponível. Cadastre categorias primeiro.</HelperText>
            ) : (
              <>
                <TouchableOpacity
                  onPress={() => setMenuVisible(true)}
                  style={[
                    styles.categoryButton,
                    errors.categoryId && styles.categoryButtonError,
                  ]}
                >
                  <View style={styles.categoryButtonContent}>
                    <Ionicons
                      name="grid-outline"
                      size={20}
                      color={categoryId ? Colors.light.primary : Colors.light.textTertiary}
                    />
                    <Text style={categoryId ? styles.categoryText : styles.categoryPlaceholder}>
                      {categoryId 
                        ? categories.find(c => c.id === categoryId)?.name 
                        : 'Selecione uma categoria'}
                    </Text>
                    <Ionicons
                      name="chevron-forward"
                      size={20}
                      color={Colors.light.textTertiary}
                    />
                  </View>
                </TouchableOpacity>
                {errors.categoryId ? (
                  <HelperText type="error">{errors.categoryId}</HelperText>
                ) : null}
              </>
            )}
          </View>
        </View>

        {/* ── Variantes (para produtos com variantes) ── */}
        {hasVariants && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="layers-outline" size={20} color={Colors.light.primary} />
              <Text style={styles.cardTitle}>Variações ({variants?.length})</Text>
            </View>
            <View style={styles.cardContent}>
              <View style={styles.variantEditInfoBox}>
                <Ionicons name="information-circle" size={16} color={Colors.light.info} />
                <Text style={styles.variantEditInfoText}>
                  Edite SKU, preço de venda e custo de cada variação individualmente.
                </Text>
              </View>

              {(variants ?? []).map(variant => {
                const edit = variantEdits[variant.id] ?? {
                  sku: variant.sku,
                  price: (Number(variant.price) || 0).toFixed(2),
                  cost_price: (Number((variant as any).cost_price) || 0).toFixed(2),
                };
                const label = formatVariantLabel(variant);
                const vStock = variant.current_stock ?? 0;
                const priceVal = parseFloat(edit.price.replace(',', '.'));
                const costVal = parseFloat(edit.cost_price.replace(',', '.'));
                const margin = !isNaN(priceVal) && !isNaN(costVal) && costVal > 0
                  ? (((priceVal - costVal) / costVal) * 100).toFixed(1)
                  : null;

                return (
                  <View key={variant.id} style={[styles.variantEditCard, !variant.is_active && styles.variantEditCardInactive]}>
                    {/* Header da variante */}
                    <View style={styles.variantEditHeader}>
                      <View style={styles.variantEditLabelRow}>
                        <Ionicons name="layers" size={15} color={Colors.light.primary} />
                        <Text style={styles.variantEditLabelText}>{label}</Text>
                      </View>
                      <View style={styles.variantEditHeaderRight}>
                        {margin !== null && (
                          <Text style={styles.variantEditMargin}>{margin}% margem</Text>
                        )}
                        <View style={[
                          styles.variantEditStockBadge,
                          vStock === 0 ? { backgroundColor: Colors.light.error }
                            : vStock <= 3 ? { backgroundColor: Colors.light.warning }
                            : { backgroundColor: Colors.light.success }
                        ]}>
                          <Text style={styles.variantEditStockText}>{vStock} un.</Text>
                        </View>
                      </View>
                    </View>

                    {/* SKU */}
                    <TextInput
                      label="SKU"
                      value={edit.sku}
                      onChangeText={text => setVariantEdits(prev => ({
                        ...prev,
                        [variant.id]: { ...prev[variant.id], sku: text },
                      }))}
                      mode="outlined"
                      style={styles.variantEditInput}
                      autoCapitalize="characters"
                      dense
                    />

                    {/* Preço + Custo */}
                    <View style={styles.rowInputs}>
                      <View style={{ flex: 1 }}>
                        <TextInput
                          label="Preço de Venda"
                          value={formatPriceDisplay(edit.price)}
                          onChangeText={text => setVariantEdits(prev => ({
                            ...prev,
                            [variant.id]: { ...prev[variant.id], price: formatPriceInput(text) },
                          }))}
                          mode="outlined"
                          style={[styles.input, { marginBottom: 0 }]}
                          keyboardType="numeric"
                          left={<TextInput.Affix text="R$" />}
                          dense
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <TextInput
                          label="Custo"
                          value={formatPriceDisplay(edit.cost_price)}
                          onChangeText={text => setVariantEdits(prev => ({
                            ...prev,
                            [variant.id]: { ...prev[variant.id], cost_price: formatPriceInput(text) },
                          }))}
                          mode="outlined"
                          style={[styles.input, { marginBottom: 0 }]}
                          keyboardType="numeric"
                          left={<TextInput.Affix text="R$" />}
                          dense
                        />
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* ── Preços (só para produtos SEM variantes) ── */}
        {!hasVariants && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="cash-outline" size={20} color={Colors.light.primary} />
            <Text style={styles.cardTitle}>Preços</Text>
          </View>
          <View style={styles.cardContent}>
            <TextInput
              label="Preço de Venda (R$) *"
              value={formatPriceDisplay(salePrice)}
              onChangeText={(text) => {
                setSalePrice(formatPriceInput(text));
                setErrors({ ...errors, salePrice: '' });
              }}
              mode="outlined"
              error={!!errors.salePrice}
              style={styles.input}
              placeholder="0,00"
              keyboardType="numeric"
              left={<TextInput.Affix text="R$" />}
            />
            {errors.salePrice ? (
              <HelperText type="error">{errors.salePrice}</HelperText>
            ) : null}

            {/* Info sobre preço de venda */}
            <View style={styles.infoBoxSmall}>
              <Ionicons name="pricetag" size={16} color={Colors.light.success} />
              <Text style={styles.infoBoxSmallText}>
                Este é o preço de venda global do produto
              </Text>
            </View>
          </View>
        </View>
        )}

        {/* Entradas de Estoque (FIFO) */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="cube-outline" size={20} color={Colors.light.primary} />
            <Text style={styles.cardTitle}>Entradas de Estoque (FIFO)</Text>
          </View>
          <View style={styles.cardContent}>
            {/* Resumo */}
            <View style={styles.stockSummary}>
              <View style={styles.stockSummaryItem}>
                <Text style={styles.stockSummaryLabel}>Estoque Total:</Text>
                <Text style={styles.stockSummaryValue}>{currentStock} un</Text>
              </View>
              <View style={styles.stockSummaryItem}>
                <Text style={styles.stockSummaryLabel}>Entradas:</Text>
                <Text style={styles.stockSummaryValue}>{entryItems.length}</Text>
              </View>
            </View>

            {/* Aviso sobre FIFO */}
            <View style={styles.infoBox}>
              <Ionicons name="layers-outline" size={18} color={Colors.light.info} />
              <Text style={styles.infoBoxText}>
                Cada entrada pode ter custo diferente (FIFO). Edite o custo de entradas sem vendas abaixo. Para ajustar quantidades, use a tela de Entradas.
              </Text>
            </View>

            {/* Lista de Entradas */}
            {entryItems.length === 0 ? (
              <View style={styles.emptyEntries}>
                <Ionicons name="archive-outline" size={48} color={Colors.light.textTertiary} />
                <Text style={styles.emptyEntriesText}>Nenhuma entrada de estoque cadastrada</Text>
                <Text style={styles.emptyEntriesSubtext}>
                  Adicione produtos através da tela de Entradas
                </Text>
              </View>
            ) : (
              entryItems.map((entry, index) => {
                const canEdit = entry.quantity_sold === 0;
                const soldPercentage = (entry.quantity_sold / entry.quantity_received) * 100;

                return (
                  <View key={`${entry.entry_item_id}-${index}`} style={styles.entryItem}>
                    {/* Header da entrada */}
                    <View style={styles.entryItemHeader}>
                      <View style={styles.entryItemHeaderLeft}>
                        <Ionicons
                          name="receipt-outline"
                          size={16}
                          color={Colors.light.primary}
                        />
                        <Text style={styles.entryCode}>{entry.entry_code}</Text>
                      </View>
                      <View style={[
                        styles.entryTypeBadge,
                        { backgroundColor: getEntryTypeColor(entry.entry_type) + '20' }
                      ]}>
                        <Text style={[
                          styles.entryTypeText,
                          { color: getEntryTypeColor(entry.entry_type) }
                        ]}>
                          {getEntryTypeLabel(entry.entry_type)}
                        </Text>
                      </View>
                    </View>

                    {/* Informações da entrada */}
                    <View style={styles.entryItemContent}>
                      <View style={styles.entryItemRow}>
                        <Text style={styles.entryItemLabel}>Data:</Text>
                        <Text style={styles.entryItemValue}>
                          {new Date(entry.entry_date).toLocaleDateString('pt-BR')}
                        </Text>
                      </View>

                      <View style={styles.entryItemRow}>
                        <Text style={styles.entryItemLabel}>Fornecedor:</Text>
                        <Text style={styles.entryItemValue} numberOfLines={1}>
                          {entry.supplier_name}
                        </Text>
                      </View>

                      <View style={styles.entryItemRow}>
                        <Text style={styles.entryItemLabel}>Quantidade:</Text>
                        <Text style={styles.entryItemValue}>
                          {entry.quantity_remaining}/{entry.quantity_received} un
                          {entry.quantity_sold > 0 && (
                            <Text style={styles.soldText}> ({entry.quantity_sold} vendidas)</Text>
                          )}
                        </Text>
                      </View>

                      {/* Custo Unitário - Editável se não tiver vendas */}
                      <View style={styles.entryItemRow}>
                        <Text style={styles.entryItemLabel}>Custo Unit.:</Text>
                        <View style={styles.entryItemValueContainer}>
                          <Text style={[
                            styles.entryItemValueMoney,
                            !canEdit && styles.entryItemValueDisabled
                          ]}>
                            R$ {(typeof entry.unit_cost === 'number' ? entry.unit_cost : 0).toFixed(2).replace('.', ',')}
                          </Text>
                          {canEdit ? (
                            <TouchableOpacity
                              onPress={() => handleEditEntryClick(entry)}
                              style={styles.editEntryButton}
                            >
                              <Ionicons name="pencil" size={16} color={Colors.light.primary} />
                            </TouchableOpacity>
                          ) : (
                            <Ionicons name="lock-closed" size={16} color={Colors.light.textTertiary} />
                          )}
                        </View>
                      </View>

                      {/* Barra de progresso de vendas */}
                      {entry.quantity_sold > 0 && (
                        <View style={styles.progressContainer}>
                          <View style={styles.progressBar}>
                            <View style={[
                              styles.progressFill,
                              { width: `${soldPercentage}%` }
                            ]} />
                          </View>
                          <Text style={styles.progressText}>
                            {soldPercentage.toFixed(0)}% vendido
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })
            )}

            {/* Botão para ir para tela de entradas */}
            {entryItems.length > 0 && (
              <Button
                mode="outlined"
                onPress={() => router.push('/entries')}
                style={styles.manageEntriesButton}
                icon="storefront-outline"
              >
                Gerenciar Entradas
              </Button>
            )}
          </View>
        </View>

        {/* Botões de ação */}
        <View style={styles.actions}>
          <Button
            mode="outlined"
            onPress={() => router.back()}
            style={styles.button}
            disabled={updateMutation.isPending}
          >
            Cancelar
          </Button>

          <Button
            mode="contained"
            onPress={handleSave}
            style={[styles.button, styles.buttonPrimary]}
            loading={updateMutation.isPending}
            disabled={updateMutation.isPending}
          >
            Salvar Alterações
          </Button>
        </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Dialog de Sucesso */}
      <ConfirmDialog
        visible={showSuccessDialog}
        title="Produto Atualizado!"
        message="As alterações foram salvas com sucesso."
        confirmText="OK"
        cancelText=""
        onConfirm={() => {
          setShowSuccessDialog(false);
          router.replace(`/products/${productId}`);
        }}
        onCancel={() => setShowSuccessDialog(false)}
        type="success"
        icon="checkmark-circle"
      />

      {/* Dialog de Erro */}
      <ConfirmDialog
        visible={showErrorDialog}
        title="Erro ao Atualizar"
        message={errorMessage}
        confirmText="OK"
        cancelText=""
        onConfirm={() => {
          setShowErrorDialog(false);
          setErrorMessage('');
        }}
        onCancel={() => setShowErrorDialog(false)}
        type="danger"
        icon="alert-circle"
      />

      {/* Dialog de Confirmação de Mudança de Custo */}
      <ConfirmDialog
        visible={showCostChangeDialog}
        title="Atualizar Custo do Produto?"
        message={`Alterar o custo de R$ ${formatMoneyDisplay(originalCostPrice)} para R$ ${formatMoneyDisplay(costPrice)} irá atualizar automaticamente o custo unitário de todos os lotes em estoque deste produto.\n\nIsso garante que o valor do estoque reflita o custo correto. Deseja continuar?`}
        confirmText="Sim, Atualizar"
        cancelText="Cancelar"
        onConfirm={handleConfirmCostChange}
        onCancel={handleCancelCostChange}
        type="warning"
        icon="warning"
      />

      {/* Modal de Seleção de Categoria */}
      <CategoryPickerModal
        visible={menuVisible}
        categories={categories}
        selectedId={categoryId}
        onSelect={(category) => {
          setCategoryId(category.id);
          setErrors({ ...errors, categoryId: '' });
          setMenuVisible(false);
        }}
        onDismiss={() => setMenuVisible(false)}
      />

      {/* Dialog de Sucesso - Custo Unitário de Entrada */}
      <ConfirmDialog
        visible={showEntryCostSuccessDialog}
        title="Custo Atualizado!"
        message="Custo unitário atualizado com sucesso."
        confirmText="OK"
        cancelText=""
        onConfirm={() => setShowEntryCostSuccessDialog(false)}
        onCancel={() => setShowEntryCostSuccessDialog(false)}
        type="success"
        icon="checkmark-circle"
      />

      {/* Modal de Edição de Custo da Entrada */}
      <EntryItemCostEditor
        visible={showEntryUpdateDialog}
        item={entryToUpdate}
        showQuantity={false}
        showSellPrice={false}
        showNotes={false}
        warningText="Ao editar o custo unitário, o custo do produto será atualizado automaticamente."
        loading={entryUpdateLoading}
        onDismiss={() => {
          setShowEntryUpdateDialog(false);
          setEntryToUpdate(null);
        }}
        onConfirm={handleConfirmEntryUpdate}
      />

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.backgroundSecondary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 12,
    color: '#666',
  },
  keyboardView: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginBottom: theme.spacing.md,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.06)',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.light.text,
  },
  cardContent: {
    padding: theme.spacing.md,
  },
  section: {
    marginBottom: theme.spacing.md,
    marginTop: theme.spacing.lg,
  },
  sectionTitle: {
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.semibold,
    color: Colors.light.primary,
    marginBottom: theme.spacing.sm,
  },
  input: {
    marginBottom: theme.spacing.sm,
    backgroundColor: Colors.light.background,
  },
  rowInputs: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  inputHalf: {
    flex: 1,
    marginBottom: 0,
  },
  categoryButton: {
    borderWidth: 1.5,
    borderColor: Colors.light.border,
    borderRadius: 12,
    backgroundColor: '#fff',
    marginBottom: 8,
  },
  categoryButtonError: {
    borderColor: Colors.light.error,
  },
  categoryButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    minHeight: 56,
    gap: 12,
  },
  categoryText: {
    flex: 1,
    fontSize: 16,
    color: Colors.light.text,
    fontWeight: '600',
  },
  categoryPlaceholder: {
    flex: 1,
    fontSize: 16,
    color: Colors.light.textTertiary,
  },
  marginInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#e8f5e9',
    padding: 16,
    borderRadius: 12,
    marginTop: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#2e7d32',
  },
  marginRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  marginLabel: {
    color: '#2e7d32',
    fontWeight: '600',
    fontSize: 14,
  },
  marginValue: {
    fontWeight: '800',
    color: '#1b5e20',
    fontSize: 20,
  },
  warningBox: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    backgroundColor: '#fff3e0',
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: Colors.light.warning,
    marginBottom: 16,
  },
  warningText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: '#666',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    marginBottom: 16,
  },
  infoLabel: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    fontWeight: '600',
  },
  infoValue: {
    fontSize: 16,
    color: Colors.light.text,
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.lg,
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.md,
  },
  button: {
    flex: 1,
    borderRadius: 12,
  },
  buttonPrimary: {
    backgroundColor: Colors.light.primary,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.light.error,
    marginTop: 16,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
    marginHorizontal: 32,
  },
  errorLink: {
    fontSize: 14,
    color: Colors.light.primary,
    marginTop: 16,
    textDecorationLine: 'underline',
    textAlign: 'center',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: Colors.light.info + '15',
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
  },
  infoBoxText: {
    flex: 1,
    fontSize: 13,
    color: Colors.light.text,
    lineHeight: 18,
  },
  infoBoxSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.light.success + '10',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  infoBoxSmallText: {
    flex: 1,
    fontSize: 12,
    color: Colors.light.textSecondary,
  },
  stockSummary: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 16,
    paddingHorizontal: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    marginBottom: 16,
    gap: 12,
  },
  stockSummaryItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  stockSummaryLabel: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  stockSummaryValue: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.light.primary,
  },
  infoBoxText: {
    flex: 1,
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  entryItem: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    marginBottom: 12,
    overflow: 'hidden',
  },
  entryItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#f8f9fa',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  entryItemHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  entryCode: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.light.text,
  },
  entryTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  entryTypeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
    textTransform: 'uppercase',
  },
  entryItemContent: {
    padding: 12,
    gap: 10,
  },
  entryItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  entryItemLabel: {
    fontSize: 13,
    color: '#666',
    fontWeight: '600',
    flex: 1,
  },
  entryItemValue: {
    fontSize: 13,
    color: Colors.light.text,
    fontWeight: '500',
    textAlign: 'right',
  },
  entryItemValueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  entryItemValueMoney: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.light.primary,
  },
  entryItemValueDisabled: {
    color: '#999',
  },
  soldText: {
    fontSize: 11,
    color: Colors.light.error,
    fontWeight: '600',
    marginLeft: 4,
  },
  editEntryButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressContainer: {
    marginTop: 8,
    gap: 4,
  },
  progressBar: {
    height: 8,
    backgroundColor: '#e0e0e0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 11,
    color: '#666',
    fontWeight: '600',
    textAlign: 'right',
  },
  emptyEntries: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    gap: 8,
  },
  emptyEntriesText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    marginTop: 8,
  },
  emptyEntriesSubtext: {
    fontSize: 13,
    color: '#999',
    textAlign: 'center',
    marginHorizontal: 32,
  },
  manageEntriesButton: {
    marginTop: 12,
    borderRadius: 12,
  },
  dialogInput: {
    marginTop: 12,
    backgroundColor: '#fff',
  },

  // ── Estilos para edição de variantes ──
  variantEditInfoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: Colors.light.info + '12',
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  variantEditInfoText: {
    flex: 1,
    fontSize: 13,
    color: Colors.light.info,
    lineHeight: 18,
  },
  variantEditCard: {
    backgroundColor: Colors.light.backgroundSecondary,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
    gap: 10,
  },
  variantEditCardInactive: {
    opacity: 0.55,
  },
  variantEditHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  variantEditLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  variantEditLabelText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.light.text,
  },
  variantEditHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  variantEditMargin: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.light.success,
  },
  variantEditStockBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  variantEditStockText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  variantEditInput: {
    backgroundColor: '#fff',
  },
});
