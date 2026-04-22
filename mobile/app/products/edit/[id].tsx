import { useState, useEffect, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  StatusBar,
  Image,
  Animated,
  Text,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import PageHeader from '@/components/layout/PageHeader';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import CategoryPickerModal from '@/components/ui/CategoryPickerModal';
import { getImageUrl } from '@/constants/Config';
import { useBrandingColors } from '@/store/brandingStore';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCategories, useUpdateProduct } from '@/hooks';
import { getProductById } from '@/services/productService';
import { getProductStock } from '@/services/inventoryService';
import { getProductVariants, updateVariant, formatVariantLabel } from '@/services/productVariantService';
import { uploadProductImageWithFallback } from '@/services/uploadService';
import { Colors, theme } from '@/constants/Colors';
import type { ProductUpdate } from '@/types';
import { formatPriceInput, formatPriceDisplay, formatMoneyDisplay } from '@/utils/priceFormatter';

export default function EditProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const brandingColors = useBrandingColors();
  const queryClient = useQueryClient();
  const { categories, isLoading: loadingCategories } = useCategories();
  const updateMutation = useUpdateProduct();
  const headerAnim = useMemo(() => new Animated.Value(0), []);
  const contentAnim = useMemo(() => new Animated.Value(0), []);

  // Validar ID do produto
  const productId = id ? parseInt(id as string) : NaN;
  const isValidId = !isNaN(productId) && productId > 0;

  const handleBack = () => {
    router.replace('/(tabs)/products' as any);
  };

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

  useFocusEffect(
    useMemo(
      () => () => {
        headerAnim.setValue(0);
        contentAnim.setValue(0);

        Animated.spring(headerAnim, {
          toValue: 1,
          useNativeDriver: true,
          damping: 14,
          stiffness: 120,
          mass: 0.9,
        }).start();

        Animated.spring(contentAnim, {
          toValue: 1,
          useNativeDriver: true,
          damping: 16,
          stiffness: 110,
          mass: 1,
          delay: 140,
        }).start();
      },
      [contentAnim, headerAnim]
    )
  );

  /**
   * Query: Buscar produto
   */
  const { data: product, isLoading: loadingProduct, refetch } = useQuery({
    queryKey: ['product', productId],
    queryFn: () => getProductById(productId),
    enabled: isValidId,
  });

  const uploadProductPhotoMutation = useMutation({
    mutationFn: (imageUri: string) => uploadProductImageWithFallback(productId, imageUri),
    onSuccess: async () => {
      await Promise.all([
        refetch(),
        queryClient.invalidateQueries({ queryKey: ['product', productId] }),
        queryClient.invalidateQueries({ queryKey: ['products'] }),
        queryClient.invalidateQueries({ queryKey: ['grouped-products'] }),
        queryClient.invalidateQueries({ queryKey: ['grouped-products-modal'] }),
        queryClient.invalidateQueries({ queryKey: ['active-products'] }),
        queryClient.invalidateQueries({ queryKey: ['catalog-products-count'] }),
        queryClient.invalidateQueries({ queryKey: ['incomplete-products-count'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory', productId] }),
      ]);
    },
    onError: (error: any) => {
      setErrorMessage(error?.response?.data?.detail || 'Falha ao salvar foto do produto.');
      setShowErrorDialog(true);
    },
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
      
      // Garantir que category_id seja um número válido
      if (product.category_id !== null && product.category_id !== undefined) {
        setCategoryId(product.category_id);
      } else {
        setCategoryId(undefined);
      }
      
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
    }
  }, [product]);

  // Produto tem variantes configuradas?
  const hasVariants = (variants ?? []).length > 0;
  const hasMultipleVariants = (variants ?? []).length > 1;
  const hasSales = product?.has_sales ?? false;

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
    setShowCostChangeDialog(false);
    if (pendingProductData) {
      updateMutation.mutate(
        { id: productId, data: pendingProductData },
        {
          onSuccess: () => {
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
    setShowCostChangeDialog(false);
    setPendingProductData(null);
  };

  const handlePickProductPhoto = async () => {
    if (!isValidId) return;

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      setErrorMessage('Permita acesso à galeria para selecionar a foto do produto.');
      setShowErrorDialog(true);
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.85,
      aspect: [1, 1],
    });

    if (result.canceled) return;

    const selectedUri = result.assets?.[0]?.uri;
    if (!selectedUri) return;

    uploadProductPhotoMutation.mutate(selectedUri);
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
        <ActivityIndicator size="large" color={brandingColors.primary} />
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
      <Animated.View
        style={{
          opacity: headerAnim,
          transform: [{ scale: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }],
        }}
      >
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
          onBack={handleBack}
        />
      </Animated.View>

      <Animated.View
        style={{
          flex: 1,
          opacity: contentAnim,
          transform: [{ translateY: contentAnim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
        }}
      >
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        >
        {/* Informações Básicas */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="information-circle-outline" size={20} color={brandingColors.primary} />
            <Text style={styles.cardTitle}>Informações Básicas</Text>
          </View>
          <View style={styles.cardContent}>
            <Text style={styles.inputLabel}>Nome do Produto *</Text>
            <TextInput
              value={name}
              onChangeText={(text) => {
                setName(text);
                setErrors({ ...errors, name: '' });
              }}
              style={[styles.input, errors.name ? styles.inputError : null]}
              placeholder="Ex: Legging Fitness Preta"
              placeholderTextColor={Colors.light.textTertiary}
            />
            {errors.name ? (
              <Text style={styles.errorHelperText}>{errors.name}</Text>
            ) : null}

            {/* SKU só fica no nível do produto quando NÃO há variantes */}
            {!hasVariants && (
              <>
                <Text style={styles.inputLabel}>SKU (CÓDIGO) *</Text>
                <TextInput
                  value={sku}
                  onChangeText={(text) => {
                    setSku(text);
                    setErrors({ ...errors, sku: '' });
                  }}
                  style={[styles.input, errors.sku ? styles.inputError : null]}
                  placeholder="Ex: LEG-FIT-001"
                  autoCapitalize="characters"
                  placeholderTextColor={Colors.light.textTertiary}
                />
                {errors.sku ? (
                  <Text style={styles.errorHelperText}>{errors.sku}</Text>
                ) : null}
              </>
            )}

            <Text style={styles.inputLabel}>Marca</Text>
            <TextInput
              value={brand}
              onChangeText={setBrand}
              style={styles.input}
              placeholder="Ex: Nike, Adidas, Under Armour"
              placeholderTextColor={Colors.light.textTertiary}
            />

            {/* Cor e Tamanho só no produto quando NÃO há variantes (cada variante tem os seus) */}
            {!hasVariants && (
              <View style={styles.rowInputs}>
                <View style={styles.inputHalf}>
                  <Text style={styles.inputLabel}>Cor</Text>
                  <TextInput
                    value={color}
                    onChangeText={setColor}
                    style={styles.input}
                    placeholder="Ex: Preto, Rosa, Azul"
                    placeholderTextColor={Colors.light.textTertiary}
                  />
                </View>

                <View style={styles.inputHalf}>
                  <Text style={styles.inputLabel}>Tamanho</Text>
                  <TextInput
                    value={size}
                    onChangeText={setSize}
                    style={styles.input}
                    placeholder="PP, P, M, G, GG"
                    placeholderTextColor={Colors.light.textTertiary}
                  />
                </View>
              </View>
            )}

            <Text style={styles.inputLabel}>Descrição</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              style={[styles.input, styles.inputMultiline]}
              placeholder="Descrição detalhada do produto"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              placeholderTextColor={Colors.light.textTertiary}
            />
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="images-outline" size={20} color={brandingColors.primary} />
            <Text style={styles.cardTitle}>Galeria de Fotos</Text>
          </View>
          <View style={styles.cardContent}>
            {/* Preview da foto capa */}
            {product.image_url ? (
              <Image source={{ uri: getImageUrl(product.image_url) }} style={styles.productPhotoPreview} />
            ) : (
              <View style={styles.productPhotoPlaceholder}>
                <Ionicons name="images-outline" size={28} color={Colors.light.textTertiary} />
                <Text style={styles.productPhotoPlaceholderText}>Nenhuma foto adicionada</Text>
              </View>
            )}

            {/* Botão gerenciar galeria */}
            <TouchableOpacity
              style={styles.productPhotoButton}
              onPress={() => router.push(`/products/photos/${productId}` as any)}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={brandingColors.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.productPhotoButtonGradient}
              >
                <Ionicons name="images-outline" size={18} color="#fff" />
                <Text style={styles.productPhotoButtonText}>
                  Gerenciar Galeria
                </Text>
              </LinearGradient>
            </TouchableOpacity>

            <Text style={styles.productPhotoHint}>
              Adicione múltiplas fotos, defina a capa e gerencie fotos por variação na tela de galeria.
            </Text>
          </View>
        </View>

        {/* Categoria */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="list-outline" size={20} color={brandingColors.primary} />
            <Text style={styles.cardTitle}>Categoria *</Text>
          </View>
          <View style={styles.cardContent}>
            {loadingCategories ? (
              <Text style={styles.infoHelperText}>Carregando categorias...</Text>
            ) : categories.length === 0 ? (
              <Text style={styles.errorHelperText}>Nenhuma categoria disponível. Cadastre categorias primeiro.</Text>
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
                      {(() => {
                        if (!categoryId) return 'Selecione uma categoria';
                        // Usar o nome da categoria que vem do produto (mais confiável)
                        if (product?.category?.name) return product.category.name;
                        // Fallback: procurar na lista de categorias
                        const found = categories.find(c => c.id === categoryId);
                        return found?.name || 'Selecione uma categoria';
                      })()}
                    </Text>
                    <Ionicons
                      name="chevron-forward"
                      size={20}
                      color={Colors.light.textTertiary}
                    />
                  </View>
                </TouchableOpacity>
                {errors.categoryId ? (
                  <Text style={styles.errorHelperText}>{errors.categoryId}</Text>
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
              <Ionicons name="pricetags-outline" size={20} color={brandingColors.primary} />
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
                  <Text style={styles.inputLabel}>Preço de Custo *</Text>
                  <View style={[styles.currencyInputWrapper, errors.costPrice ? styles.inputError : null]}>
                    <Text style={styles.currencyPrefix}>R$</Text>
                    <TextInput
                      value={formatPriceDisplay(costPrice)}
                      onChangeText={(text) => {
                        setCostPrice(formatPriceInput(text));
                        setErrors({ ...errors, costPrice: '' });
                      }}
                      style={styles.currencyInput}
                      keyboardType="numeric"
                      placeholder="0,00"
                      placeholderTextColor={Colors.light.textTertiary}
                    />
                  </View>
                  {errors.costPrice ? <Text style={styles.errorHelperText}>{errors.costPrice}</Text> : null}
                </View>

                <View style={[styles.priceCard, errors.salePrice && { borderColor: Colors.light.error, borderWidth: 1.5 }]}>
                  <View style={styles.priceCardHeader}>
                    <Ionicons name="pricetag" size={18} color={Colors.light.success} />
                    <Text style={styles.priceCardLabel}>Venda</Text>
                    {hasSales && (
                      <Ionicons name="lock-closed" size={14} color={Colors.light.textSecondary} style={{ marginLeft: 4 }} />
                    )}
                  </View>
                  <Text style={styles.inputLabel}>Preço de Venda *</Text>
                  <View style={[styles.currencyInputWrapper, errors.salePrice ? styles.inputError : null, hasSales && { backgroundColor: Colors.light.backgroundSecondary }]}>
                    <Text style={styles.currencyPrefix}>R$</Text>
                    <TextInput
                      value={formatPriceDisplay(salePrice)}
                      onChangeText={(text) => {
                        if (hasSales) return;
                        setSalePrice(formatPriceInput(text));
                        setErrors({ ...errors, salePrice: '' });
                      }}
                      style={[styles.currencyInput, hasSales && { color: Colors.light.textSecondary }]}
                      keyboardType="numeric"
                      placeholder="0,00"
                      placeholderTextColor={Colors.light.textTertiary}
                      editable={!hasSales}
                    />
                  </View>
                  {hasSales
                    ? <Text style={styles.lockedHelperText}>Bloqueado — produto com vendas registradas</Text>
                    : errors.salePrice ? <Text style={styles.errorHelperText}>{errors.salePrice}</Text> : null}
                </View>
              </View>
          </View>
        </View>
        )}

        {/* Produtos COM variantes: Card 1 — Variações */}
        {hasVariants && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="layers-outline" size={20} color={brandingColors.primary} />
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
                      <Text style={styles.inputLabel}>SKU</Text>
                      <TextInput
                        value={edit.sku}
                        onChangeText={text => setVariantEdits(prev => ({
                          ...prev,
                          [variant.id]: { ...prev[variant.id], sku: text },
                        }))}
                        style={styles.variantInput}
                        autoCapitalize="characters"
                        placeholder="SKU da variação"
                        placeholderTextColor={Colors.light.textTertiary}
                      />
                      <View style={styles.variantPriceRow}>
                        <View style={styles.variantInputHalf}>
                          <Text style={styles.inputLabel}>Custo</Text>
                          <View style={styles.currencyInputWrapper}>
                            <Text style={styles.currencyPrefix}>R$</Text>
                            <TextInput
                              value={formatPriceDisplay(edit.cost_price)}
                              onChangeText={text => setVariantEdits(prev => ({
                                ...prev,
                                [variant.id]: { ...prev[variant.id], cost_price: formatPriceInput(text) },
                              }))}
                              style={styles.currencyInput}
                              keyboardType="numeric"
                              placeholder="0,00"
                              placeholderTextColor={Colors.light.textTertiary}
                            />
                          </View>
                        </View>
                        <View style={styles.variantInputHalf}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Text style={styles.inputLabel}>Preço de Venda</Text>
                            {hasSales && <Ionicons name="lock-closed" size={11} color={Colors.light.textSecondary} />}
                          </View>
                          <View style={[styles.currencyInputWrapper, hasSales && { backgroundColor: Colors.light.backgroundSecondary }]}>
                            <Text style={styles.currencyPrefix}>R$</Text>
                            <TextInput
                              value={formatPriceDisplay(edit.price)}
                              onChangeText={text => {
                                if (hasSales) return;
                                setVariantEdits(prev => ({
                                  ...prev,
                                  [variant.id]: { ...prev[variant.id], price: formatPriceInput(text) },
                                }));
                              }}
                              style={[styles.currencyInput, hasSales && { color: Colors.light.textSecondary }]}
                              keyboardType="numeric"
                              placeholder="0,00"
                              placeholderTextColor={Colors.light.textTertiary}
                              editable={!hasSales}
                            />
                          </View>
                        </View>
                      </View>
                    </View>
                  </View>
                );
              })}

            </View>
          </View>
        )}
        {/* Botão Gerenciar Fotos (visível quando há variações) */}
        {hasMultipleVariants && (
          <TouchableOpacity
            style={styles.photosButton}
            onPress={() => router.push(`/products/photos/${product!.id}`)}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={brandingColors.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.photosButtonGradient}
            >
              <Ionicons name="images" size={20} color="#fff" />
              <Text style={styles.photosButtonTitle}>Fotos das variações</Text>
              <View style={{ flex: 1 }} />
              <Text style={styles.photosButtonSub}>
                {(variants ?? []).filter((v: any) => v.image_url).length}/{(variants ?? []).filter((v: any) => v.is_active).length} com foto
              </Text>
              <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.7)" />
            </LinearGradient>
          </TouchableOpacity>
        )}

        {/* Botões de ação */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionButton, styles.cancelActionButton]}
            onPress={handleBack}
            disabled={updateMutation.isPending}
            activeOpacity={0.75}
          >
            <Ionicons name="close-circle-outline" size={18} color={Colors.light.textSecondary} />
            <Text style={styles.cancelActionButtonText}>Cancelar</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.saveActionButton, updateMutation.isPending && styles.saveActionButtonDisabled]}
            onPress={handleSave}
            disabled={updateMutation.isPending}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={updateMutation.isPending ? [Colors.light.textTertiary, Colors.light.textTertiary] : brandingColors.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.saveActionButtonGradient}
            >
              {updateMutation.isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
              )}
              <Text style={styles.saveActionButtonText}>
                {updateMutation.isPending ? 'Salvando...' : 'Salvar Alterações'}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
      </Animated.View>

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
    backgroundColor: Colors.light.backgroundSecondary,
  },
  loadingText: {
    marginTop: 12,
    color: Colors.light.textSecondary,
  },
  keyboardView: {
    flex: 1,
    backgroundColor: Colors.light.backgroundSecondary,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: theme.spacing.md,
    paddingBottom: theme.spacing.xxl,
  },
  card: {
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    marginBottom: theme.spacing.md,
    ...theme.shadows.sm,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
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
    minHeight: 52,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: theme.borderRadius.xl,
    paddingHorizontal: theme.spacing.md,
    fontSize: theme.fontSize.base,
    color: Colors.light.text,
    marginBottom: theme.spacing.sm,
    backgroundColor: Colors.light.card,
  },
  inputMultiline: {
    minHeight: 104,
    paddingTop: theme.spacing.sm,
  },
  inputLabel: {
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: Colors.light.textTertiary,
    marginBottom: theme.spacing.xs,
  },
  inputError: {
    borderColor: Colors.light.error,
    borderWidth: 1.5,
  },
  lockedHelperText: {
    marginTop: 4,
    color: Colors.light.textSecondary,
    fontSize: theme.fontSize.xs,
    fontStyle: 'italic',
  },
  errorHelperText: {
    marginTop: 4,
    marginBottom: 8,
    color: Colors.light.error,
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
  },
  infoHelperText: {
    color: Colors.light.textSecondary,
    fontSize: theme.fontSize.sm,
  },
  currencyInputWrapper: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: theme.borderRadius.xl,
    backgroundColor: Colors.light.card,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  currencyPrefix: {
    fontSize: theme.fontSize.base,
    fontWeight: '700',
    color: Colors.light.textSecondary,
    marginRight: 8,
  },
  currencyInput: {
    flex: 1,
    fontSize: theme.fontSize.base,
    color: Colors.light.text,
    paddingVertical: 0,
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
    backgroundColor: Colors.light.card,
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
    backgroundColor: Colors.light.success + '14',
    padding: 16,
    borderRadius: 12,
    marginTop: 8,
    borderLeftWidth: 4,
    borderLeftColor: Colors.light.success,
  },
  marginRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  marginLabel: {
    color: Colors.light.success,
    fontWeight: '600',
    fontSize: 14,
  },
  marginValue: {
    fontWeight: '800',
    color: Colors.light.success,
    fontSize: 20,
  },
  warningBox: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    backgroundColor: Colors.light.warning + '12',
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: Colors.light.warning,
    marginBottom: 16,
  },
  warningText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: Colors.light.textSecondary,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: Colors.light.backgroundSecondary,
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
    paddingHorizontal: 0,
    paddingBottom: theme.spacing.md,
  },
  actionButton: {
    flex: 1,
    borderRadius: theme.borderRadius.lg,
    minHeight: 52,
    overflow: 'hidden',
  },
  cancelActionButton: {
    borderWidth: 1.5,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.card,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  cancelActionButtonText: {
    fontSize: theme.fontSize.base,
    color: Colors.light.textSecondary,
    fontWeight: '700',
  },
  saveActionButton: {
    ...theme.shadows.sm,
  },
  saveActionButtonDisabled: {
    opacity: 1,
  },
  saveActionButtonGradient: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: theme.spacing.md,
  },
  saveActionButtonText: {
    fontSize: theme.fontSize.base,
    color: '#fff',
    fontWeight: '700',
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
    color: Colors.light.textSecondary,
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
    backgroundColor: Colors.light.backgroundSecondary,
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
    color: Colors.light.textSecondary,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  stockSummaryValue: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.light.primary,
  },
  entryItem: {
    backgroundColor: Colors.light.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
    marginBottom: 12,
    overflow: 'hidden',
  },
  entryItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: Colors.light.backgroundSecondary,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
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
    color: Colors.light.card,
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
    color: Colors.light.textSecondary,
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
    color: Colors.light.textTertiary,
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
    backgroundColor: Colors.light.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressContainer: {
    marginTop: 8,
    gap: 4,
  },
  progressBar: {
    height: 8,
    backgroundColor: Colors.light.border,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 11,
    color: Colors.light.textSecondary,
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
    color: Colors.light.textSecondary,
    marginTop: 8,
  },
  emptyEntriesSubtext: {
    fontSize: 13,
    color: Colors.light.textTertiary,
    textAlign: 'center',
    marginHorizontal: 32,
  },
  manageEntriesButton: {
    marginTop: 12,
    borderRadius: 12,
  },
  dialogInput: {
    marginTop: 12,
    backgroundColor: Colors.light.card,
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
    backgroundColor: Colors.light.card,
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
    backgroundColor: Colors.light.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
    overflow: 'hidden',
    elevation: 1,
    shadowColor: Colors.light.text,
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
    backgroundColor: Colors.light.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: Colors.light.border,
    elevation: 2,
    shadowColor: Colors.light.text,
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
    gap: 8,
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
    minHeight: 52,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: theme.borderRadius.xl,
    paddingHorizontal: theme.spacing.md,
    fontSize: theme.fontSize.base,
    color: Colors.light.text,
    backgroundColor: Colors.light.card,
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

  // Thumbnail de foto da variação
  variantThumb: {
    width: 36,
    height: 36,
    borderRadius: 8,
    resizeMode: 'cover',
    marginRight: 2,
  },
  variantThumbPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: Colors.light.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 2,
  },

  productPhotoPreview: {
    width: '100%',
    height: 210,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.backgroundSecondary,
  },
  productPhotoPlaceholder: {
    width: '100%',
    height: 160,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  productPhotoPlaceholderText: {
    fontSize: theme.fontSize.sm,
    color: Colors.light.textTertiary,
    fontWeight: '600',
  },
  productPhotoButton: {
    marginTop: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
  },
  productPhotoButtonGradient: {
    minHeight: 48,
    paddingHorizontal: theme.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  productPhotoButtonText: {
    fontSize: theme.fontSize.base,
    fontWeight: '700',
    color: '#fff',
  },
  productPhotoHint: {
    marginTop: theme.spacing.sm,
    color: Colors.light.textSecondary,
    fontSize: theme.fontSize.xs,
    lineHeight: 16,
  },

  // Botão Gerenciar Fotos
  photosButton: {
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
    ...theme.shadows.sm,
  },
  photosButtonGradient: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  photosButtonText: {},
  photosButtonTitle: {
    fontSize: theme.fontSize.base,
    fontWeight: '700',
    color: '#fff',
  },
  photosButtonSub: {
    fontSize: theme.fontSize.xs,
    color: 'rgba(255,255,255,0.8)',
  },
});
