/**
 * WizardStep2 - Confirmar e Editar Dados
 *
 * - Edição inline de todos os campos
 * - Design moderno com cards organizados
 * - Seção expansível para detalhes opcionais
 * - Cálculo automático de markup
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { Text, Button, Card, TextInput, HelperText, Chip, ActivityIndicator } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { Colors, theme } from '@/constants/Colors';
import type { UseProductWizardReturn } from '@/hooks/useProductWizard';
import type { Category, DuplicateMatch } from '@/types';
import CategoryPickerModal from '@/components/ui/CategoryPickerModal';
import { getProductById } from '@/services/productService';

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
  const [detailsExpanded, setDetailsExpanded] = useState(true); // Aberto por padrão
  const [loadingDuplicate, setLoadingDuplicate] = useState(false);

  // Local state para edição inline
  const [formData, setFormData] = useState(state.productData);
  const [markup, setMarkup] = useState<number | null>(null);
  
  // Estados locais para preços (strings durante edição)
  const [costPriceStr, setCostPriceStr] = useState(
    state.productData.cost_price ? state.productData.cost_price.toFixed(2) : ''
  );
  const [salePriceStr, setSalePriceStr] = useState(
    state.productData.price ? state.productData.price.toFixed(2) : ''
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

  const handleCreate = async () => {
    await wizard.createProduct();
  };

  const handleSelectDuplicate = async (dup: DuplicateMatch) => {
    Alert.alert(
      'Usar Produto Existente?',
      `Deseja adicionar estoque ao produto "${dup.product_name}"?\n\nVocê será levado para criar uma entrada de estoque para este produto.`,
      [
        {
          text: 'Cancelar',
          style: 'cancel',
        },
        {
          text: 'Sim, Usar Este',
          onPress: async () => {
            setLoadingDuplicate(true);
            try {
              // Buscar dados completos do produto
              const product = await getProductById(dup.product_id);
              
              // Passar produto para wizard e ir para step 3
              wizard.addStockToDuplicate(product.id, product);
            } catch (error: any) {
              Alert.alert('Erro', 'Não foi possível carregar o produto');
              console.error('Error loading duplicate:', error);
            } finally {
              setLoadingDuplicate(false);
            }
          },
        },
      ]
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
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

            <TextInput
              label="Nome do Produto *"
              value={formData.name || ''}
              onChangeText={(text) => updateField('name', text)}
              mode="outlined"
              style={styles.input}
              error={!!state.validationErrors.name}
            />
            {state.validationErrors.name && (
              <HelperText type="error" visible>
                {state.validationErrors.name}
              </HelperText>
            )}

            <TextInput
              label="SKU (Código) *"
              value={formData.sku || ''}
              onChangeText={(text) => updateField('sku', text.toUpperCase())}
              mode="outlined"
              style={styles.input}
              autoCapitalize="characters"
              error={!!state.validationErrors.sku}
            />
            {state.validationErrors.sku && (
              <HelperText type="error" visible>
                {state.validationErrors.sku}
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
                {state.validationErrors.category_id}
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
                {state.validationErrors.price}
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

        {/* Card: Detalhes Adicionais (Expansível) */}
        <Card style={styles.card}>
          <TouchableOpacity
            style={styles.expandableHeader}
            onPress={() => setDetailsExpanded(!detailsExpanded)}
            activeOpacity={0.7}
          >
            <View style={styles.cardHeader}>
              <View style={styles.cardIconContainer}>
                <Ionicons name="list" size={20} color={Colors.light.info} />
              </View>
              <Text style={styles.cardTitle}>Detalhes do Produto</Text>
            </View>
            <Ionicons
              name={detailsExpanded ? 'chevron-up' : 'chevron-down'}
              size={24}
              color={Colors.light.textSecondary}
            />
          </TouchableOpacity>

          {detailsExpanded && (
            <Card.Content style={styles.expandableContent}>
              <Text style={styles.sectionHint}>
                💡 Preencha o máximo de detalhes para facilitar vendas futuras
              </Text>
              
              <TextInput
                label="Marca"
                value={formData.brand || ''}
                onChangeText={(text) => updateField('brand', text)}
                mode="outlined"
                style={styles.input}
                left={<TextInput.Icon icon="tag" />}
              />

              <View style={styles.row}>
                <TextInput
                  label="Cor"
                  value={formData.color || ''}
                  onChangeText={(text) => updateField('color', text)}
                  mode="outlined"
                  style={[styles.input, styles.halfInput]}
                  left={<TextInput.Icon icon="palette" />}
                />
                <TextInput
                  label="Tamanho"
                  value={formData.size || ''}
                  onChangeText={(text) => updateField('size', text)}
                  mode="outlined"
                  style={[styles.input, styles.halfInput]}
                  left={<TextInput.Icon icon="ruler" />}
                />
              </View>

              <TextInput
                label="Descrição"
                value={formData.description || ''}
                onChangeText={(text) => updateField('description', text)}
                mode="outlined"
                style={styles.input}
                multiline
                numberOfLines={4}
                left={<TextInput.Icon icon="text" />}
              />

              <TextInput
                label="Código de Barras"
                value={formData.barcode || ''}
                onChangeText={(text) => updateField('barcode', text)}
                mode="outlined"
                style={styles.input}
                keyboardType="numeric"
                left={<TextInput.Icon icon="barcode" />}
              />
            </Card.Content>
          )}
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
                Encontramos {state.duplicates.length} produto(s) similar(es) já cadastrado(s).{'\n'}
                <Text style={styles.duplicatesHint}>
                  💡 Toque em um para adicionar estoque ao invés de criar novo
                </Text>
              </Text>

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
                    <Text style={styles.duplicateName}>{dup.product_name}</Text>
                    <Text style={styles.duplicateSku}>SKU: {dup.sku}</Text>
                    <Text style={styles.duplicateReason}>
                      <Ionicons name="checkmark" size={12} color={Colors.light.success} /> {dup.reason}
                    </Text>
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.backgroundSecondary,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: theme.spacing.md,
    paddingBottom: 100,
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

  // Expandable Section
  expandableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing.md,
  },
  expandableContent: {
    paddingTop: 0,
  },
  sectionHint: {
    fontSize: 13,
    color: Colors.light.info,
    backgroundColor: Colors.light.info + '10',
    padding: theme.spacing.sm,
    borderRadius: 8,
    marginBottom: theme.spacing.md,
    lineHeight: 18,
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
  duplicatesHint: {
    fontSize: 13,
    color: Colors.light.info,
    fontWeight: '600',
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
