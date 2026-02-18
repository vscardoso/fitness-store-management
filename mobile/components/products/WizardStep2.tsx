/**
 * WizardStep2 - Confirmar e Editar Dados
 *
 * - Edição inline de todos os campos
 * - Design moderno com cards organizados
 * - Seção expansível para detalhes opcionais
 * - Cálculo automático de markup
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  TextInput as RNTextInput,
  KeyboardAvoidingView,
  Dimensions,
} from 'react-native';
import { Text, Button, Card, TextInput, HelperText, ActivityIndicator } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { Colors, theme } from '@/constants/Colors';
import type { UseProductWizardReturn } from '@/hooks/useProductWizard';
import type { Category, DuplicateMatch } from '@/types';
import CategoryPickerModal from '@/components/ui/CategoryPickerModal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { getProductById, generateStandaloneBarcode } from '@/services/productService';
import { generateSKU } from '@/utils/skuGenerator';

const SCREEN_HEIGHT = Dimensions.get('window').height;

interface WizardStep2Props {
  wizard: UseProductWizardReturn;
  categories: Category[];
  onBack: () => void;
}

export default function WizardStep2({
  wizard,
  categories,
  onBack,
}: WizardStep2Props) {
  const { state } = wizard;
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [loadingDuplicate, setLoadingDuplicate] = useState(false);
  
  // Refs para navegação entre campos
  const scrollRef = useRef<ScrollView>(null);
  const nameRef = useRef<RNTextInput>(null);
  const skuRef = useRef<RNTextInput>(null);
  const costRef = useRef<RNTextInput>(null);
  const saleRef = useRef<RNTextInput>(null);
  const brandRef = useRef<RNTextInput>(null);
  const colorRef = useRef<RNTextInput>(null);
  const sizeRef = useRef<RNTextInput>(null);
  const descRef = useRef<RNTextInput>(null);
  const barcodeRef = useRef<RNTextInput>(null);
  
  // Estados para ConfirmDialog
  const [confirmDuplicateVisible, setConfirmDuplicateVisible] = useState(false);
  const [selectedDuplicate, setSelectedDuplicate] = useState<DuplicateMatch | null>(null);
  const [errorDialogVisible, setErrorDialogVisible] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Estado para geração de código de barras
  const [isGeneratingBarcode, setIsGeneratingBarcode] = useState(false);

  // Controla se o usuário editou o SKU manualmente (desativa auto-regeneração)
  const [skuManuallyEdited, setSkuManuallyEdited] = useState(false);

  // Refs para Views que wrappam os inputs (para medir posição absoluta)
  const inputWrapperRefs = useRef<{ [key: string]: View | null }>({});
  const currentScrollY = useRef(0);

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

  // Atualizar dados no wizard quando formData mudar
  useEffect(() => {
    const updatedData = {
      ...formData,
      cost_price: costPriceStr ? parseFloat(costPriceStr) : undefined,
      price: salePriceStr ? parseFloat(salePriceStr) : undefined,
    };
    wizard.updateProductData(updatedData);
  }, [formData, costPriceStr, salePriceStr]);

  // Auto-regenerar SKU quando name/brand/color/size mudam (se não editado manualmente)
  useEffect(() => {
    if (skuManuallyEdited) return;
    if (!formData.name?.trim()) return;

    const newSku = generateSKU(
      formData.name || '',
      formData.brand,
      formData.color,
      formData.size
    );
    setFormData(prev => ({ ...prev, sku: newSku }));
  }, [formData.name, formData.brand, formData.color, formData.size, skuManuallyEdited]);

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
   * Scroll para mostrar o input focado acima do teclado
   * Usa measureInWindow para obter posição absoluta na tela
   */
  const scrollToFocusedInput = useCallback((inputKey: string) => {
    const wrapperRef = inputWrapperRefs.current[inputKey];
    if (!wrapperRef || !scrollRef.current) return;

    // Pequeno delay para garantir que o teclado está abrindo
    setTimeout(() => {
      (wrapperRef as any).measureInWindow((x: number, y: number, width: number, height: number) => {
        // y é a posição absoluta do input na tela
        // Queremos que o input fique no terço superior da tela visível
        const targetY = SCREEN_HEIGHT * 0.25; // 25% do topo da tela

        // Se o input está abaixo do target, precisamos scrollar
        if (y > targetY) {
          const scrollAmount = y - targetY;
          const newScrollY = currentScrollY.current + scrollAmount;

          scrollRef.current?.scrollTo({
            y: newScrollY,
            animated: true,
          });
        }
      });
    }, Platform.OS === 'ios' ? 50 : 150);
  }, []);

  /**
   * Salvar referência do wrapper de um input
   */
  const setInputWrapperRef = useCallback((key: string, ref: View | null) => {
    inputWrapperRefs.current[key] = ref;
  }, []);

  /**
   * Handler de scroll para rastrear posição atual
   */
  const handleScroll = useCallback((event: any) => {
    currentScrollY.current = event.nativeEvent.contentOffset.y;
  }, []);

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
    const newSku = generateSKU(
      formData.name || '',
      formData.brand,
      formData.color,
      formData.size
    );
    setFormData({ ...formData, sku: newSku });
  };

  /**
   * Gerar código de barras EAN-13 automaticamente
   */
  const handleGenerateBarcode = async () => {
    setIsGeneratingBarcode(true);
    try {
      const response = await generateStandaloneBarcode();
      if (response.barcode) {
        setFormData({ ...formData, barcode: response.barcode });
      }
    } catch (error: any) {
      setErrorMessage('Erro ao gerar código de barras. Tente novamente.');
      setErrorDialogVisible(true);
    } finally {
      setIsGeneratingBarcode(false);
    }
  };

  const handleCreate = async () => {
    await wizard.createProduct();
  };

  const handleSelectDuplicate = (dup: DuplicateMatch) => {
    setSelectedDuplicate(dup);
    setConfirmDuplicateVisible(true);
  };

  const handleConfirmDuplicate = async () => {
    if (!selectedDuplicate) return;
    
    setConfirmDuplicateVisible(false);
    setLoadingDuplicate(true);
    
    try {
      // Buscar dados completos do produto
      const product = await getProductById(selectedDuplicate.product_id);
      
      // Passar produto para wizard e ir para step 3
      wizard.addStockToDuplicate(product.id, product);
    } catch (error: any) {
      setErrorMessage('Não foi possível carregar o produto. Tente novamente.');
      setErrorDialogVisible(true);
      console.error('Error loading duplicate:', error);
    } finally {
      setLoadingDuplicate(false);
      setSelectedDuplicate(null);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.keyboardAvoidingView}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 20}
    >
      <View style={styles.container}>
        <ScrollView
          ref={scrollRef}
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
        >
        <View style={styles.header}>
          <Ionicons name="checkmark-circle" size={28} color={Colors.light.success} />
          <View style={styles.headerText}>
            <Text style={styles.title}>Confirme e ajuste</Text>
            <Text style={styles.subtitle}>
              Revise e edite os campos antes de criar
            </Text>
          </View>
        </View>

        {/* Card: Informações Básicas */}
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.cardHeader}>
              <View style={styles.cardIconContainer}>
                <Ionicons name="information-circle" size={20} color={Colors.light.primary} />
              </View>
              <Text style={styles.cardTitle}>Informações Básicas</Text>
            </View>

            <View ref={(ref) => setInputWrapperRef('name', ref)}>
              <TextInput
                ref={nameRef}
                label="Nome do Produto *"
                value={formData.name || ''}
                onChangeText={(text) => updateField('name', text)}
                mode="outlined"
                style={styles.input}
                error={!!state.validationErrors.name}
                returnKeyType="next"
                onSubmitEditing={() => skuRef.current?.focus()}
                blurOnSubmit={false}
                onFocus={() => scrollToFocusedInput('name')}
              />
            </View>
            {state.validationErrors.name && (
              <HelperText type="error" visible>
                {String(state.validationErrors.name)}
              </HelperText>
            )}

            <View
              ref={(ref) => setInputWrapperRef('sku', ref)}
              style={styles.skuRow}
            >
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
                onFocus={() => scrollToFocusedInput('sku')}
              />
              <TouchableOpacity
                style={styles.regenerateButton}
                onPress={() => {
                  setSkuManuallyEdited(false);
                  handleRegenerateSKU();
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="refresh" size={20} color={Colors.light.primary} />
              </TouchableOpacity>
            </View>
            <HelperText type="info" visible style={styles.skuHint}>
              {skuManuallyEdited
                ? 'SKU editado manualmente. Toque em ↻ para voltar ao automático.'
                : 'SKU atualizado automaticamente ao editar nome, marca, cor ou tamanho.'}
            </HelperText>
            {state.validationErrors.sku && (
              <HelperText type="error" visible>
                {String(state.validationErrors.sku)}
              </HelperText>
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

            <View
              ref={(ref) => setInputWrapperRef('prices', ref)}
              style={styles.priceInputRow}
            >
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
                  onFocus={() => scrollToFocusedInput('prices')}
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
                  onFocus={() => scrollToFocusedInput('prices')}
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
              
              <View ref={(ref) => setInputWrapperRef('brand', ref)}>
                <TextInput
                  ref={brandRef}
                  label="Marca"
                  value={formData.brand || ''}
                  onChangeText={(text) => updateField('brand', text)}
                  mode="outlined"
                  style={styles.input}
                  left={<TextInput.Icon icon="tag" />}
                  returnKeyType="next"
                  onSubmitEditing={() => colorRef.current?.focus()}
                  blurOnSubmit={false}
                  onFocus={() => scrollToFocusedInput('brand')}
                />
              </View>

              <View
                ref={(ref) => setInputWrapperRef('colorSize', ref)}
                style={styles.row}
              >
                <TextInput
                  ref={colorRef}
                  label="Cor"
                  value={formData.color || ''}
                  onChangeText={(text) => updateField('color', text)}
                  mode="outlined"
                  style={[styles.input, styles.halfInput]}
                  left={<TextInput.Icon icon="palette" />}
                  returnKeyType="next"
                  onSubmitEditing={() => sizeRef.current?.focus()}
                  blurOnSubmit={false}
                  onFocus={() => scrollToFocusedInput('colorSize')}
                />
                <TextInput
                  ref={sizeRef}
                  label="Tamanho"
                  value={formData.size || ''}
                  onChangeText={(text) => updateField('size', text)}
                  mode="outlined"
                  style={[styles.input, styles.halfInput]}
                  left={<TextInput.Icon icon="ruler" />}
                  returnKeyType="next"
                  onSubmitEditing={() => descRef.current?.focus()}
                  blurOnSubmit={false}
                  onFocus={() => scrollToFocusedInput('colorSize')}
                />
              </View>

              <View ref={(ref) => setInputWrapperRef('description', ref)}>
                <TextInput
                  ref={descRef}
                  label="Descrição"
                  value={formData.description || ''}
                  onChangeText={(text) => updateField('description', text)}
                  mode="outlined"
                  style={styles.input}
                  multiline
                  numberOfLines={4}
                  left={<TextInput.Icon icon="text" />}
                  returnKeyType="next"
                  onSubmitEditing={() => barcodeRef.current?.focus()}
                  blurOnSubmit={false}
                  onFocus={() => scrollToFocusedInput('description')}
                />
              </View>

              <View style={styles.barcodeSection}>
                <View style={styles.barcodeSectionTitleRow}>
                  <Ionicons name="barcode" size={16} color={Colors.light.primary} />
                  <Text style={styles.barcodeSectionTitle}>Código de Barras</Text>
                </View>
                <Text style={styles.barcodeSectionHint}>
                  Gere um código EAN-13 único para criar etiquetas escaneáveis
                </Text>
                <View
                  ref={(ref) => setInputWrapperRef('barcode', ref)}
                  style={styles.barcodeRow}
                >
                  <TextInput
                    ref={barcodeRef}
                    label="Código de Barras"
                    value={formData.barcode || ''}
                    onChangeText={(text) => updateField('barcode', text.replace(/[^0-9]/g, ''))}
                    mode="outlined"
                    style={styles.barcodeInput}
                    keyboardType="numeric"
                    maxLength={13}
                    placeholder="Ex: 7890100000015"
                    onFocus={() => scrollToFocusedInput('barcode')}
                  />
                  <TouchableOpacity
                    style={[
                      styles.generateBarcodeButton,
                      isGeneratingBarcode && styles.generateBarcodeButtonDisabled
                    ]}
                    onPress={handleGenerateBarcode}
                    activeOpacity={0.7}
                    disabled={isGeneratingBarcode}
                  >
                    {isGeneratingBarcode ? (
                      <ActivityIndicator size="small" color={Colors.light.primary} />
                    ) : (
                      <>
                        <Ionicons name="flash" size={18} color="#fff" />
                        <Text style={styles.generateBarcodeButtonText}>Gerar</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
                {formData.barcode && formData.barcode.length === 13 && (
                  <View style={styles.barcodePreview}>
                    <Ionicons name="checkmark-circle" size={14} color={Colors.light.success} />
                    <Text style={styles.barcodePreviewText}>
                      EAN-13 válido: {String(formData.barcode || '')}
                    </Text>
                  </View>
                )}
              </View>
            </Card.Content>
        </Card>

        {/* Painel de Duplicados */}
        {state.duplicates.length > 0 && (
          <Card style={styles.duplicatesCard}>
            <Card.Content>
              <View style={styles.duplicatesHeader}>
                <View style={styles.duplicatesIconContainer}>
                  <Ionicons name="alert-circle" size={22} color={Colors.light.warning} />
                </View>
                <Text style={styles.duplicatesTitle}>Produto Já Existe?</Text>
              </View>

              <Text style={styles.duplicatesSubtitle}>
                Encontramos {state.duplicates.length} produto(s) similar(es) já cadastrado(s).
              </Text>
              <View style={styles.duplicatesHintRow}>
                <Ionicons name="bulb" size={14} color={Colors.light.info} />
                <Text style={styles.duplicatesHint}>
                  Toque em um para adicionar estoque ao invés de criar novo
                </Text>
              </View>

              {loadingDuplicate && (
                <View style={styles.loadingDuplicate}>
                  <ActivityIndicator size="small" color={Colors.light.primary} />
                  <Text style={styles.loadingText}>Carregando produto...</Text>
                </View>
              )}

              {state.duplicates.slice(0, 3).map((dup: DuplicateMatch) => (
                <TouchableOpacity
                  key={dup.product_id}
                  style={styles.duplicateItem}
                  onPress={() => handleSelectDuplicate(dup)}
                  disabled={loadingDuplicate}
                  activeOpacity={0.7}
                >
                  <View style={styles.duplicateIconContainer}>
                    <Ionicons name="cube" size={20} color={Colors.light.primary} />
                  </View>
                  <View style={styles.duplicateInfo}>
                    <Text style={styles.duplicateName}>{String(dup.product_name || '')}</Text>
                    <Text style={styles.duplicateSku}>SKU: {String(dup.sku || '')}</Text>
                    <View style={styles.duplicateReasonRow}>
                      <Ionicons name="checkmark" size={12} color={Colors.light.success} />
                      <Text style={styles.duplicateReason}>{String(dup.reason || '')}</Text>
                    </View>
                  </View>
                  <View style={styles.duplicateScore}>
                    <Text style={styles.duplicateScoreValue}>
                      {Math.round(dup.similarity_score * 100)}%
                    </Text>
                    <Text style={styles.duplicateScoreLabel}>similar</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={24} color={Colors.light.textSecondary} />
                </TouchableOpacity>
              ))}

              <View style={styles.duplicatesFooter}>
                <Ionicons name="information-circle" size={16} color={Colors.light.info} />
                <Text style={styles.duplicatesFooterText}>
                  Ou continue abaixo para criar um produto novo
                </Text>
              </View>
            </Card.Content>
          </Card>
        )}
      </ScrollView>

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
        <Button
          mode="contained"
          onPress={handleCreate}
          style={styles.createButton}
          icon="check"
          loading={state.isCreating}
          disabled={state.isCreating}
        >
          Criar Produto
        </Button>
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

      {/* Dialog: Confirmar uso de produto duplicado */}
      <ConfirmDialog
        visible={confirmDuplicateVisible}
        title="Usar Produto Existente?"
        message={selectedDuplicate ? `Deseja adicionar estoque ao produto "${selectedDuplicate.product_name}"?` : ''}
        confirmText="Sim, Usar Este"
        cancelText="Cancelar"
        type="info"
        icon="copy"
        onConfirm={handleConfirmDuplicate}
        onCancel={() => {
          setConfirmDuplicateVisible(false);
          setSelectedDuplicate(null);
        }}
        loading={loadingDuplicate}
        details={selectedDuplicate ? [
          'Você será levado para criar uma entrada de estoque',
          'O produto existente será vinculado a essa entrada',
          `Similaridade: ${(selectedDuplicate.similarity_score * 100).toFixed(0)}%`
        ] : []}
      />

      {/* Dialog: Erro ao carregar produto */}
      <ConfirmDialog
        visible={errorDialogVisible}
        title="Erro"
        message={errorMessage}
        confirmText="OK"
        cancelText=""
        type="danger"
        onConfirm={() => setErrorDialogVisible(false)}
        onCancel={() => setErrorDialogVisible(false)}
      />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardAvoidingView: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: Colors.light.backgroundSecondary,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: theme.spacing.md,
    paddingBottom: 140, // Espaço para footer + margem
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: theme.spacing.lg,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.light.text,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.light.textSecondary,
  },

  // Cards
  card: {
    borderRadius: 16,
    elevation: 1,
    backgroundColor: '#fff',
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
    backgroundColor: '#fff',
  },
  skuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  skuInput: {
    flex: 1,
    backgroundColor: '#fff',
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

  // Barcode Section
  barcodeSection: {
    backgroundColor: Colors.light.backgroundSecondary,
    borderRadius: 12,
    padding: theme.spacing.md,
    marginTop: theme.spacing.sm,
  },
  barcodeSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: 4,
  },
  barcodeSectionHint: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    marginBottom: theme.spacing.md,
  },
  barcodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  barcodeInput: {
    flex: 1,
    backgroundColor: '#fff',
  },
  generateBarcodeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: Colors.light.primary,
    marginTop: 6,
  },
  generateBarcodeButtonDisabled: {
    backgroundColor: Colors.light.primary + '60',
  },
  generateBarcodeButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  barcodePreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: theme.spacing.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: Colors.light.success + '15',
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  barcodePreviewText: {
    fontSize: 12,
    color: Colors.light.success,
    fontWeight: '500',
    fontFamily: 'monospace',
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
    backgroundColor: '#fff',
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
  barcodeSectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  duplicateReasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },

  // Duplicates
  duplicatesCard: {
    borderRadius: 16,
    elevation: 2,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: Colors.light.warning + '40',
    marginBottom: theme.spacing.md,
  },
  duplicatesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  duplicatesIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.light.warning + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  duplicatesTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.light.text,
  },
  duplicatesSubtitle: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    marginBottom: theme.spacing.md,
    lineHeight: 20,
  },
  duplicatesHintRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginBottom: theme.spacing.md,
  },
  duplicatesHint: {
    flex: 1,
    fontSize: 13,
    color: Colors.light.info,
    fontWeight: '600',
    lineHeight: 18,
  },
  loadingDuplicate: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: theme.spacing.md,
    backgroundColor: Colors.light.backgroundSecondary,
    borderRadius: 12,
    marginBottom: theme.spacing.md,
  },
  loadingText: {
    fontSize: 14,
    color: Colors.light.textSecondary,
  },
  duplicateItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.backgroundSecondary,
    borderRadius: 12,
    padding: theme.spacing.md,
    marginBottom: 10,
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  duplicateIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: Colors.light.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  duplicateInfo: {
    flex: 1,
  },
  duplicateName: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: 3,
  },
  duplicateSku: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  duplicateReason: {
    fontSize: 11,
    color: Colors.light.success,
    fontWeight: '500',
  },
  duplicateScore: {
    alignItems: 'center',
    backgroundColor: Colors.light.warning + '20',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  duplicateScoreValue: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.light.warning,
  },
  duplicateScoreLabel: {
    fontSize: 9,
    color: Colors.light.warning,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginTop: 2,
  },
  duplicatesFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: theme.spacing.sm,
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
  },
  duplicatesFooterText: {
    fontSize: 12,
    color: Colors.light.info,
    fontStyle: 'italic',
  },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
    elevation: 4,
  },
  backButton: {
    flex: 1,
    borderColor: Colors.light.border,
  },
  createButton: {
    flex: 2,
    backgroundColor: Colors.light.primary,
  },
});
