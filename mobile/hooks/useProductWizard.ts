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
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import { scanProductImage } from '@/services/aiService';
import { createProduct } from '@/services/productService';
import { uploadProductImageWithFallback } from '@/services/uploadService';
import type {
  WizardStep,
  WizardState,
  IdentifyMethod,
  EntryChoice,
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

  // Step 2 - Confirmar
  updateProductData: (data: Partial<ProductCreate>) => void;
  setIsEditing: (editing: boolean) => void;
  validateProductData: () => boolean;
  createProduct: () => Promise<void>;
  addStockToDuplicate: (productId: number) => void;

  // Step 3 - Entrada
  goToNewEntry: () => void;
  goToExistingEntry: () => void;
  skipEntry: () => void;

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
  isDirty: false,
  isCreating: false,
  createError: null,
};

const STEP_ORDER: WizardStep[] = ['identify', 'confirm', 'entry'];

export function useProductWizard() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [state, setState] = useState<WizardState>(INITIAL_STATE);
  const [hasPermission, setHasPermission] = useState(false);

  // ============================================
  // PERMISSÕES
  // ============================================

  const requestPermission = useCallback(async (): Promise<boolean> => {
    try {
      const cameraResult = await ImagePicker.requestCameraPermissionsAsync();
      const libraryResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      const granted = cameraResult.status === 'granted' && libraryResult.status === 'granted';
      setHasPermission(granted);

      if (!granted) {
        Alert.alert(
          'Permissão Necessária',
          'Para usar o scanner, precisamos de acesso à câmera e galeria.'
        );
      }
      return granted;
    } catch (err) {
      console.error('Error requesting permissions:', err);
      return false;
    }
  }, []);

  // ============================================
  // NAVEGAÇÃO DE STEPS
  // ============================================

  const goToStep = useCallback((step: WizardStep) => {
    setState(prev => ({ ...prev, currentStep: step }));
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
      console.error('Error analyzing image:', err);
      setState(prev => ({
        ...prev,
        isAnalyzing: false,
        analyzeError: err.message || 'Erro ao analisar imagem',
      }));
    }
  }, []);

  const takePhoto = useCallback(async () => {
    if (!hasPermission) {
      const granted = await requestPermission();
      if (!granted) return;
    }

    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        await analyzeImage(result.assets[0].uri);
      }
    } catch (err) {
      console.error('Error taking photo:', err);
      Alert.alert('Erro', 'Não foi possível tirar a foto');
    }
  }, [hasPermission, requestPermission, analyzeImage]);

  const pickFromGallery = useCallback(async () => {
    if (!hasPermission) {
      const granted = await requestPermission();
      if (!granted) return;
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        await analyzeImage(result.assets[0].uri);
      }
    } catch (err) {
      console.error('Error picking image:', err);
      Alert.alert('Erro', 'Não foi possível selecionar a imagem');
    }
  }, [hasPermission, requestPermission, analyzeImage]);

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
      };

      let created = await createProduct(productData);

      // Se tiver imagem capturada, fazer upload
      if (state.capturedImage) {
        try {
          created = await uploadProductImageWithFallback(created.id, state.capturedImage);
        } catch (uploadError) {
          // Log do erro mas não bloqueia criação do produto
          console.warn('Erro ao fazer upload da imagem:', uploadError);
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
      Alert.alert('Erro', error.message || 'Erro ao criar produto');
    }
  }, [state.productData, validateProductData, queryClient]);

  const addStockToDuplicate = useCallback((productId: number, productData: Partial<Product>) => {
    // Usar produto existente e ir para Step 3 do wizard
    setState(prev => ({
      ...prev,
      createdProduct: productData as Product,
      currentStep: 'entry',
      isDirty: false,
    }));
  }, []);

  // ============================================
  // STEP 3 - ENTRADA
  // ============================================

  const goToNewEntry = useCallback(() => {
    if (!state.createdProduct) return;

    // Ir para criação de entrada com o produto pré-selecionado
    router.replace({
      pathname: '/entries/add',
      params: {
        fromWizard: 'true',
        preselectedProductData: JSON.stringify({
          id: state.createdProduct.id,
          name: state.createdProduct.name,
          sku: state.createdProduct.sku,
          cost_price: state.createdProduct.cost_price,
          price: state.createdProduct.price,
          category_id: state.createdProduct.category_id,
        }),
        preselectedQuantity: '1',
      },
    });
  }, [state.createdProduct, router]);

  const goToExistingEntry = useCallback(() => {
    if (!state.createdProduct) return;

    // Ir para lista de entradas em modo seleção
    router.replace({
      pathname: '/entries',
      params: {
        selectMode: 'true',
        productToLink: JSON.stringify({
          id: state.createdProduct.id,
          name: state.createdProduct.name,
          sku: state.createdProduct.sku,
          cost_price: state.createdProduct.cost_price,
          price: state.createdProduct.price,
          category_id: state.createdProduct.category_id,
        }),
      },
    });
  }, [state.createdProduct, router]);

  const skipEntry = useCallback(() => {
    // Manter no catálogo - voltar para lista de produtos
    router.replace('/(tabs)/products');
  }, [router]);

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

    // Utils
    resetWizard,
  };
}

export default useProductWizard;
