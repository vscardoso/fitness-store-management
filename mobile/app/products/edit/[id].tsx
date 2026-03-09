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
import { getProductById } from '@/services/productService';
import { getProductStock } from '@/services/inventoryService';
import { getProductVariants, updateVariant, formatVariantLabel } from '@/services/productVariantService';
import { Colors, theme } from '@/constants/Colors';
import type { ProductUpdate } from '@/types';
import { formatPriceInput, formatPriceDisplay, formatMoneyDisplay } from '@/utils/priceFormatter';

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
  // Estoque
  const [currentStock, setCurrentStock] = useState<number>(0);

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

      // Buscar estoque
      (async () => {
        try {
          const inv = await getProductStock(productId);
          setCurrentStock(inv.quantity || 0);
        } catch (e) {
          console.error('Erro ao buscar dados:', e);
        }
      })();
      setCostPrice(safeToFixed(product.cost_price));
      setSalePrice(safeToFixed(product.price));
      
      // Armazenar custo original (converter para number se vier string)
      const originalCost = product.cost_price != null ? Number(product.cost_price) : null;
      setOriginalCostPrice(isNaN(originalCost as number) ? null : originalCost);
      
      console.log('📦 Produto carregado - Custo original:', product.cost_price);
      
      // Buscar estoque
      (async () => {
        try {
          const inv = await getProductStock(productId);
          setCurrentStock(inv.quantity || 0);
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
      const newCost = parseFloat(edit.cost_price?.replace(',', '.') ?? '0');
      const origCost = Number((v as any).cost_price) || 0;
      const hasChange =
        edit.sku !== v.sku ||
        Math.abs(newPrice - v.price) > 0.001 ||
        (!isNaN(newCost) && Math.abs(newCost - origCost) > 0.001);
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

        {/* ── Preços & Estoque (Layout Moderno Unificado) ── */}
        
        {/* Produtos SEM variantes: Preços + Entradas */}
        {!hasVariants && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="pricetags-outline" size={20} color={Colors.light.primary} />
              <Text style={styles.cardTitle}>Preços</Text>
              <View style={styles.stockBadge}>
                <Ionicons name="cube" size={14} color={Colors.light.text} />
                <Text style={styles.stockBadgeText}>{currentStock} un</Text>
              </View>
            </View>
            <View style={styles.cardContent}>
              {/* Grid de Preços */}
              <View style={styles.priceGrid}>
                <View style={[styles.priceCard, errors.costPrice && { borderColor: Colors.light.error, borderWidth: 1.5 }]}>
                  <View style={styles.priceCardHeader}>
                    <Ionicons name="cart-outline" size={18} color={Colors.light.warning} />
                    <Text style={styles.priceCardLabel}>Custo</Text>
                  </View>
                  <TextInput
                    label="Preço de Custo *"
                    value={formatPriceDisplay(costPrice)}
                    onChangeText={(text) => {
                      setCostPrice(formatPriceInput(text));
                      setErrors({ ...errors, costPrice: '' });
                    }}
                    mode="outlined"
                    error={!!errors.costPrice}
                    style={styles.priceInput}
                    keyboardType="numeric"
                    left={<TextInput.Affix text="R$" />}
                    dense
                  />
                  {errors.costPrice && <HelperText type="error" style={{ marginTop: 4 }}>{errors.costPrice}</HelperText>}
                </View>

                <View style={[styles.priceCard, errors.salePrice && { borderColor: Colors.light.error, borderWidth: 1.5 }]}>
                  <View style={styles.priceCardHeader}>
                    <Ionicons name="pricetag" size={18} color={Colors.light.success} />
                    <Text style={styles.priceCardLabel}>Venda</Text>
                  </View>
                  <TextInput
                    label="Preço de Venda *"
                    value={formatPriceDisplay(salePrice)}
                    onChangeText={(text) => {
                      setSalePrice(formatPriceInput(text));
                      setErrors({ ...errors, salePrice: '' });
                    }}
                    mode="outlined"
                    error={!!errors.salePrice}
                    style={styles.priceInput}
                    keyboardType="numeric"
                    left={<TextInput.Affix text="R$" />}
                    dense
                  />
                  {errors.salePrice && <HelperText type="error" style={{ marginTop: 4 }}>{errors.salePrice}</HelperText>}
                </View>
              </View>
          </View>
        </View>
        )}

        {/* Produtos COM variantes: Card 1 — Variações */}
        {hasVariants && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="layers-outline" size={20} color={Colors.light.primary} />
              <Text style={styles.cardTitle}>Variações</Text>
              <View style={styles.stockBadge}>
                <Ionicons name="cube" size={14} color={Colors.light.text} />
                <Text style={styles.stockBadgeText}>{currentStock} un</Text>
              </View>
            </View>
            <View style={styles.cardContent}>
              <View style={styles.fifoInfoPanel}>
                <Ionicons name="layers" size={16} color={Colors.light.info} />
                <Text style={styles.fifoInfoText}>
                  Edite o SKU, custo e preço de venda de cada variação.
                </Text>
              </View>

              {[...(variants ?? [])].sort((a, b) => a.id - b.id).map(variant => {
                const edit = variantEdits[variant.id] ?? {
                  sku: variant.sku,
                  price: (Number(variant.price) || 0).toFixed(2),
                  cost_price: (Number((variant as any).cost_price) || 0).toFixed(2),
                };
                const label = formatVariantLabel(variant);
                const vStock = variant.current_stock ?? 0;
                const priceVal = parseFloat(edit.price.replace(',', '.'));
                const avgCost = parseFloat(edit.cost_price?.replace(',', '.') ?? '0') || 0;
                const margin = !isNaN(priceVal) && priceVal > 0 && avgCost > 0
                  ? (((priceVal - avgCost) / priceVal) * 100).toFixed(1)
                  : null;

                return (
                  <View key={variant.id} style={[styles.variantCard, !variant.is_active && styles.variantCardInactive]}>
                    {/* Header melhorado */}
                    <View style={styles.variantHeader}>
                      <View style={styles.variantHeaderLeft}>
                        <View style={[
                          styles.variantStockDot,
                          vStock === 0 ? { backgroundColor: Colors.light.error }
                            : vStock <= 3 ? { backgroundColor: Colors.light.warning }
                            : { backgroundColor: Colors.light.success }
                        ]} />
                        <View>
                          <Text style={styles.variantName}>{label}</Text>
                          {margin !== null && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                              <Ionicons name="trending-up" size={12} color={Colors.light.success} />
                              <Text style={styles.variantMargin}>{margin}% margem</Text>
                            </View>
                          )}
                        </View>
                      </View>
                      <View style={[
                        styles.variantStockBadge,
                        vStock === 0 ? { backgroundColor: Colors.light.error + '20' }
                          : vStock <= 3 ? { backgroundColor: Colors.light.warning + '20' }
                          : { backgroundColor: Colors.light.success + '20' }
                      ]}>
                        <Text style={[
                          styles.variantStockText,
                          vStock === 0 ? { color: Colors.light.error }
                            : vStock <= 3 ? { color: Colors.light.warning }
                            : { color: Colors.light.success }
                        ]}>
                          {vStock} un
                        </Text>
                      </View>
                    </View>

                    {/* Campos de edição */}
                    <View style={styles.variantFields}>
                      <TextInput
                        label="SKU"
                        value={edit.sku}
                        onChangeText={text => setVariantEdits(prev => ({
                          ...prev,
                          [variant.id]: { ...prev[variant.id], sku: text },
                        }))}
                        mode="outlined"
                        style={styles.variantInput}
                        autoCapitalize="characters"
                        dense
                      />
                      <View style={styles.variantPriceRow}>
                        <TextInput
                          label="Custo"
                          value={formatPriceDisplay(edit.cost_price)}
                          onChangeText={text => setVariantEdits(prev => ({
                            ...prev,
                            [variant.id]: { ...prev[variant.id], cost_price: formatPriceInput(text) },
                          }))}
                          mode="outlined"
                          style={[styles.variantInput, styles.variantInputHalf]}
                          keyboardType="numeric"
                          left={<TextInput.Affix text="R$" />}
                          dense
                        />
                        <TextInput
                          label="Preço de Venda"
                          value={formatPriceDisplay(edit.price)}
                          onChangeText={text => setVariantEdits(prev => ({
                            ...prev,
                            [variant.id]: { ...prev[variant.id], price: formatPriceInput(text) },
                          }))}
                          mode="outlined"
                          style={[styles.variantInput, styles.variantInputHalf]}
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

  // ── Novo Layout Moderno ──
  
  // Badge de estoque no header
  stockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.light.background,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  stockBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.light.text,
  },

  // Grid de preços
  priceGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  priceCard: {
    flex: 1,
    backgroundColor: Colors.light.backgroundSecondary,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  priceCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  priceCardLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.light.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  priceInput: {
    backgroundColor: '#fff',
    marginBottom: 0,
  },

  // Seção de entradas
  entriesSection: {
    marginTop: 8,
    gap: 12,
  },
  entriesSectionVariant: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
    gap: 12,
  },
  entriesSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  entriesSectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.light.text,
  },
  entriesSectionTitleSmall: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.light.textSecondary,
  },

  // Info panel FIFO
  fifoInfoPanel: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: Colors.light.info + '12',
    padding: 12,
    borderRadius: 10,
    borderLeftWidth: 3,
    borderLeftColor: Colors.light.info,
  },
  fifoInfoText: {
    flex: 1,
    fontSize: 13,
    color: Colors.light.text,
    lineHeight: 18,
  },

  // Cards de entrada FIFO
  fifoEntryCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
    overflow: 'hidden',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  fifoEntryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: Colors.light.backgroundSecondary,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  fifoEntryCode: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  fifoEntryCodeText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.light.text,
    fontFamily: 'monospace',
  },
  fifoEntryType: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  fifoEntryTypeText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  fifoEntryBody: {
    padding: 14,
    gap: 10,
  },
  fifoEntryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fifoEntryLabel: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    fontWeight: '600',
  },
  fifoEntryValue: {
    fontSize: 13,
    color: Colors.light.text,
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
  },
  fifoStockIndicator: {
    alignItems: 'flex-end',
    gap: 4,
  },
  fifoStockValue: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.light.text,
  },
  fifoStockEmpty: {
    color: Colors.light.error,
  },
  soldIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  fifoCostContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  fifoCostValue: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.light.primary,
  },
  fifoCostLocked: {
    color: Colors.light.textTertiary,
  },
  fifoEditButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.light.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
  },
  fifoLockedIcon: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fifoProgressBar: {
    height: 6,
    backgroundColor: Colors.light.border,
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 4,
  },
  fifoProgressFill: {
    height: '100%',
    backgroundColor: Colors.light.error,
    borderRadius: 3,
  },

  // Cards compactos para entradas nas variações
  fifoEntryCardCompact: {
    backgroundColor: Colors.light.backgroundSecondary,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  fifoEntryHeaderCompact: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  fifoEntryCodeCompact: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.light.text,
    fontFamily: 'monospace',
  },
  fifoEntryTypeCompact: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  fifoEntryTypeTextCompact: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  fifoEntryBodyCompact: {
    gap: 6,
  },
  fifoSupplierText: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    marginBottom: 2,
  },
  fifoEntryStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fifoStatText: {
    fontSize: 12,
    color: Colors.light.text,
    fontWeight: '600',
  },
  fifoCostContainerCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  fifoCostValueCompact: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.light.primary,
  },
  fifoEditButtonSmall: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.light.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fifoProgressBarCompact: {
    height: 4,
    backgroundColor: Colors.light.border,
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 4,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  emptyStateText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.textSecondary,
  },
  emptyStateSubtext: {
    fontSize: 13,
    color: Colors.light.textTertiary,
    textAlign: 'center',
  },

  // Botões de gerenciar entradas
  manageEntriesButtonCompact: {
    marginTop: 8,
  },

  // Cards de variantes modernos
  variantCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: Colors.light.border,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  variantCardInactive: {
    opacity: 0.5,
    backgroundColor: Colors.light.backgroundSecondary,
  },
  variantHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  variantHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  variantStockDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  variantName: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.light.text,
    marginBottom: 2,
  },
  variantMargin: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.light.success,
  },
  variantStockBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  variantStockText: {
    fontSize: 12,
    fontWeight: '700',
  },
  variantFields: {
    gap: 10,
  },
  variantInput: {
    backgroundColor: Colors.light.background,
    marginBottom: 0,
  },
  variantPriceRow: {
    flexDirection: 'row',
    gap: 10,
  },
  variantInputHalf: {
    flex: 1,
  },

  // Entradas dentro do card de variação
  variantEntriesSection: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
    gap: 6,
  },
  variantEntriesSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  variantEntriesSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.light.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    flex: 1,
  },
  variantEntriesCount: {
    backgroundColor: Colors.light.primary + '18',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  variantEntriesCountText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.light.primary,
  },
  variantEntriesEmpty: {
    fontSize: 12,
    color: Colors.light.textTertiary,
    fontStyle: 'italic',
    paddingVertical: 4,
  },
  variantEntryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: Colors.light.backgroundSecondary,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  variantEntryRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  variantEntryTypeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  variantEntryCode: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.light.text,
  },
  variantEntryMeta: {
    fontSize: 11,
    color: Colors.light.textSecondary,
    marginTop: 1,
  },
  variantEntryRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  variantEntryStock: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.light.textSecondary,
  },
});
