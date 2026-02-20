/**
 * Hook de orquestração do Wizard de Criação de Produtos
 *
 * Fluxo de 3 etapas:
 * 1. Identificar - Scanner IA ou Manual
 * 2. Confirmar - Revisar e editar dados
 * 3. Entrada - Vincular a entrada de estoque
 *
 * INDEPENDENTE do useAIScanner - gerencia seu próprio estado
 */

import { useState, useCallback } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import { scanProductImage } from '@/services/aiService';
import { createProduct, getProductById, getCatalogProducts } from '@/services/productService';
import { uploadProductImageWithFallback } from '@/services/uploadService';
import { logError, logWarn, logInfo } from '@/services/debugLog';
import { generateSKU } from '@/utils/skuGenerator';
import type {
  WizardStep,
  WizardState,
  WizardDialog,
  IdentifyMethod,
  EntryChoice,
  LinkedEntryData,
} from '@/types/wizard';
import type { Product, ProductCreate, ProductScanResult } from '@/types';

// Tipo de retorno do hook para uso nos componentes
export interface UseProductWizardReturn {
  state: WizardState;

  // Permissões
  hasPermission: boolean;
  requestPermission: () => Promise<boolean>;

  // Navegação
  goToStep: (step: WizardStep) => void;
  nextStep: () => void;
  prevStep: () => void;
  canGoNext: () => boolean;

  // Step 1 - Identificar
  selectMethod: (method: IdentifyMethod) => void;
  takePhoto: () => Promise<void>;
  pickFromGallery: () => Promise<void>;
  retakePhoto: () => void;
  setManualData: (data: Partial<ProductCreate>) => void;
  selectCatalogProduct: (product: Product) => void;

  // Step 2 - Confirmar
  updateProductData: (data: Partial<ProductCreate>) => void;
  setIsEditing: (editing: boolean) => void;
  validateProductData: () => boolean;
  createProduct: () => Promise<void>;
  addStockToDuplicate: (productId: number, partialData?: Partial<Product>) => Promise<void>;

  // Step 3 - Entrada
  goToNewEntry: (quantity?: number) => void;
  goToExistingEntry: (quantity?: number) => void;
  skipEntry: () => void;

  // Step 4 - Complete (retorno de entrada)
  handleEntryCreated: (entryData: LinkedEntryData, productData?: Partial<Product> | null) => void;

  // Utils
  resetWizard: () => void;
}

const INITIAL_STATE: WizardState = {
  currentStep: 'identify',
  identifyMethod: null,
  capturedImage: null,
  scanResult: null,
  isAnalyzing: false,
  analyzeError: null,
  selectedCatalogProduct: null,
  productData: {},
  duplicates: [],
  isEditing: false,
  validationErrors: {},
  createdProduct: null,
  entryChoice: null,
  selectedEntry: null,
  linkedEntry: null,
  isDirty: false,
  isCreating: false,
  createError: null,
  wizardDialog: null,
};

const STEP_ORDER: WizardStep[] = ['identify', 'confirm', 'entry', 'complete'];

export function useProductWizard() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [state, setState] = useState<WizardState>(INITIAL_STATE);
  const [hasPermission, setHasPermission] = useState(false);

  // ============================================
  // PERMISSÕES (separadas para evitar prompt de múltiplas fotos)
  // ============================================

  const showDialog = useCallback((
    title: string,
    message: string,
    type: WizardDialog['type'] = 'warning',
    opts?: { confirmText?: string; cancelText?: string; onConfirm?: () => void }
  ) => {
    setState(prev => ({
      ...prev,
      wizardDialog: {
        visible: true,
        title,
        message,
        type,
        confirmText: opts?.confirmText ?? 'OK',
        cancelText: opts?.cancelText ?? '',
        onConfirm: opts?.onConfirm,
      },
    }));
  }, []);

  const clearWizardDialog = useCallback(() => {
    setState(prev => ({ ...prev, wizardDialog: null }));
  }, []);

  const requestCameraPermission = useCallback(async (): Promise<boolean> => {
    try {
      const result = await ImagePicker.requestCameraPermissionsAsync();
      if (result.status !== 'granted') {
        showDialog(
          'Permissao Necessaria',
          'Para usar a camera, precisamos de acesso a ela.',
          'warning'
        );
        return false;
      }
      return true;
    } catch (err) {
      console.error('Error requesting camera permission:', err);
      return false;
    }
  }, [showDialog]);

  const requestGalleryPermission = useCallback(async (): Promise<boolean> => {
    try {
      const result = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (result.status !== 'granted') {
        showDialog(
          'Permissao Necessaria',
          'Para acessar a galeria, precisamos de permissao.',
          'warning'
        );
        return false;
      }
      return true;
    } catch (err) {
      console.error('Error requesting gallery permission:', err);
      return false;
    }
  }, [showDialog]);

  // Mantém para compatibilidade
  const requestPermission = useCallback(async (): Promise<boolean> => {
    const camera = await requestCameraPermission();
    const gallery = await requestGalleryPermission();
    const granted = camera && gallery;
    setHasPermission(granted);
    return granted;
  }, [requestCameraPermission, requestGalleryPermission]);

  // ============================================
  // NAVEGAÇÃO DE STEPS
  // ============================================

  const goToStep = useCallback((step: WizardStep) => {
    setState(prev => {
      // Se está indo para 'confirm' e não tem SKU, gerar automaticamente
      if (step === 'confirm' && !prev.productData.sku) {
        const autoSku = generateSKU(
          prev.productData.name || '',
          prev.productData.brand,
          prev.productData.color,
          prev.productData.size
        );

        logInfo('Wizard', 'SKU gerado automaticamente', { sku: autoSku });

        return {
          ...prev,
          currentStep: step,
          productData: {
            ...prev.productData,
            sku: autoSku,
          },
        };
      }

      return { ...prev, currentStep: step };
    });
  }, []);

  const nextStep = useCallback(() => {
    const currentIndex = STEP_ORDER.indexOf(state.currentStep);
    if (currentIndex < STEP_ORDER.length - 1) {
      setState(prev => ({
        ...prev,
        currentStep: STEP_ORDER[currentIndex + 1]
      }));
    }
  }, [state.currentStep]);

  const prevStep = useCallback(() => {
    const currentIndex = STEP_ORDER.indexOf(state.currentStep);
    if (currentIndex > 0) {
      setState(prev => ({
        ...prev,
        currentStep: STEP_ORDER[currentIndex - 1]
      }));
    }
  }, [state.currentStep]);

  // ============================================
  // STEP 1 - IDENTIFICAR
  // ============================================

  const selectMethod = useCallback((method: IdentifyMethod) => {
    setState(prev => ({
      ...prev,
      identifyMethod: method,
      isDirty: true,
    }));
  }, []);

  const analyzeImage = useCallback(async (uri: string) => {
    setState(prev => ({
      ...prev,
      capturedImage: uri,
      isAnalyzing: true,
      analyzeError: null,
      scanResult: null,
    }));

    try {
      const response = await scanProductImage(uri, {
        checkDuplicates: true,
        suggestPrice: true,
      });

      if (response.success && response.data) {
        const result = response.data;

        // Log detalhado do resultado da IA
        logInfo('AI Scan', 'Resultado da análise', {
          name: result.name,
          brand: result.brand,
          color: result.color,
          size: result.size,
          category_id: result.suggested_category_id,
          duplicates_count: result.possible_duplicates?.length || 0,
          duplicates: result.possible_duplicates?.map(d => ({
            id: d.product_id,
            name: d.product_name,
            score: d.similarity_score,
            reason: d.reason,
          })),
        });

        setState(prev => ({
          ...prev,
          scanResult: result,
          isAnalyzing: false,
          isDirty: true,
          duplicates: result.possible_duplicates || [],
          // Pré-preencher productData com resultado do scan
          productData: {
            name: result.name,
            sku: result.suggested_sku,
            barcode: result.detected_barcode || undefined,
            description: result.description || undefined,
            brand: result.brand || undefined,
            color: result.color || undefined,
            size: result.size || undefined,
            category_id: result.suggested_category_id || undefined,
            cost_price: result.suggested_cost_price || undefined,
            price: result.suggested_sale_price || 0,
          },
        }));
      } else {
        setState(prev => ({
          ...prev,
          isAnalyzing: false,
          analyzeError: response.error || 'Não foi possível analisar a imagem',
        }));
      }
    } catch (err: any) {
      logError('Wizard', 'Erro ao analisar imagem', err);
      setState(prev => ({
        ...prev,
        isAnalyzing: false,
        analyzeError: err.message || 'Erro ao analisar imagem',
      }));
    }
  }, []);

  const takePhoto = useCallback(async () => {
    // Só pede permissão de câmera (não galeria)
    const granted = await requestCameraPermission();
    if (!granted) return;

    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        // allowsEditing força o iOS a converter HEIC -> JPEG antes de retornar a URI.
        // Sem isso, iPhones enviam image/heic que o backend rejeita.
        allowsEditing: false,
        // exif: false reduz tamanho do payload
        exif: false,
      });

      if (!result.canceled && result.assets[0]) {
        await analyzeImage(result.assets[0].uri);
      }
    } catch (err) {
      console.error('Error taking photo:', err);
      showDialog('Erro', 'Nao foi possivel tirar a foto', 'danger');
    }
  }, [requestCameraPermission, analyzeImage, showDialog]);

  const pickFromGallery = useCallback(async () => {
    // Só pede permissão de galeria (não câmera)
    const granted = await requestGalleryPermission();
    if (!granted) return;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        // allowsEditing força o iOS a converter HEIC -> JPEG antes de retornar a URI.
        // Sem isso, iPhones enviam image/heic que o backend rejeita.
        allowsEditing: false,
        exif: false,
      });

      if (!result.canceled && result.assets[0]) {
        await analyzeImage(result.assets[0].uri);
      }
    } catch (err) {
      console.error('Error picking image:', err);
      showDialog('Erro', 'Nao foi possivel selecionar a imagem', 'danger');
    }
  }, [requestGalleryPermission, analyzeImage, showDialog]);

  const retakePhoto = useCallback(() => {
    setState(prev => ({
      ...prev,
      capturedImage: null,
      scanResult: null,
      analyzeError: null,
      productData: {},
      duplicates: [],
    }));
  }, []);

  const setManualData = useCallback((data: Partial<ProductCreate>) => {
    setState(prev => ({
      ...prev,
      productData: { ...prev.productData, ...data },
      isDirty: true,
    }));
  }, []);

  const selectCatalogProduct = useCallback((product: Product) => {
    // Pré-preenche productData com os dados do produto do catálogo
    // O produto será criado como is_catalog=false (cópia da loja) no Step 2
    setState(prev => ({
      ...prev,
      selectedCatalogProduct: product,
      productData: {
        name: product.name,
        sku: product.sku,
        barcode: product.barcode || undefined,
        description: product.description || undefined,
        brand: product.brand || undefined,
        color: product.color || undefined,
        size: product.size || undefined,
        category_id: product.category_id || undefined,
        cost_price: product.cost_price || undefined,
        price: product.price || 0,
      },
      isDirty: true,
    }));
  }, []);

  // ============================================
  // STEP 2 - CONFIRMAR
  // ============================================

  const updateProductData = useCallback((data: Partial<ProductCreate>) => {
    setState(prev => ({
      ...prev,
      productData: { ...prev.productData, ...data },
      validationErrors: {},
      isDirty: true,
    }));
  }, []);

  const setIsEditing = useCallback((editing: boolean) => {
    setState(prev => ({ ...prev, isEditing: editing }));
  }, []);

  const validateProductData = useCallback((): boolean => {
    const errors: Record<string, string> = {};
    const data = state.productData;

    if (!data.name?.trim()) {
      errors.name = 'Nome é obrigatório';
    }

    if (!data.sku?.trim()) {
      errors.sku = 'SKU é obrigatório';
    }

    if (!data.category_id) {
      errors.category_id = 'Categoria é obrigatória';
    }

    if (!data.price || data.price <= 0) {
      errors.price = 'Preço de venda é obrigatório';
    }

    setState(prev => ({ ...prev, validationErrors: errors }));
    return Object.keys(errors).length === 0;
  }, [state.productData]);

  const handleCreateProduct = useCallback(async () => {
    if (!validateProductData()) {
      return;
    }

    setState(prev => ({ ...prev, isCreating: true, createError: null }));

    try {
      const productData: ProductCreate = {
        name: state.productData.name!.trim(),
        sku: state.productData.sku!.trim().toUpperCase(),
        barcode: state.productData.barcode?.trim() || undefined,
        description: state.productData.description?.trim() || undefined,
        brand: state.productData.brand?.trim() || undefined,
        color: state.productData.color?.trim() || undefined,
        size: state.productData.size?.trim() || undefined,
        category_id: state.productData.category_id!,
        cost_price: state.productData.cost_price,
        price: state.productData.price!,
        initial_stock: 0, // Sempre 0 - estoque via entrada FIFO
        min_stock: 5,
        // Produto criado pelo wizard é SEMPRE da loja (is_catalog=false),
        // independente de ter estoque inicial ou não.
        // O backend NAO deve inferir is_catalog pelo initial_stock.
        is_catalog: false,
      };

      let created = await createProduct(productData);

      // Se tiver imagem capturada, fazer upload
      if (state.capturedImage) {
        try {
          created = await uploadProductImageWithFallback(created.id, state.capturedImage);
        } catch (uploadError) {
          // Log do erro mas não bloqueia criação do produto
          logWarn('Wizard', 'Erro ao fazer upload da imagem', uploadError);
        }
      }

      // Invalidar cache
      queryClient.invalidateQueries({ queryKey: ['products'] });

      // Atualizar estado e IR PARA STEP 3 (não navegar para fora!)
      setState(prev => ({
        ...prev,
        createdProduct: created,
        isCreating: false,
        currentStep: 'entry', // <-- VAI PARA STEP 3 DO WIZARD
      }));

    } catch (error: any) {
      setState(prev => ({
        ...prev,
        isCreating: false,
        createError: error.message || 'Erro ao criar produto',
      }));
      showDialog('Erro ao criar produto', error.message || 'Tente novamente.', 'danger');
    }
  }, [state.productData, state.capturedImage, validateProductData, queryClient, showDialog]);

  const addStockToDuplicate = useCallback(async (productId: number, partialData?: Partial<Product>) => {
    // Mostrar loading
    setState(prev => ({ ...prev, isCreating: true }));

    try {
      // Buscar dados completos do produto
      const product = await getProductById(productId);

      logInfo('Wizard', 'Usando produto existente', {
        productId: product.id,
        productName: product.name,
      });

      // Usar produto existente e ir para Step 3 do wizard
      setState(prev => ({
        ...prev,
        createdProduct: product,
        currentStep: 'entry',
        isDirty: false,
        isCreating: false,
      }));
    } catch (error: any) {
      logError('Wizard', 'Erro ao buscar produto duplicado', error);
      setState(prev => ({ ...prev, isCreating: false }));
      showDialog('Erro', 'Nao foi possivel carregar os dados do produto', 'danger');
    }
  }, [showDialog]);

  // ============================================
  // STEP 3 - ENTRADA
  // ============================================

  const goToNewEntry = useCallback((quantity: number = 1) => {
    if (!state.createdProduct) {
      logError('Wizard', 'goToNewEntry chamado sem createdProduct', { state: state.currentStep });
      return;
    }

    // Validar quantidade
    const validQuantity = quantity > 0 ? quantity : 1;

    logInfo('Wizard', 'goToNewEntry - navegando para entries/add', {
      productId: state.createdProduct.id,
      productName: state.createdProduct.name,
      sku: state.createdProduct.sku,
      quantity: validQuantity,
    });

    // Ir para criação de entrada com o produto pré-selecionado
    // Usa push para permitir retorno ao wizard
    router.push({
      pathname: '/entries/add',
      params: {
        fromWizard: 'true',
        wizardProductId: String(state.createdProduct.id),
        wizardProductName: state.createdProduct.name,
        preselectedProductData: JSON.stringify({
          id: state.createdProduct.id,
          name: state.createdProduct.name,
          sku: state.createdProduct.sku,
          cost_price: state.createdProduct.cost_price,
          price: state.createdProduct.price,
          category_id: state.createdProduct.category_id,
        }),
        preselectedQuantity: String(validQuantity),
      },
    });
  }, [state.createdProduct, router]);

  // Processar retorno da tela de criação de entrada
  // Aceita dados do produto opcionalmente (para caso de entrada existente, onde o estado foi perdido)
  const handleEntryCreated = useCallback((entryData: LinkedEntryData, productData?: Partial<Product> | null) => {
    setState(prev => ({
      ...prev,
      linkedEntry: entryData,
      // Se tiver productData e não tiver createdProduct, restaurar
      createdProduct: prev.createdProduct || (productData ? productData as Product : null),
      currentStep: 'complete',
      isDirty: false,
    }));
  }, []);

  const goToExistingEntry = useCallback((quantity: number = 1) => {
    if (!state.createdProduct) return;

    logInfo('Wizard', 'goToExistingEntry - navegando para entries', {
      productId: state.createdProduct.id,
      productName: state.createdProduct.name,
      quantity,
    });

    // Ir para lista de entradas em modo seleção
    // Usa push para permitir retorno ao wizard
    router.push({
      pathname: '/entries',
      params: {
        selectMode: 'true',
        fromWizard: 'true', // Indica que veio do wizard
        productToLink: JSON.stringify({
          id: state.createdProduct.id,
          name: state.createdProduct.name,
          sku: state.createdProduct.sku,
          cost_price: state.createdProduct.cost_price,
          price: state.createdProduct.price,
          category_id: state.createdProduct.category_id,
          quantity: quantity, // Passar a quantidade escolhida
        }),
      },
    });
  }, [state.createdProduct, router]);

  const skipEntry = useCallback(() => {
    // Manter no catálogo - ir para tela de resumo
    setState(prev => ({
      ...prev,
      linkedEntry: null, // Sem entrada vinculada
      currentStep: 'complete',
      isDirty: false,
    }));
  }, []);

  // ============================================
  // UTILS
  // ============================================

  const resetWizard = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  const canGoNext = useCallback((): boolean => {
    switch (state.currentStep) {
      case 'identify':
        if (state.identifyMethod === 'scanner') {
          return !!state.scanResult && !state.isAnalyzing;
        }
        if (state.identifyMethod === 'manual') {
          return !!state.productData.name && !!state.productData.category_id;
        }
        if (state.identifyMethod === 'catalog') {
          return !!state.selectedCatalogProduct;
        }
        return false;

      case 'confirm':
        return !!state.productData.name &&
               !!state.productData.sku &&
               !!state.productData.category_id &&
               (state.productData.price || 0) > 0;

      case 'entry':
        return true;

      default:
        return false;
    }
  }, [state]);

  return {
    state,

    // Permissões
    hasPermission,
    requestPermission,

    // Navegação
    goToStep,
    nextStep,
    prevStep,
    canGoNext,

    // Step 1 - Identificar
    selectMethod,
    takePhoto,
    pickFromGallery,
    retakePhoto,
    setManualData,
    selectCatalogProduct,

    // Step 2 - Confirmar
    updateProductData,
    setIsEditing,
    validateProductData,
    createProduct: handleCreateProduct,
    addStockToDuplicate,

    // Step 3 - Entrada
    goToNewEntry,
    goToExistingEntry,
    skipEntry,

    // Step 4 - Complete (retorno de entrada)
    handleEntryCreated,

    // Utils
    resetWizard,
    clearWizardDialog,
  };
}

export default useProductWizard;
