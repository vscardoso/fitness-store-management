/**
 * WizardStep2 - Confirmar e Editar Dados
 *
 * - Edição inline de todos os campos
 * - Design moderno com cards organizados
 * - Seção expansível para detalhes opcionais
 * - Cálculo automático de markup
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  TextInput as RNTextInput,
  Keyboard,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Text, Button, Card, TextInput, HelperText } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import type { UseProductWizardReturn } from '@/hooks/useProductWizard';
import type { Category } from '@/types';
import CategoryPickerModal from '@/components/ui/CategoryPickerModal';
import VariantBuilderInline from '@/components/products/VariantBuilderInline';
import KeyboardAwareScreen from '@/components/ui/KeyboardAwareScreen';
import { getActiveProducts } from '@/services/productService';
import { generateSKU, generateVariantSKU } from '@/utils/skuGenerator';
import { capitalizeWords } from '@/utils/format';

interface WizardStep2Props {
  wizard: UseProductWizardReturn;
  categories: Category[];
  onBack: () => void;
}

export default function WizardStep2({
  wizard,
  categories: categoriesProp,
  onBack,
}: WizardStep2Props) {
  // Guard defensivo: garante que categories é sempre um array
  const categories = Array.isArray(categoriesProp) ? categoriesProp : [];
  const { state } = wizard;
  const brandingColors = useBrandingColors();
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  // Refs para navegação entre campos
  const nameRef = useRef<RNTextInput>(null);
  const skuRef = useRef<RNTextInput>(null);
  const costRef = useRef<RNTextInput>(null);
  const saleRef = useRef<RNTextInput>(null);
  const brandRef = useRef<RNTextInput>(null);
  const colorRef = useRef<RNTextInput>(null);
  const sizeRef = useRef<RNTextInput>(null);
  const genderRef = useRef<RNTextInput>(null);
  const materialRef = useRef<RNTextInput>(null);
  const descRef = useRef<RNTextInput>(null);

  // Controla se o usuário editou o SKU manualmente (desativa auto-regeneração)
  const [skuManuallyEdited, setSkuManuallyEdited] = useState(false);

  // Lista de SKUs existentes para garantir unicidade
  const [existingSKUs, setExistingSKUs] = useState<string[]>([]);

  // Local state para edição inline
  const [formData, setFormData] = useState(state.productData);
  const [markup, setMarkup] = useState<number | null>(null);

  // Estados locais para preços (strings durante edição)
  const [costPriceStr, setCostPriceStr] = useState(
    state.productData.cost_price ? Number(state.productData.cost_price).toFixed(2) : ''
  );
  const [salePriceStr, setSalePriceStr] = useState(
    state.productData.price ? Number(state.productData.price).toFixed(2) : ''
  );

  // Carregar SKUs existentes ao montar o componente
  useEffect(() => {
    const loadExistingSKUs = async () => {
      try {
        const products = await getActiveProducts({ limit: 1000 });
        const skus = products.map(p => p.sku).filter(Boolean);
        setExistingSKUs(skus);
      } catch (error) {
        console.error('Erro ao carregar SKUs existentes:', error);
      }
    };
    loadExistingSKUs();
  }, []);

  // Atualizar dados no wizard quando formData mudar
  useEffect(() => {
    const updatedData = {
      ...formData,
      cost_price: costPriceStr ? parseFloat(costPriceStr) : undefined,
      price: salePriceStr ? parseFloat(salePriceStr) : undefined,
    };
    wizard.updateProductData(updatedData);
  }, [formData, costPriceStr, salePriceStr]);

  // ── BLOCO BLINDADO ────────────────────────────────────────────────────────────
  // Auto-regenerar SKU quando name/brand mudam (se não editado manualmente).
  // Quando variantes estão ativas: SKU base NÃO inclui cor/tamanho (ficam nas variantes).
  // Quando não há variantes: SKU inclui cor e tamanho do formData.
  //
  // GUARD OBRIGATÓRIO: se createdProduct.id > 0, o produto JÁ EXISTE no banco
  // (selecionado via "Usar Similar"). NÃO regenerar SKU neste caso — isso causava
  // o bug de "duplicidade" onde o generateSKU detectava o SKU original como
  // "já usado" e gerava um sufixo -002, -003, etc.
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (skuManuallyEdited) return;
    if (!formData.name?.trim()) return;
    // Guard: produto existente selecionado via "Usar Similar" — SKU não deve ser regenerado
    if (state.createdProduct?.id && state.createdProduct.id > 0) return;

    const newSku = state.hasVariants
      ? generateSKU(formData.name || '', formData.brand, null, null, existingSKUs)
      : generateSKU(formData.name || '', formData.brand, formData.color, formData.size, existingSKUs);

    setFormData(prev => ({ ...prev, sku: newSku }));
  }, [formData.name, formData.brand, formData.color, formData.size, state.hasVariants, skuManuallyEdited, existingSKUs, state.createdProduct?.id]);
  // ─────────────────────────────────────────────────────────────────────────────

  // Preview dos SKUs que serão gerados para cada variante
  // Usa a mesma lógica do handleCreateProduct no wizard
  const variantSkuPreviews = useMemo((): Array<{ label: string; sku: string }> => {
    if (!state.hasVariants) return [];
    const baseSku = formData.sku?.trim().toUpperCase() || '';
    if (!baseSku) return [];

    const colors = state.variantColors.length > 0 ? state.variantColors : [''];
    const previews: Array<{ label: string; sku: string }> = [];
    const usedSkus: string[] = [];

    for (const color of colors) {
      const sizesForColor = state.colorSizes[color] ?? state.variantSizes;
      const sizes = sizesForColor.length > 0 ? sizesForColor : [''];
      for (const size of sizes) {
        const sku = generateVariantSKU(baseSku, color || null, size || null, usedSkus);
        usedSkus.push(sku);
        const parts = [color, size].filter(Boolean);
        previews.push({ label: parts.length > 0 ? parts.join(' / ') : '—', sku });
      }
    }
    return previews;
  }, [state.hasVariants, formData.sku, state.variantColors, state.variantSizes, state.colorSizes]);


  // Calcular markup automaticamente
  useEffect(() => {
    const cost = parseFloat(costPriceStr) || 0;
    const price = parseFloat(salePriceStr) || 0;
    if (cost > 0 && price > cost) {
      const calculatedMarkup = ((price - cost) / cost) * 100;
      setMarkup(calculatedMarkup);
    } else {
      setMarkup(null);
    }
  }, [costPriceStr, salePriceStr]);

  const selectedCategory = categories.find(c => c.id === formData.category_id);

  /**
   * Formatar entrada de preço com centavos
   * Remove tudo exceto números e converte em decimal
   */
  const formatPriceInput = (text: string): string => {
    // Remove tudo exceto números
    const numbers = text.replace(/[^0-9]/g, '');

    if (numbers.length === 0) return '';

    // Converte para número com centavos
    const value = parseInt(numbers) / 100;

    // Formata com 2 casas decimais
    return value.toFixed(2);
  };

  const updateField = (field: string, value: any) => {
    setFormData({ ...formData, [field]: value });
  };

  /**
   * Regenerar SKU automaticamente baseado nos dados atuais
   */
  const handleRegenerateSKU = () => {
    const newSku = state.hasVariants
      ? generateSKU(formData.name || '', formData.brand, null, null, existingSKUs)
      : generateSKU(formData.name || '', formData.brand, formData.color, formData.size, existingSKUs);
    setFormData({ ...formData, sku: newSku });
  };

  const handleCreate = async () => {
    if (state.createdProduct?.id && state.createdProduct.id > 0) {
      // Se o usuário adicionou variantes novas a um produto já existente no banco
      // (ex: restaurado da tela de produtos incompletos), precisamos gerar o fluxo
      // atômico de variantes. Limpar createdProduct para que createProduct() funcione.
      const hasNewVariants =
        state.hasVariants &&
        (state.variantSizes.length > 0 || state.variantColors.length > 0) &&
        !(state.createdProduct as any)._atomicVariants;

      if (hasNewVariants) {
        wizard.resetCreatedProduct();
        await wizard.createProduct();
        return;
      }

      // Fluxo "usar similar": produto existe, apenas avança para entrada.
      wizard.goToStep('entry');
      return;
    }

    await wizard.createProduct();
  };



  return (
    <KeyboardAwareScreen
      bottomPadding={140}
    >
        {/* Card: Informações Básicas */}
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.cardHeader}>
              <View style={[styles.cardIconContainer, { backgroundColor: brandingColors.primary + '15' }]}>
                <Ionicons name="information-circle" size={20} color={brandingColors.primary} />
              </View>
              <Text style={styles.cardTitle}>Informações Básicas</Text>
            </View>

            <TextInput
              ref={nameRef}
              label="Nome do Produto *"
              value={formData.name || ''}
              onChangeText={(text) => updateField('name', capitalizeWords(text))}
              autoCapitalize="words"
              mode="outlined"
              style={styles.input}
              error={!!state.validationErrors.name}
              returnKeyType="next"
              onSubmitEditing={() => skuRef.current?.focus()}
              blurOnSubmit={false}
            />
            {state.validationErrors.name && (
              <HelperText type="error" visible>
                {String(state.validationErrors.name)}
              </HelperText>
            )}

            <View style={styles.skuRow}>
              <TextInput
                ref={skuRef}
                label="SKU (Código) *"
                value={formData.sku || ''}
                onChangeText={(text) => {
                  setSkuManuallyEdited(true);
                  updateField('sku', text.toUpperCase());
                }}
                mode="outlined"
                style={styles.skuInput}
                autoCapitalize="characters"
                error={!!state.validationErrors.sku}
                returnKeyType="next"
                onSubmitEditing={() => costRef.current?.focus()}
                blurOnSubmit={false}
              />
              <TouchableOpacity
                style={[styles.regenerateButton, { backgroundColor: brandingColors.primary + '15', borderColor: brandingColors.primary + '30' }]}
                onPress={() => {
                  setSkuManuallyEdited(false);
                  handleRegenerateSKU();
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="refresh" size={20} color={brandingColors.primary} />
              </TouchableOpacity>
            </View>
            <HelperText type="info" visible style={styles.skuHint}>
              {state.hasVariants
                ? 'SKU base da família. Cada variante receberá um código derivado automaticamente.'
                : skuManuallyEdited
                  ? 'SKU editado manualmente. Toque em ↻ para voltar ao automático.'
                  : 'SKU atualizado automaticamente ao editar nome, marca, cor ou tamanho.'}
            </HelperText>
            {state.validationErrors.sku && (
              <HelperText type="error" visible>
                {String(state.validationErrors.sku)}
              </HelperText>
            )}

            {/* Preview de SKUs de variantes */}
            {variantSkuPreviews.length > 0 && (
              <View style={[styles.variantSkuPreview, { backgroundColor: brandingColors.primary + '08', borderColor: brandingColors.primary + '25' }]}>
                <View style={styles.variantSkuPreviewHeader}>
                  <Ionicons name="barcode-outline" size={13} color={brandingColors.primary} />
                  <Text style={[styles.variantSkuPreviewTitle, { color: brandingColors.primary }]}>
                    SKUs que serão gerados ({variantSkuPreviews.length})
                  </Text>
                </View>
                <View style={styles.variantSkuList}>
                  {variantSkuPreviews.slice(0, 6).map((item, i) => (
                    <View key={i} style={styles.variantSkuItem}>
                      <Text style={styles.variantSkuLabel}>{item.label}</Text>
                      <Text style={[styles.variantSkuCode, { color: brandingColors.primary, backgroundColor: brandingColors.primary + '12' }]}>{item.sku}</Text>
                    </View>
                  ))}
                  {variantSkuPreviews.length > 6 && (
                    <Text style={styles.variantSkuMore}>
                      +{variantSkuPreviews.length - 6} mais...
                    </Text>
                  )}
                </View>
              </View>
            )}

            <TouchableOpacity
              style={styles.categoryButton}
              onPress={() => setCategoryModalVisible(true)}
            >
              <View style={styles.categoryButtonContent}>
                <Text style={styles.categoryButtonLabel}>Categoria *</Text>
                <View style={styles.categoryButtonValue}>
                  <Text style={selectedCategory ? styles.categoryButtonText : styles.categoryButtonPlaceholder}>
                    {selectedCategory?.name || 'Selecione uma categoria'}
                  </Text>
                  <Ionicons name="chevron-down" size={20} color={Colors.light.textTertiary} />
                </View>
              </View>
            </TouchableOpacity>
            {state.validationErrors.category_id && (
              <HelperText type="error" visible>
                {String(state.validationErrors.category_id)}
              </HelperText>
            )}
          </Card.Content>
        </Card>

        {/* Card: Preços */}
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.cardHeader}>
              <View style={styles.cardIconContainer}>
                <Ionicons name="cash" size={20} color={Colors.light.success} />
              </View>
              <Text style={styles.cardTitle}>Preços</Text>
            </View>

            <View style={styles.priceInputRow}>
              <View style={styles.priceInputContainer}>
                <TextInput
                  ref={costRef}
                  label="Custo (R$)"
                  value={costPriceStr}
                  onChangeText={(text) => setCostPriceStr(formatPriceInput(text))}
                  mode="outlined"
                  style={styles.priceInput}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  left={<TextInput.Affix text="R$" />}
                />
              </View>
              <View style={styles.priceInputContainer}>
                <TextInput
                  ref={saleRef}
                  label="Venda (R$) *"
                  value={salePriceStr}
                  onChangeText={(text) => setSalePriceStr(formatPriceInput(text))}
                  mode="outlined"
                  style={styles.priceInput}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  left={<TextInput.Affix text="R$" />}
                  error={!!state.validationErrors.price}
                />
              </View>
            </View>
            {state.validationErrors.price && (
              <HelperText type="error" visible>
                {String(state.validationErrors.price)}
              </HelperText>
            )}

            {/* Markup Indicator */}
            {markup !== null && (
              <View style={styles.markupContainer}>
                <View style={styles.markupBadge}>
                  <Ionicons name="trending-up" size={16} color={Colors.light.success} />
                  <Text style={styles.markupText}>
                    Markup: {markup.toFixed(1)}%
                  </Text>
                </View>
                <Text style={styles.markupHint}>
                  Lucro por unidade: R$ {((parseFloat(salePriceStr) || 0) - (parseFloat(costPriceStr) || 0)).toFixed(2)}
                </Text>
              </View>
            )}
          </Card.Content>
        </Card>

        {/* Card: Detalhes Adicionais */}
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.cardHeader}>
              <View style={styles.cardIconContainer}>
                <Ionicons name="list" size={20} color={Colors.light.info} />
              </View>
              <Text style={styles.cardTitle}>Detalhes do Produto</Text>
            </View>
              <View style={styles.sectionHintRow}>
                <Ionicons name="information-circle" size={14} color={Colors.light.info} />
                <Text style={styles.sectionHint}>
                  Preencha o máximo de detalhes para facilitar vendas futuras
                </Text>
              </View>

              <TextInput
                ref={brandRef}
                label="Marca"
                value={formData.brand || ''}
                onChangeText={(text) => updateField('brand', capitalizeWords(text))}
                autoCapitalize="words"
                mode="outlined"
                style={styles.input}
                left={<TextInput.Icon icon="tag" />}
                returnKeyType="next"
                onSubmitEditing={() => genderRef.current?.focus()}
                blurOnSubmit={false}
              />

              <View style={styles.row}>
                <TextInput
                  ref={genderRef}
                  label="Gênero"
                  value={(formData as any).gender || ''}
                  onChangeText={(text) => updateField('gender', capitalizeWords(text))}
                  autoCapitalize="words"
                  mode="outlined"
                  style={[styles.input, styles.halfInput]}
                  left={<TextInput.Icon icon="account-outline" />}
                  returnKeyType="next"
                  onSubmitEditing={() => materialRef.current?.focus()}
                  blurOnSubmit={false}
                />
                <TextInput
                  ref={materialRef}
                  label="Material"
                  value={(formData as any).material || ''}
                  onChangeText={(text) => updateField('material', capitalizeWords(text))}
                  autoCapitalize="words"
                  mode="outlined"
                  style={[styles.input, styles.halfInput]}
                  left={<TextInput.Icon icon="layers-outline" />}
                  returnKeyType="next"
                  onSubmitEditing={() => colorRef.current?.focus()}
                  blurOnSubmit={false}
                />
              </View>

              {/* Cor e Tamanho — oculto quando variantes estão ativas */}
              {!state.hasVariants && (
              <View style={styles.row}>
                <TextInput
                  ref={colorRef}
                  label="Cor"
                  value={formData.color || ''}
                  onChangeText={(text) => updateField('color', capitalizeWords(text))}
                  autoCapitalize="words"
                  mode="outlined"
                  style={[styles.input, styles.halfInput]}
                  left={<TextInput.Icon icon="palette" />}
                  returnKeyType="next"
                  onSubmitEditing={() => sizeRef.current?.focus()}
                  blurOnSubmit={false}
                />
                <TextInput
                  ref={sizeRef}
                  label="Tamanho"
                  value={formData.size || ''}
                  onChangeText={(text) => updateField('size', text.toUpperCase())}
                  mode="outlined"
                  style={[styles.input, styles.halfInput]}
                  autoCapitalize="characters"
                  left={<TextInput.Icon icon="ruler" />}
                  returnKeyType="next"
                  onSubmitEditing={() => descRef.current?.focus()}
                  blurOnSubmit={false}
                />
              </View>
              )}

              <TextInput
                ref={descRef}
                label="Descrição"
                value={formData.description || ''}
                onChangeText={(text) => updateField('description', capitalizeWords(text))}
                autoCapitalize="words"
                mode="outlined"
                style={styles.input}
                multiline
                numberOfLines={4}
                left={<TextInput.Icon icon="text" />}
                returnKeyType="done"
                onSubmitEditing={() => Keyboard.dismiss()}
                blurOnSubmit={false}
              />
            </Card.Content>
        </Card>

        {/* Card: Variantes */}
        <Card style={styles.card}>
          <Card.Content>
            <VariantBuilderInline
              hasVariants={state.hasVariants ?? false}
              onToggle={wizard.setHasVariants}
              selectedSizes={state.variantSizes ?? []}
              onSizesChange={wizard.setVariantSizes}
              selectedColors={state.variantColors ?? []}
              onColorsChange={wizard.setVariantColors}
              colorSizes={state.colorSizes ?? {}}
              onColorSizesChange={wizard.setColorSizes}
              basePrice={parseFloat(salePriceStr) || 0}
              costPrice={parseFloat(costPriceStr) || 0}
              variantPrices={state.variantPrices ?? {}}
              onVariantPriceChange={wizard.setVariantPrice}
              validationError={state.validationErrors.variants as string | undefined}
            />
          </Card.Content>
        </Card>



      {/* Footer com botões */}
      <View style={styles.footer}>
        <Button
          mode="outlined"
          onPress={onBack}
          style={styles.backButton}
          icon="arrow-left"
        >
          Voltar
        </Button>

        <TouchableOpacity
          onPress={handleCreate}
          activeOpacity={0.8}
          style={[styles.createButton, state.isCreating && styles.createButtonDisabled]}
          disabled={state.isCreating}
        >
          <LinearGradient
            colors={brandingColors.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.createButtonGradient}
          >
            <Ionicons
              name={state.isCreating ? 'sync-outline' : state.createdProduct?.id ? 'arrow-forward-outline' : 'checkmark-circle-outline'}
              size={18}
              color="#fff"
            />
            <Text style={styles.createButtonText}>
              {state.isCreating
                ? 'Carregando...'
                : state.createdProduct?.id
                ? 'Continuar no Fluxo'
                : 'Criar Produto'}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* Modal de Seleção de Categoria */}
      <CategoryPickerModal
        visible={categoryModalVisible}
        categories={categories}
        selectedId={formData.category_id}
        onSelect={(category) => {
          updateField('category_id', category.id);
          setCategoryModalVisible(false);
        }}
        onDismiss={() => setCategoryModalVisible(false)}
      />


    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  // Cards
  card: {
    borderRadius: 16,
    elevation: 1,
    backgroundColor: Colors.light.card,
    marginBottom: theme.spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: theme.spacing.md,
  },
  cardIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.light.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.light.text,
    flex: 1,
  },

  // Inputs
  input: {
    marginBottom: theme.spacing.md,
    backgroundColor: Colors.light.card,
  },
  skuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  skuInput: {
    flex: 1,
    backgroundColor: Colors.light.card,
  },
  skuHint: {
    marginTop: -8,
    marginBottom: 8,
  },
  regenerateButton: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: Colors.light.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.light.primary + '30',
    marginTop: 6,
  },

  // SKU preview for variants
  variantSkuPreview: {
    backgroundColor: Colors.light.primary + '08',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.light.primary + '25',
    padding: 10,
    marginBottom: 12,
    gap: 8,
  },
  variantSkuPreviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  variantSkuPreviewTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.light.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  variantSkuList: {
    gap: 4,
  },
  variantSkuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  variantSkuLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.light.textSecondary,
    flex: 1,
  },
  variantSkuCode: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: Colors.light.primary,
    fontWeight: '700',
    backgroundColor: Colors.light.primary + '12',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  variantSkuMore: {
    fontSize: 11,
    color: Colors.light.textTertiary,
    fontStyle: 'italic',
    textAlign: 'right',
    marginTop: 2,
  },

  row: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  halfInput: {
    flex: 1,
  },

  // Category Button
  categoryButton: {
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  categoryButtonContent: {
    padding: theme.spacing.md,
  },
  categoryButtonLabel: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    marginBottom: 6,
  },
  categoryButtonValue: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  categoryButtonText: {
    fontSize: 16,
    color: Colors.light.text,
    fontWeight: '500',
  },
  categoryButtonPlaceholder: {
    fontSize: 16,
    color: Colors.light.textTertiary,
  },

  // Price Inputs
  priceInputRow: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  priceInputContainer: {
    flex: 1,
  },
  priceInput: {
    backgroundColor: Colors.light.card,
  },

  // Markup Indicator
  markupContainer: {
    backgroundColor: Colors.light.success + '10',
    borderRadius: 12,
    padding: theme.spacing.md,
    marginTop: theme.spacing.sm,
  },
  markupBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  markupText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.light.success,
  },
  markupHint: {
    fontSize: 13,
    color: Colors.light.textSecondary,
  },

  // Expandable Section removed - now a regular card

  sectionHintRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: Colors.light.info + '10',
    padding: theme.spacing.sm,
    borderRadius: 8,
    marginBottom: theme.spacing.md,
  },
  sectionHint: {
    flex: 1,
    fontSize: 13,
    color: Colors.light.info,
    lineHeight: 18,
  },
  duplicateReasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },

  // Footer - não usar absolute para que suba com o teclado
  footer: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    backgroundColor: Colors.light.card,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
  },
  backButton: {
    flex: 1,
    borderColor: Colors.light.border,
  },
  createButton: {
    flex: 2,
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
    ...theme.shadows.sm,
  },
  createButtonDisabled: {
    opacity: 0.5,
  },
  createButtonGradient: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: theme.spacing.md,
  },
  createButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
});