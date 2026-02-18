/**
 * WizardStep1 - Identificar Produto
 *
 * Opções: Scanner IA | Manual | Catálogo
 * Reutiliza lógica do useAIScanner via useProductWizard
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { Text, Button, TextInput, Card, ProgressBar, Chip } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as MediaLibrary from 'expo-media-library';
import { Colors, theme } from '@/constants/Colors';
import type { UseProductWizardReturn } from '@/hooks/useProductWizard';
import type { IdentifyMethod } from '@/types/wizard';
import type { Category, Product } from '@/types';
import CategoryPickerModal from '@/components/ui/CategoryPickerModal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { getCatalogProducts } from '@/services/productService';

interface WizardStep1Props {
  wizard: UseProductWizardReturn;
  categories: Category[];
  onNext: () => void;
}

export default function WizardStep1({
  wizard,
  categories,
  onNext,
}: WizardStep1Props) {
  const { state } = wizard;
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [isSavingToGallery, setIsSavingToGallery] = useState(false);

  // Estado do catálogo
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogProducts, setCatalogProducts] = useState<Product[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [galleryDialog, setGalleryDialog] = useState<{
    visible: boolean; title: string; message: string; type: 'success' | 'danger' | 'warning';
  }>({ visible: false, title: '', message: '', type: 'success' });

  // Carregar catálogo quando método = catalog
  useEffect(() => {
    if (state.identifyMethod === 'catalog') {
      loadCatalog();
    }
  }, [state.identifyMethod]);

  const loadCatalog = useCallback(async (search?: string) => {
    setCatalogLoading(true);
    try {
      const result = await getCatalogProducts({ search, limit: 50 });
      // Normaliza: API pode retornar array ou objeto paginado { items: [...] }
      const products = Array.isArray(result)
        ? result
        : Array.isArray((result as any)?.items)
          ? (result as any).items
          : [];
      setCatalogProducts(products);
    } catch (err) {
      console.error('Erro ao carregar catálogo:', err);
      setCatalogProducts([]); // Garante array vazio em caso de erro
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  // Debounce da busca no catálogo
  useEffect(() => {
    if (state.identifyMethod !== 'catalog') return;
    const timer = setTimeout(() => {
      loadCatalog(catalogSearch || undefined);
    }, 400);
    return () => clearTimeout(timer);
  }, [catalogSearch, state.identifyMethod]);

  // Função para salvar foto na galeria (usa ConfirmDialog local)
  const saveToGallery = async () => {
    if (!state.capturedImage) return;

    try {
      setIsSavingToGallery(true);

      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        setGalleryDialog({
          visible: true,
          title: 'Permissao Necessaria',
          message: 'Precisamos de acesso a galeria para salvar a foto.',
          type: 'warning',
        });
        return;
      }

      await MediaLibrary.saveToLibraryAsync(state.capturedImage);
      setGalleryDialog({
        visible: true,
        title: 'Sucesso',
        message: 'Foto salva na galeria!',
        type: 'success',
      });
    } catch (error) {
      console.error('Erro ao salvar na galeria:', error);
      setGalleryDialog({
        visible: true,
        title: 'Erro',
        message: 'Nao foi possivel salvar a foto.',
        type: 'danger',
      });
    } finally {
      setIsSavingToGallery(false);
    }
  };

  // Renderiza seleção de método
  const renderMethodSelection = () => (
    <View style={styles.methodContainer}>
      <Text style={styles.sectionTitle}>Como deseja cadastrar?</Text>

      <View style={styles.methodButtons}>
        {/* Scanner IA */}
        <TouchableOpacity
          style={[
            styles.methodButton,
            state.identifyMethod === 'scanner' && styles.methodButtonActive,
          ]}
          onPress={() => wizard.selectMethod('scanner')}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={state.identifyMethod === 'scanner'
              ? [Colors.light.primary, Colors.light.secondary]
              : ['#F3F4F6', '#F3F4F6']}
            style={styles.methodButtonGradient}
          >
            <Ionicons
              name="scan"
              size={32}
              color={state.identifyMethod === 'scanner' ? '#fff' : Colors.light.primary}
            />
            <Text style={[
              styles.methodButtonText,
              state.identifyMethod === 'scanner' && styles.methodButtonTextActive,
            ]}>
              Scanner IA
            </Text>
            <Text style={[
              styles.methodButtonSubtext,
              state.identifyMethod === 'scanner' && styles.methodButtonSubtextActive,
            ]}>
              Foto do produto
            </Text>
          </LinearGradient>
        </TouchableOpacity>

        {/* Manual */}
        <TouchableOpacity
          style={[
            styles.methodButton,
            state.identifyMethod === 'manual' && styles.methodButtonActive,
          ]}
          onPress={() => wizard.selectMethod('manual')}
          activeOpacity={0.8}
        >
          <View style={[
            styles.methodButtonContent,
            state.identifyMethod === 'manual' && styles.methodButtonContentActive,
          ]}>
            <Ionicons
              name="pencil"
              size={32}
              color={state.identifyMethod === 'manual' ? Colors.light.primary : Colors.light.textSecondary}
            />
            <Text style={[
              styles.methodButtonText,
              state.identifyMethod === 'manual' && styles.methodButtonTextManual,
            ]}>
              Manual
            </Text>
            <Text style={styles.methodButtonSubtext}>
              Digitar dados
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Catálogo — linha separada abaixo dos dois botões principais */}
      <TouchableOpacity
        style={[
          styles.catalogMethodButton,
          state.identifyMethod === 'catalog' && styles.catalogMethodButtonActive,
        ]}
        onPress={() => wizard.selectMethod('catalog')}
        activeOpacity={0.8}
      >
        <Ionicons
          name="library-outline"
          size={22}
          color={state.identifyMethod === 'catalog' ? Colors.light.primary : Colors.light.textSecondary}
        />
        <View style={styles.catalogMethodTextContainer}>
          <Text style={[
            styles.catalogMethodText,
            state.identifyMethod === 'catalog' && styles.catalogMethodTextActive,
          ]}>
            Selecionar do Catálogo
          </Text>
          <Text style={styles.catalogMethodSubtext}>
            Produtos pré-cadastrados da loja
          </Text>
        </View>
        <Ionicons
          name="chevron-forward"
          size={18}
          color={state.identifyMethod === 'catalog' ? Colors.light.primary : Colors.light.textTertiary}
        />
      </TouchableOpacity>
    </View>
  );

  // Renderiza busca no catálogo
  const renderCatalogSearch = () => {
    const selectedProduct = state.selectedCatalogProduct;

    return (
      <View style={styles.catalogContainer}>

        {/* ── Banner de seleção + CTA fixo no topo ── */}
        {selectedProduct ? (
          <View style={styles.selectionBanner}>
            <View style={styles.selectionBannerLeft}>
              <View style={styles.selectionCheck}>
                <Ionicons name="checkmark" size={16} color="#fff" />
              </View>
              <View style={styles.selectionInfo}>
                <Text style={styles.selectionName} numberOfLines={1}>
                  {selectedProduct.name}
                </Text>
                <Text style={styles.selectionMeta} numberOfLines={1}>
                  {selectedProduct.sku}
                  {selectedProduct.brand ? ` · ${selectedProduct.brand}` : ''}
                </Text>
              </View>
            </View>
            <View style={styles.selectionActions}>
              <TouchableOpacity
                style={styles.selectionClearBtn}
                onPress={() => wizard.selectCatalogProduct(null as any)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={16} color={Colors.light.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.selectionUseBtn}
                onPress={onNext}
                activeOpacity={0.85}
              >
                <Text style={styles.selectionUseBtnText}>Usar</Text>
                <Ionicons name="arrow-forward" size={14} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.catalogHint}>
            <Ionicons name="hand-left-outline" size={14} color={Colors.light.textTertiary} />
            <Text style={styles.catalogHintText}>Toque em um produto para selecioná-lo</Text>
          </View>
        )}

        {/* Campo de busca */}
        <TextInput
          label="Buscar no catálogo..."
          value={catalogSearch}
          onChangeText={setCatalogSearch}
          mode="outlined"
          style={styles.catalogSearchInput}
          left={<TextInput.Icon icon="magnify" />}
          right={catalogSearch ? (
            <TextInput.Icon icon="close" onPress={() => setCatalogSearch('')} />
          ) : undefined}
          outlineStyle={styles.catalogSearchOutline}
        />

        {/* Lista de produtos */}
        {catalogLoading ? (
          <View style={styles.catalogLoadingContainer}>
            <ActivityIndicator size="small" color={Colors.light.primary} />
            <Text style={styles.catalogLoadingText}>Carregando...</Text>
          </View>
        ) : catalogProducts.length === 0 ? (
          <View style={styles.catalogEmptyContainer}>
            <Ionicons name="search-outline" size={36} color={Colors.light.textTertiary} />
            <Text style={styles.catalogEmptyText}>
              {catalogSearch ? 'Nenhum produto encontrado' : 'Catálogo vazio'}
            </Text>
          </View>
        ) : (
          <View style={styles.catalogList}>
            {catalogProducts.map((product) => {
              const isSelected = state.selectedCatalogProduct?.id === product.id;
              const category = categories.find(c => c.id === product.category_id);
              return (
                <TouchableOpacity
                  key={product.id}
                  style={[
                    styles.catalogItem,
                    isSelected && styles.catalogItemSelected,
                  ]}
                  onPress={() => wizard.selectCatalogProduct(isSelected ? null as any : product)}
                  activeOpacity={0.7}
                >
                  {/* Indicador de seleção */}
                  <View style={[
                    styles.catalogItemRadio,
                    isSelected && styles.catalogItemRadioSelected,
                  ]}>
                    {isSelected && <Ionicons name="checkmark" size={12} color="#fff" />}
                  </View>

                  <View style={styles.catalogItemInfo}>
                    <Text style={[
                      styles.catalogItemName,
                      isSelected && styles.catalogItemNameSelected,
                    ]} numberOfLines={1}>
                      {product.name}
                    </Text>
                    <Text style={styles.catalogItemMeta} numberOfLines={1}>
                      {product.sku}
                      {product.brand ? ` · ${product.brand}` : ''}
                      {category ? ` · ${category.name}` : ''}
                    </Text>
                  </View>

                  {product.price != null && product.price > 0 ? (
                    <Text style={[
                      styles.catalogItemPrice,
                      isSelected && styles.catalogItemPriceSelected,
                    ]}>
                      R$ {Number(product.price).toFixed(2).replace('.', ',')}
                    </Text>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>
    );
  };

  // Renderiza interface do scanner
  const renderScanner = () => {
    // Estado inicial - botões de captura
    if (!state.capturedImage && !state.isAnalyzing) {
      return (
        <View style={styles.scannerContainer}>
          <View style={styles.illustrationContainer}>
            <LinearGradient
              colors={[Colors.light.primary + '20', Colors.light.secondary + '20']}
              style={styles.illustrationGradient}
            >
              <Ionicons name="camera" size={60} color={Colors.light.primary} />
            </LinearGradient>
          </View>

          <Text style={styles.scannerTitle}>Capture o produto</Text>
          <Text style={styles.scannerSubtitle}>
            A IA vai identificar automaticamente os dados
          </Text>

          <View style={styles.captureButtons}>
            <Button
              mode="contained"
              onPress={wizard.takePhoto}
              icon="camera"
              style={styles.captureButton}
              contentStyle={styles.captureButtonContent}
            >
              Tirar Foto
            </Button>

            <Button
              mode="contained"
              onPress={wizard.pickFromGallery}
              icon="image-multiple"
              style={styles.captureButton}
              contentStyle={styles.captureButtonContent}
            >
              Galeria
            </Button>
          </View>

          {/* Dicas */}
          <View style={styles.tipsContainer}>
            <Text style={styles.tipsTitle}>Dicas:</Text>
            <View style={styles.tipRow}>
              <Ionicons name="sunny-outline" size={14} color={Colors.light.textSecondary} />
              <Text style={styles.tipText}>Boa iluminação</Text>
            </View>
            <View style={styles.tipRow}>
              <Ionicons name="expand-outline" size={14} color={Colors.light.textSecondary} />
              <Text style={styles.tipText}>Produto centralizado</Text>
            </View>
          </View>
        </View>
      );
    }

    // Estado de análise
    if (state.isAnalyzing) {
      return (
        <View style={styles.analyzingContainer}>
          {state.capturedImage && (
            <Image
              source={{ uri: state.capturedImage }}
              style={styles.previewImage}
              resizeMode="cover"
            />
          )}
          <View style={styles.analyzingOverlay}>
            <ActivityIndicator size="large" color="#fff" />
            <Text style={styles.analyzingText}>Analisando...</Text>
            <ProgressBar indeterminate color="#fff" style={styles.progressBar} />
          </View>
        </View>
      );
    }

    // Resultado da análise
    if (state.scanResult) {
      return (
        <View style={styles.resultContainer}>
          {state.capturedImage && (
            <View style={styles.resultImageContainer}>
              <Image
                source={{ uri: state.capturedImage }}
                style={styles.resultImage}
                resizeMode="cover"
              />
              <View style={styles.imageButtonsContainer}>
                <TouchableOpacity
                  style={styles.imageActionButton}
                  onPress={saveToGallery}
                  disabled={isSavingToGallery}
                >
                  <Ionicons
                    name={isSavingToGallery ? "hourglass" : "download-outline"}
                    size={20}
                    color="#fff"
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.imageActionButton}
                  onPress={wizard.retakePhoto}
                >
                  <Ionicons name="camera-reverse" size={20} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Badges de status */}
          <View style={styles.badgesRow}>
            <View style={[styles.badge, { backgroundColor: Colors.light.success + '20' }]}>
              <Ionicons name="checkmark-circle" size={14} color={Colors.light.success} />
              <Text style={[styles.badgeText, { color: Colors.light.success }]}>
                Identificado
              </Text>
            </View>
            <View style={[styles.badge, { backgroundColor: Colors.light.primary + '20' }]}>
              <Ionicons name="analytics" size={14} color={Colors.light.primary} />
              <Text style={[styles.badgeText, { color: Colors.light.primary }]}>
                {Math.round(state.scanResult.confidence * 100)}% confiança
              </Text>
            </View>
          </View>

          {/* Preview dos dados */}
          <Card style={styles.previewCard}>
            <Card.Content>
              <Text style={styles.previewName}>{state.scanResult.name}</Text>
              <Text style={styles.previewSku}>SKU: {state.scanResult.suggested_sku}</Text>
              <Text style={styles.previewCategory}>{state.scanResult.suggested_category}</Text>
            </Card.Content>
          </Card>

          {/* Painel de duplicados expandido */}
          {state.duplicates.length > 0 && (
            <Card style={styles.duplicatesCard}>
              <Card.Content>
                <View style={styles.duplicatesHeader}>
                  <View style={styles.duplicatesIconContainer}>
                    <Ionicons name="alert-circle" size={20} color={Colors.light.warning} />
                  </View>
                  <View style={styles.duplicatesHeaderText}>
                    <Text style={styles.duplicatesTitle}>
                      {state.duplicates.length} produto(s) similar(es)
                    </Text>
                    <Text style={styles.duplicatesSubtitle}>
                      Já existe no sistema. Deseja usar um deles?
                    </Text>
                  </View>
                </View>

                {state.duplicates.slice(0, 3).map((dup) => (
                  <View key={dup.product_id} style={styles.duplicateItem}>
                    <View style={styles.duplicateInfo}>
                      <Text style={styles.duplicateName} numberOfLines={1}>
                        {dup.product_name}
                      </Text>
                      <Text style={styles.duplicateMeta}>
                        SKU: {dup.sku} • {Math.round(dup.similarity_score * 100)}% similar
                      </Text>
                    </View>
                    <View style={styles.duplicateActions}>
                      <TouchableOpacity
                        style={[
                          styles.duplicateActionBtn,
                          state.isCreating && styles.duplicateActionBtnDisabled,
                        ]}
                        disabled={state.isCreating}
                        onPress={() => wizard.addStockToDuplicate(dup.product_id)}
                      >
                        {state.isCreating ? (
                          <ActivityIndicator size={16} color={Colors.light.primary} />
                        ) : (
                          <Ionicons name="add-circle" size={20} color={Colors.light.primary} />
                        )}
                        <Text style={styles.duplicateActionText}>
                          {state.isCreating ? 'Carregando...' : 'Usar'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}

                <View style={styles.duplicatesFooter}>
                  <Ionicons name="information-circle" size={14} color={Colors.light.info} />
                  <Text style={styles.duplicatesFooterText}>
                    Ou continue abaixo para criar um produto novo
                  </Text>
                </View>
              </Card.Content>
            </Card>
          )}

          <Button
            mode="contained"
            onPress={onNext}
            style={styles.nextButton}
            icon="arrow-right"
            contentStyle={styles.nextButtonContent}
          >
            {state.duplicates.length > 0 ? 'Criar Novo Mesmo Assim' : 'Revisar Dados'}
          </Button>
        </View>
      );
    }

    // Erro
    if (state.analyzeError) {
      return (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={48} color={Colors.light.error} />
          <Text style={styles.errorText}>{String(state.analyzeError || 'Erro desconhecido')}</Text>
          <Button mode="contained" onPress={wizard.retakePhoto}>
            Tentar Novamente
          </Button>
        </View>
      );
    }

    return null;
  };

  // Renderiza formulário manual
  const renderManualForm = () => {
    const selectedCategory = categories.find(c => c.id === state.productData.category_id);

    return (
      <View style={styles.manualContainer}>
        <Text style={styles.manualTitle}>Dados Básicos</Text>
        <Text style={styles.manualSubtitle}>
          Preencha o mínimo para avançar. Você poderá completar depois.
        </Text>

        <TextInput
          label="Nome do Produto *"
          value={state.productData.name || ''}
          onChangeText={(text) => wizard.setManualData({ name: text })}
          mode="outlined"
          style={styles.input}
          placeholder="Ex: Legging Fitness Preta"
        />

        <TouchableOpacity
          style={styles.categoryButton}
          onPress={() => setCategoryModalVisible(true)}
        >
          <View style={styles.categoryButtonContent}>
            <Ionicons
              name="grid-outline"
              size={20}
              color={selectedCategory ? Colors.light.primary : Colors.light.textTertiary}
            />
            <Text style={selectedCategory ? styles.categoryText : styles.categoryPlaceholder}>
              {selectedCategory?.name || 'Selecionar categoria *'}
            </Text>
            <Ionicons name="chevron-forward" size={20} color={Colors.light.textTertiary} />
          </View>
        </TouchableOpacity>

        <Button
          mode="contained"
          onPress={onNext}
          style={styles.nextButton}
          icon="arrow-right"
          disabled={!state.productData.name || !state.productData.category_id}
        >
          Continuar
        </Button>

        <CategoryPickerModal
          visible={categoryModalVisible}
          categories={categories}
          selectedId={state.productData.category_id}
          onSelect={(category) => {
            wizard.setManualData({ category_id: category.id });
            setCategoryModalVisible(false);
          }}
          onDismiss={() => setCategoryModalVisible(false)}
        />
      </View>
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      showsVerticalScrollIndicator={false}
    >
      {/* Seleção de método */}
      {renderMethodSelection()}

      {/* Interface específica do método */}
      {state.identifyMethod === 'scanner' && renderScanner()}
      {state.identifyMethod === 'manual' && renderManualForm()}
      {state.identifyMethod === 'catalog' && renderCatalogSearch()}

      {/* ConfirmDialog para galeria (saveToGallery) */}
      <ConfirmDialog
        visible={galleryDialog.visible}
        title={galleryDialog.title}
        message={galleryDialog.message}
        type={galleryDialog.type}
        confirmText="OK"
        cancelText=""
        onConfirm={() => setGalleryDialog(d => ({ ...d, visible: false }))}
        onCancel={() => setGalleryDialog(d => ({ ...d, visible: false }))}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    padding: theme.spacing.md,
    paddingBottom: 320,
  },
  methodContainer: {
    marginBottom: theme.spacing.lg,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.light.text,
    marginBottom: theme.spacing.md,
    textAlign: 'center',
  },
  methodButtons: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  methodButton: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  methodButtonActive: {
    borderColor: Colors.light.primary,
  },
  methodButtonGradient: {
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.md,
    alignItems: 'center',
    gap: 8,
  },
  methodButtonContent: {
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.md,
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 14,
  },
  methodButtonContentActive: {
    backgroundColor: Colors.light.primary + '15',
  },
  methodButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.text,
  },
  methodButtonTextActive: {
    color: '#fff',
  },
  methodButtonTextManual: {
    color: Colors.light.primary,
  },
  methodButtonSubtext: {
    fontSize: 11,
    color: Colors.light.textSecondary,
  },
  methodButtonSubtextActive: {
    color: 'rgba(255,255,255,0.8)',
  },

  // Scanner
  scannerContainer: {
    alignItems: 'center',
    paddingVertical: theme.spacing.xl,
  },
  illustrationContainer: {
    marginBottom: theme.spacing.lg,
  },
  illustrationGradient: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scannerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.light.text,
    marginBottom: 8,
  },
  scannerSubtitle: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
  },
  captureButtons: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.xl,
  },
  captureButton: {
    backgroundColor: Colors.light.primary,
  },
  captureButtonContent: {
    paddingVertical: 6,
  },
  tipsContainer: {
    backgroundColor: Colors.light.backgroundSecondary,
    padding: theme.spacing.md,
    borderRadius: 12,
    width: '100%',
  },
  tipsTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: 8,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  tipText: {
    fontSize: 12,
    color: Colors.light.textSecondary,
  },

  // Analyzing
  analyzingContainer: {
    height: 300,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  analyzingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  analyzingText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  progressBar: {
    width: 200,
    height: 4,
    borderRadius: 2,
  },

  // Result
  resultContainer: {
    gap: theme.spacing.md,
  },
  resultImageContainer: {
    height: 180,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  resultImage: {
    width: '100%',
    height: '100%',
  },
  imageButtonsContainer: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    gap: 8,
  },
  imageActionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgesRow: {
    flexDirection: 'row',
    gap: 8,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  previewCard: {
    borderRadius: 12,
    backgroundColor: Colors.light.backgroundSecondary,
  },
  previewName: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.light.text,
    marginBottom: 4,
  },
  previewSku: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  previewCategory: {
    fontSize: 13,
    color: Colors.light.primary,
    fontWeight: '500',
  },
  // Duplicates Card
  duplicatesCard: {
    borderRadius: 16,
    backgroundColor: Colors.light.warning + '08',
    borderWidth: 1,
    borderColor: Colors.light.warning + '30',
  },
  duplicatesHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: theme.spacing.md,
  },
  duplicatesIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.light.warning + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  duplicatesHeaderText: {
    flex: 1,
  },
  duplicatesTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.light.text,
    marginBottom: 2,
  },
  duplicatesSubtitle: {
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  duplicateItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: theme.spacing.sm,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  duplicateInfo: {
    flex: 1,
  },
  duplicateName: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: 2,
  },
  duplicateMeta: {
    fontSize: 12,
    color: Colors.light.textSecondary,
  },
  duplicateActions: {
    flexDirection: 'row',
    gap: 8,
  },
  duplicateActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.light.primary + '15',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  duplicateActionBtnDisabled: {
    opacity: 0.6,
  },
  duplicateActionText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.light.primary,
  },
  duplicatesFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
  },
  duplicatesFooterText: {
    fontSize: 12,
    color: Colors.light.info,
    flex: 1,
  },
  nextButton: {
    marginTop: theme.spacing.md,
    backgroundColor: Colors.light.primary,
  },
  nextButtonContent: {
    paddingVertical: 6,
  },

  // Error
  errorContainer: {
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.xl,
  },
  errorText: {
    fontSize: 14,
    color: Colors.light.error,
    textAlign: 'center',
  },

  // Manual Form
  manualContainer: {
    marginTop: theme.spacing.lg,
  },
  manualTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.light.text,
    marginBottom: 8,
  },
  manualSubtitle: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    marginBottom: theme.spacing.lg,
  },
  input: {
    marginBottom: theme.spacing.md,
    backgroundColor: '#fff',
  },
  categoryButton: {
    borderWidth: 1.5,
    borderColor: Colors.light.border,
    borderRadius: 12,
    backgroundColor: '#fff',
    marginBottom: theme.spacing.md,
  },
  categoryButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.md,
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

  // Catálogo — botão de método
  catalogMethodButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.light.border,
    backgroundColor: '#F9FAFB',
  },
  catalogMethodButtonActive: {
    borderColor: Colors.light.primary,
    backgroundColor: Colors.light.primary + '08',
  },
  catalogMethodTextContainer: {
    flex: 1,
  },
  catalogMethodText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.text,
  },
  catalogMethodTextActive: {
    color: Colors.light.primary,
  },
  catalogMethodSubtext: {
    fontSize: 11,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },

  // Catálogo — interface de busca
  catalogContainer: {
    marginTop: theme.spacing.sm,
    gap: 10,
  },

  // Banner de seleção (aparece no topo quando produto selecionado)
  selectionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.light.success + '12',
    borderWidth: 1.5,
    borderColor: Colors.light.success + '50',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 8,
  },
  selectionBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  selectionCheck: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.light.success,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  selectionInfo: {
    flex: 1,
  },
  selectionName: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.light.text,
    marginBottom: 1,
  },
  selectionMeta: {
    fontSize: 11,
    color: Colors.light.textSecondary,
  },
  selectionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  selectionClearBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectionUseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.light.success,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  selectionUseBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },

  // Dica quando nenhum produto selecionado
  catalogHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 2,
  },
  catalogHintText: {
    fontSize: 12,
    color: Colors.light.textTertiary,
    fontStyle: 'italic',
  },

  catalogSearchInput: {
    backgroundColor: '#fff',
  },
  catalogSearchOutline: {
    borderRadius: 12,
  },
  catalogLoadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.lg,
    gap: 10,
  },
  catalogLoadingText: {
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  catalogEmptyContainer: {
    alignItems: 'center',
    paddingVertical: theme.spacing.xl,
    gap: 10,
  },
  catalogEmptyText: {
    fontSize: 14,
    color: Colors.light.textSecondary,
  },
  catalogList: {
    gap: 6,
  },
  catalogItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.light.border,
    backgroundColor: '#fff',
    gap: 10,
  },
  catalogItemSelected: {
    borderColor: Colors.light.primary,
    backgroundColor: Colors.light.primary + '06',
  },

  // Radio button
  catalogItemRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.light.border,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  catalogItemRadioSelected: {
    borderColor: Colors.light.primary,
    backgroundColor: Colors.light.primary,
  },

  catalogItemInfo: {
    flex: 1,
  },
  catalogItemName: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: 2,
  },
  catalogItemNameSelected: {
    color: Colors.light.primary,
  },
  catalogItemMeta: {
    fontSize: 11,
    color: Colors.light.textTertiary,
    lineHeight: 15,
  },
  catalogItemPrice: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.light.textSecondary,
    flexShrink: 0,
  },
  catalogItemPriceSelected: {
    color: Colors.light.primary,
  },
});
