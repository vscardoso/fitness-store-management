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
import { createProduct, getProductById, getCatalogProducts, updateProduct } from '@/services/productService';
import { createProductWithVariants } from '@/services/productVariantService';
import { uploadProductImageWithFallback } from '@/services/uploadService';
import { logError, logWarn, logInfo } from '@/services/debugLog';
import { generateSKU, generateVariantSKU } from '@/utils/skuGenerator';
import type {
  WizardStep,
  WizardState,
  WizardDialog,
  IdentifyMethod,
  EntryChoice,
  LinkedEntryData,
} from '@/types/wizard';
import type { Product, ProductCreate, ProductScanResult } from '@/types';
import type { ProductVariantCreate } from '@/types/productVariant';

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
  /** Quando o produto tem variantes, passa qtd por variante */
  goToNewEntryWithVariants: (variantQtys: Record<number, number>) => void;
  goToExistingEntry: (quantity?: number) => void;
  /** Quando o produto tem variantes, vincula cada variante à entrada existente.
   *  Para produtos atômicos (novos), cria o produto na API antes de navegar. */
  goToExistingEntryWithVariants: (variantQtys: Record<number, number>) => Promise<void> | void;
  skipEntry: () => void;

  // Step 4 - Complete (retorno de entrada)
  handleEntryCreated: (entryData: LinkedEntryData, productData?: Partial<Product> | null) => void;

  setHasVariants: (value: boolean) => void;
  setVariantSizes: (sizes: string[]) => void;
  setVariantColors: (colors: string[]) => void;
  setVariantPrice: (key: string, price: number) => void;
  setColorSizes: (colorSizes: Record<string, string[]>) => void;

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
  hasVariants: false,
  variantSizes: [],
  variantColors: [],
  variantPrices: {},
  colorSizes: {},
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
      // NÃO gerar SKU aqui - WizardStep2 faz isso com a lista de SKUs existentes
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
    // IMPORTANTE: NÃO copiar o SKU do catálogo - será gerado automaticamente no Step 2
    setState(prev => ({
      ...prev,
      selectedCatalogProduct: product,
      productData: {
        name: product.name,
        sku: undefined, // NÃO copiar SKU - será gerado automaticamente no Step 2
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

    if (state.hasVariants && state.variantSizes.length === 0 && state.variantColors.length === 0) {
      errors.variants = 'Selecione pelo menos um tamanho ou cor';
    }

    setState(prev => ({ ...prev, validationErrors: errors }));
    return Object.keys(errors).length === 0;
  }, [state.productData, state.hasVariants, state.variantSizes, state.variantColors]);

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
        // Produto criado pelo wizard começa como CATÁLOGO (is_catalog=true).
        // O backend vira is_catalog=false automaticamente quando uma entrada
        // de estoque é criada com este produto (create_entry / add_item_to_entry).
        // Isso impede produtos órfãos: se a entrada falhar, o produto fica
        // no catálogo e não aparece como ativo sem estoque.
        is_catalog: true,
      };

      let created;

      // ── Produto com variantes ───────────────────────────────────────
      if (state.hasVariants && (state.variantSizes.length > 0 || state.variantColors.length > 0)) {
        const colors = state.variantColors.length > 0 ? state.variantColors : [''];
        // SKU base do produto (sem cor/tamanho — é o "tronco" da família)
        const baseSku = state.productData.sku!.trim().toUpperCase();

        const variantsList: ProductVariantCreate[] = [];
        // Acumula SKUs já gerados nesta sessão para garantir unicidade entre variantes irmãs
        const usedSkus: string[] = [];

        for (const color of colors) {
          const sizesForColor = (state.colorSizes[color] ?? state.variantSizes);
          const sizes = sizesForColor.length > 0 ? sizesForColor : [''];
          for (const size of sizes) {
            const key = `${color}-${size}`;
            const price = state.variantPrices[key] ?? (state.productData.price ?? 0);
            // SKU de variante gerado pelo mesmo algoritmo padronizado
            const variantSku = generateVariantSKU(baseSku, color || null, size || null, usedSkus);
            usedSkus.push(variantSku);
            variantsList.push({
              sku: variantSku,
              size: size || undefined,
              color: color || undefined,
              price,
              cost_price: state.productData.cost_price,
            });
          }
        }

        // FLUXO ATÔMICO: não criar produto na API agora.
        // Produto + variantes + entrada são criados em uma única transação
        // quando o usuário confirma a entrada em entries/add.
        // Isso garante que NENHUM produto seja criado sem entrada de estoque.
        logInfo('Wizard', 'handleCreateProduct - produto com variantes: usando fluxo atômico', {
          productName: state.productData.name,
          variantsCount: variantsList.length,
        });

        created = {
          id: -1, // Sentinela: produto ainda não existe no banco
          name: state.productData.name!.trim(),
          sku: baseSku,
          barcode: state.productData.barcode?.trim() || undefined,
          description: state.productData.description?.trim() || undefined,
          brand: state.productData.brand?.trim() || undefined,
          category_id: state.productData.category_id!,
          price: state.productData.price ?? 0,
          cost_price: state.productData.cost_price,
          current_stock: 0,
          min_stock_threshold: 5,
          is_active: true,
          is_catalog: true,
          _atomicVariants: true, // Flag para o fluxo atômico de variantes
          variants: variantsList.map((v, idx) => ({
            id: idx, // IDs temporários baseados em índice (sem banco)
            sku: v.sku,
            size: v.size || undefined,
            color: v.color || undefined,
            price: v.price,
            cost_price: v.cost_price,
            is_active: true, // Necessário para WizardComplete filtrar activeVariants corretamente
          })),
        } as any;

      // ── Produto simples ─────────────────────────────────────────────
      } else {
        created = await createProduct(productData);
      }

      // Fazer upload de imagem apenas para produtos já existentes no banco (não virtuais)
      if (state.capturedImage && created.id && created.id > 0) {
        try {
          created = await uploadProductImageWithFallback(created.id, state.capturedImage);
        } catch (uploadError) {
          // Log do erro mas não bloqueia criação do produto
          logWarn('Wizard', 'Erro ao fazer upload da imagem', uploadError);
        }
      }

      // Invalidar cache
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['grouped-products'] });
      queryClient.invalidateQueries({ queryKey: ['grouped-products-modal'] });

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
  }, [state.productData, state.capturedImage, state.hasVariants, state.variantColors, state.variantSizes, state.colorSizes, state.variantPrices, validateProductData, queryClient, showDialog]);

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

    const validQuantity = quantity > 0 ? quantity : 1;
    const product = state.createdProduct as any;

    // Produto SIMPLES sem variantes: usar endpoint ATÔMICO
    // Isso garante que produto + entrada sejam criados juntos
    if (!state.hasVariants && !product.variants) {
      logInfo('Wizard', 'goToNewEntry - usando endpoint atômico', {
        productName: product.name,
        sku: product.sku,
        quantity: validQuantity,
        atomic: true,
      });

      router.push({
        pathname: '/entries/add',
        params: {
          fromWizard: 'true',
          wizardMode: 'atomic', // ← Flag para tela de entrada usar endpoint atômico
          wizardProductData: JSON.stringify({
            product_name: product.name,
            product_sku: product.sku,
            product_barcode: product.barcode,
            product_description: product.description,
            product_brand: product.brand,
            product_color: product.color,
            product_size: product.size,
            product_category_id: product.category_id,
            product_cost_price: product.cost_price,
            product_price: product.price,
          }),
          preselectedQuantity: String(validQuantity),
        },
      });
    } 
    // Produto com VARIANTES: usar fluxo tradicional (criar entrada + adicionar item)
    else {
      logInfo('Wizard', 'goToNewEntry - usando fluxo tradicional', {
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        quantity: validQuantity,
        hasVariants: true,
      });

      router.push({
        pathname: '/entries/add',
        params: {
          fromWizard: 'true',
          wizardProductId: String(product.id),
          wizardProductName: product.name,
          preselectedProductData: JSON.stringify(product),
          preselectedQuantity: String(validQuantity),
        },
      });
    }
  }, [state.createdProduct, state.hasVariants, router]);

  const goToNewEntryWithVariants = useCallback((variantQtys: Record<number, number>) => {
    if (!state.createdProduct) return;

    const product = state.createdProduct as any;
    const variants: any[] = product.variants ?? [];

    // ── FLUXO ATÔMICO: produto ainda não existe no banco ──────────────────────
    if (product._atomicVariants) {
      const variantsWithQty = variants
        .filter((v: any) => (variantQtys[v.id] ?? 0) > 0)
        .map((v: any) => ({
          sku: v.sku,
          color: v.color ?? null,
          size: v.size ?? null,
          price: v.price ?? product.price ?? 0,
          cost_price: v.cost_price ?? product.cost_price ?? 0,
          quantity: variantQtys[v.id],
        }));

      if (variantsWithQty.length === 0) {
        goToNewEntry(1);
        return;
      }

      logInfo('Wizard', 'goToNewEntryWithVariants - modo atômico', {
        productName: product.name,
        variantsCount: variantsWithQty.length,
        totalQty: variantsWithQty.reduce((s: number, v: any) => s + v.quantity, 0),
      });

      router.push({
        pathname: '/entries/add',
        params: {
          fromWizard: 'true',
          wizardProductName: product.name,
          wizardMode: 'atomic-variants',
          wizardAtomicVariantsData: JSON.stringify({
            product_name: product.name,
            product_barcode: product.barcode ?? undefined,
            product_description: product.description ?? undefined,
            product_brand: product.brand ?? undefined,
            product_category_id: product.category_id,
            base_price: product.price ?? 0,
            variants: variantsWithQty,
          }),
          // Passar sentinel para que entries/add o devolva no retorno ao wizard
          preselectedProductData: JSON.stringify(state.createdProduct),
        },
      });
      return;
    }

    // ── FLUXO TRADICIONAL: produto já existe no banco (ex: duplicado) ─────────
    const variantsPayload = variants
      .filter((v: any) => (variantQtys[v.id] ?? 0) > 0)
      .map((v: any) => ({
        variant_id: v.id,
        product_id: product.id,
        name: product.name,
        sku: v.sku,
        color: v.color ?? null,
        size: v.size ?? null,
        quantity: variantQtys[v.id] ?? 0,
        cost_price: v.cost_price ?? product.cost_price ?? 0,
        price: v.price ?? product.price ?? 0,
      }));

    if (variantsPayload.length === 0) {
      // Nenhuma variante com quantidade — ir como produto simples com qty 1
      goToNewEntry(1);
      return;
    }

    router.push({
      pathname: '/entries/add',
      params: {
        fromWizard: 'true',
        wizardProductId: String(product.id),
        wizardProductName: product.name,
        preselectedVariantsData: JSON.stringify(variantsPayload),
        // Passa o produto completo (com variants[]) para que entries/add
        // possa devolvê-lo ao wizard via createdProductData ao retornar.
        // Sem isso, o WizardComplete não tem dados para exibir o resumo.
        preselectedProductData: JSON.stringify(state.createdProduct),
      },
    });
  }, [state.createdProduct, router, goToNewEntry]);

  // Processar retorno da tela de criação de entrada
  // Aceita dados do produto opcionalmente (para caso de entrada existente, onde o estado foi perdido)
  const handleEntryCreated = useCallback((entryData: LinkedEntryData, productData?: Partial<Product> | null) => {
    setState(prev => ({
      ...prev,
      linkedEntry: entryData,
      // Se tiver productData e não tiver createdProduct, restaurar
      // productData tem prioridade sobre o sentinel local (que pode ter perdido estado após router.replace)
      createdProduct: productData ? productData as Product : prev.createdProduct,
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

  const goToExistingEntryWithVariants = useCallback(async (variantQtys: Record<number, number>) => {
    if (!state.createdProduct) return;

    let product = state.createdProduct as any;
    const variants: any[] = product.variants ?? [];

    // ── FLUXO ATÔMICO: produto virtual → criar na API antes de vincular entrada ─
    if (product._atomicVariants) {
      setState(prev => ({ ...prev, isCreating: true }));
      try {
        const variantsList: ProductVariantCreate[] = variants.map((v: any) => ({
          sku: v.sku,
          size: v.size || undefined,
          color: v.color || undefined,
          price: v.price,
          cost_price: v.cost_price,
        }));

        const withVariants = await createProductWithVariants({
          name: product.name,
          description: product.description,
          brand: product.brand,
          category_id: product.category_id,
          base_price: product.price,
          is_catalog: true, // Catálogo: ativado quando a entrada for vinculada
          variants: variantsList,
        });

        product = {
          ...withVariants,
          sku: withVariants.variants[0]?.sku || product.sku,
          price: withVariants.base_price ?? withVariants.variants[0]?.price ?? 0,
          cost_price: withVariants.variants[0]?.cost_price ?? undefined,
          current_stock: 0,
          min_stock_threshold: 5,
          is_active: true,
        } as any;

        setState(prev => ({ ...prev, createdProduct: product as Product, isCreating: false }));
        queryClient.invalidateQueries({ queryKey: ['products'] });
        queryClient.invalidateQueries({ queryKey: ['grouped-products'] });
        queryClient.invalidateQueries({ queryKey: ['grouped-products-modal'] });

        logInfo('Wizard', 'goToExistingEntryWithVariants - produto criado para entrada existente', {
          productId: product.id,
          productName: product.name,
        });
      } catch (err: any) {
        setState(prev => ({ ...prev, isCreating: false }));
        showDialog('Erro', 'Não foi possível criar o produto. Tente novamente.', 'danger');
        return;
      }
    }

    // Montar payload com variantes e quantidades
    // Para o caso atômico: variantQtys usa índices temporários (0, 1, 2...) como chave.
    // Após criação da API, product.variants tem IDs reais → mapear por índice.
    const finalVariants: any[] = (product as any).variants ?? variants;
    const wasAtomicVariants = !(product as any)._atomicVariants; // já foi criado, flag removida
    const variantsPayload = finalVariants
      .map((v: any, idx: number) => {
        // Se veio do fluxo atômico: índice era o mapeamento de qtd
        // Se veio direto: v.id é o ID real no banco
        const qty = variantQtys[idx] ?? variantQtys[v.id] ?? 0;
        return {
          variant_id: v.id,
          product_id: product.id,
          name: product.name,
          sku: v.sku,
          color: v.color ?? null,
          size: v.size ?? null,
          quantity: qty,
          cost_price: v.cost_price ?? product.cost_price ?? 0,
          price: v.price ?? product.price ?? 0,
        };
      })
      .filter((v: any) => v.quantity > 0);

    if (variantsPayload.length === 0) {
      goToExistingEntry(1);
      return;
    }

    router.push({
      pathname: '/entries',
      params: {
        selectMode: 'true',
        fromWizard: 'true',
        productToLink: JSON.stringify({
          id: product.id,
          name: product.name,
          sku: product.sku,
          cost_price: product.cost_price,
          price: product.price,
          category_id: product.category_id,
          isVariantProduct: true,
          variants: variantsPayload,
          // Quantidade total para exibir no resumo
          quantity: variantsPayload.reduce((s: number, v: any) => s + v.quantity, 0),
          // Produto completo para restaurar no wizard após retorno
          _fullProductData: JSON.stringify(state.createdProduct),
        }),
      },
    });
  }, [state.createdProduct, router, goToExistingEntry]);

  const skipEntry = useCallback(() => {
    const product = state.createdProduct as any;
    // Apenas chamar updateProduct se o produto realmente existe no banco (não é virtual)
    if (state.createdProduct?.id && state.createdProduct.id > 0 && !product?._atomicVariants) {
      updateProduct(state.createdProduct.id, { is_catalog: true } as any).catch(err => {
        logWarn('Wizard', 'Falha ao restaurar is_catalog=True no skipEntry', err);
      });
    }

    setState(prev => ({
      ...prev,
      linkedEntry: null, // Sem entrada vinculada
      currentStep: 'complete',
      isDirty: false,
    }));
  }, [state.createdProduct]);

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

    // Variant management - COM SINCRONIZAÇÃO AUTOMÁTICA
    setHasVariants: useCallback((value: boolean) => {
      setState(prev => {
        // ATIVANDO variantes: migrar cor/tamanho do productData para variantes
        if (value && !prev.hasVariants) {
          const colors: string[] = [];
          const sizes: string[] = [];
          const newColorSizes: Record<string, string[]> = {};
          
          // Migrar cor do productData se existir
          if (prev.productData.color?.trim()) {
            colors.push(prev.productData.color.trim());
          }
          
          // Migrar tamanho do productData se existir
          if (prev.productData.size?.trim()) {
            sizes.push(prev.productData.size.trim());
          }
          
          // Se houver cor E tamanho, associar o tamanho à cor
          if (colors.length > 0 && sizes.length > 0) {
            newColorSizes[colors[0]] = sizes;
          }
          
          return {
            ...prev,
            hasVariants: value,
            variantColors: colors.length > 0 ? colors : [],
            variantSizes: sizes.length > 0 ? sizes : [],
            colorSizes: newColorSizes,
            // Limpar cor/tamanho do productData para evitar duplicidade
            productData: {
              ...prev.productData,
              color: undefined,
              size: undefined,
            },
          };
        }
        
        // DESATIVANDO variantes: migrar de volta para productData se houver apenas 1 cor/tamanho
        if (!value && prev.hasVariants) {
          const hasSingleColor = prev.variantColors.length === 1;
          const hasSingleSize = prev.variantSizes.length === 1;
          
          return {
            ...prev,
            hasVariants: value,
            // Se tem apenas 1 cor e/ou 1 tamanho, migrar para productData
            productData: hasSingleColor || hasSingleSize
              ? {
                  ...prev.productData,
                  color: hasSingleColor ? prev.variantColors[0] : undefined,
                  size: hasSingleSize ? prev.variantSizes[0] : undefined,
                }
              : prev.productData,
            // Limpar estados de variantes
            variantColors: [],
            variantSizes: [],
            colorSizes: {},
            variantPrices: {},
          };
        }
        
        // Toggle sem migração de dados
        return { ...prev, hasVariants: value };
      });
    }, []),
    setVariantSizes: useCallback((sizes: string[]) => {
      setState(prev => ({ ...prev, variantSizes: sizes }));
    }, []),
    setVariantColors: useCallback((colors: string[]) => {
      setState(prev => ({ ...prev, variantColors: colors }));
    }, []),
    setVariantPrice: useCallback((key: string, price: number) => {
      setState(prev => ({
        ...prev,
        variantPrices: { ...prev.variantPrices, [key]: price },
      }));
    }, []),
    setColorSizes: useCallback((colorSizes: Record<string, string[]>) => {
      setState(prev => ({ ...prev, colorSizes }));
    }, []),

    // Step 3 - Entrada
    goToNewEntry,
    goToNewEntryWithVariants,
    goToExistingEntry,
    goToExistingEntryWithVariants,
    skipEntry,

    // Step 4 - Complete (retorno de entrada)
    handleEntryCreated,

    // Utils
    resetWizard,
    clearWizardDialog,
  };
}

export default useProductWizard;
