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
import { skipLoading } from '@/utils/apiHelpers';
import { createProductWithVariants } from '@/services/productVariantService';
import { uploadProductImageWithFallback } from '@/services/uploadService';
import { logError, logWarn, logInfo } from '@/services/debugLog';
import { generateSKU, generateVariantSKU } from '@/utils/skuGenerator';
import { capitalizeWords } from '@/utils/format';
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

// Backup module-level do produto criado — sobrevive a remounts causados por router.replace.
// entries/add pode retornar ao wizard via replace (novo componente), perdendo o estado React.
// Armazenamos aqui como fallback antes de navegar para qualquer tela de entrada.
let _wizardCreatedProductBackup: any = null;

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
  selectDuplicateProduct: (productId: number, quantity?: number) => void;

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
  restoreFromRoute: (step: WizardStep, productData?: any) => void;

  setHasVariants: (value: boolean) => void;
  setVariantSizes: (sizes: string[]) => void;
  setVariantColors: (colors: string[]) => void;
  setVariantPrice: (key: string, price: number) => void;
  setColorSizes: (colorSizes: Record<string, string[]>) => void;

  // Utils
  resetWizard: () => void;
  resetCreatedProduct: () => void;
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

function normalizeRouteProductData(input: any): any {
  if (!input || typeof input !== 'object') return null;

  if ('product_name' in input || 'product_sku' in input) {
    return {
      id: input.id,
      name: input.product_name,
      sku: input.product_sku,
      barcode: input.product_barcode,
      description: input.product_description,
      brand: input.product_brand,
      color: input.product_color,
      size: input.product_size,
      gender: input.product_gender,
      material: input.product_material,
      category_id: input.product_category_id,
      cost_price: input.product_cost_price,
      price: input.product_price,
      variants: input.variants,
    };
  }

  return input;
}

export function useProductWizard() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [state, setState] = useState<WizardState>(INITIAL_STATE);
  const [hasPermission, setHasPermission] = useState(false);

  const invalidateProductCaches = useCallback((productId?: number) => {
    queryClient.invalidateQueries({ queryKey: ['products'] });
    queryClient.invalidateQueries({ queryKey: ['grouped-products'] });
    queryClient.invalidateQueries({ queryKey: ['grouped-products-modal'] });
    queryClient.invalidateQueries({ queryKey: ['active-products'] });
    queryClient.invalidateQueries({ queryKey: ['catalog-products-count'] });
    queryClient.invalidateQueries({ queryKey: ['incomplete-products-count'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });

    if (productId && productId > 0) {
      queryClient.invalidateQueries({ queryKey: ['product', productId] });
      queryClient.invalidateQueries({ queryKey: ['inventory', productId] });
    }
  }, [queryClient]);

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
      // Duplicados só fazem sentido no fluxo de scanner.
      duplicates: method === 'scanner' ? prev.duplicates : [],
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
            gender: (result as any).gender ? capitalizeWords((result as any).gender) : undefined,
            material: (result as any).material || undefined,
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
      duplicates: [],
      productData: {
        name: product.name,
        sku: undefined, // NÃO copiar SKU - será gerado automaticamente no Step 2
        barcode: product.barcode || undefined,
        description: product.description || undefined,
        brand: product.brand || undefined,
        color: product.color || undefined,
        size: product.size || undefined,
        gender: product.gender ? capitalizeWords(product.gender) : undefined,
        material: product.material || undefined,
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
        gender: state.productData.gender?.trim()
          ? capitalizeWords(state.productData.gender.trim())
          : undefined,
        material: state.productData.material?.trim() || undefined,
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
          gender: state.productData.gender?.trim() || undefined,
          material: state.productData.material?.trim() || undefined,
          category_id: state.productData.category_id!,
          price: state.productData.price ?? 0,
          cost_price: state.productData.cost_price,
          current_stock: 0,
          min_stock_threshold: 5,
          is_active: true,
          is_catalog: true,
          _atomicVariants: true, // Flag para o fluxo atômico de variantes
          _hasWizardVariants: true,
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
      // NÃO cria na API ainda — produto + entrada são criados atomicamente
      // em entries/add (wizardMode: 'atomic'). Se o usuário voltar ou fechar
      // o app antes de confirmar a entrada, nada é persistido no banco.
      } else {
        created = {
          ...productData,
          image_url: state.capturedImage || undefined,
          _virtual: true, // ainda não existe no banco
          _hasWizardVariants: false,
          current_stock: 0,
          min_stock_threshold: 5,
          is_active: true,
        } as any;
      }

      // Upload de imagem: apenas para produtos que já existem no banco
      // (variantes criadas via goToExistingEntryWithVariants antes de retornar aqui)
      if (state.capturedImage && (created as any)._atomicVariants !== true && (created as any)._virtual !== true && created.id && created.id > 0) {
        try {
          created = await uploadProductImageWithFallback(created.id, state.capturedImage);
        } catch (uploadError) {
          logWarn('Wizard', 'Erro ao fazer upload da imagem', uploadError);
        }
      }

      // Invalidar cache
      invalidateProductCaches(created?.id);

      // Atualizar estado e IR PARA STEP 3 (não navegar para fora!)
      _wizardCreatedProductBackup = created; // Backup para sobreviver router.replace
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
  }, [state.productData, state.capturedImage, state.hasVariants, state.variantColors, state.variantSizes, state.colorSizes, state.variantPrices, validateProductData, invalidateProductCaches, showDialog]);

  // ─────────────────────────────────────────────────────────────────────────────
  // selectDuplicateProduct — BLOCO BLINDADO: não alterar sem revisar todo o fluxo
  // de seleção de similar. Qualquer mudança aqui impacta: WizardStep1 (remoção do
  // useEffect de auto-avanço), WizardStep2 (guard de SKU), e o ciclo de vida do
  // wizard inteiro.
  //
  // COMPORTAMENTO ESPERADO:
  //  1. Busca produto existente por ID
  //  2. Limpa duplicates (evita painel fantasma no Step 1 e loop de volta)
  //  3. Navega DIRETAMENTE para 'confirm' (Step 2) via currentStep no setState
  //     — Isso elimina a necessidade do useEffect de auto-avanço no WizardStep1
  //     — E garante que SKU NÃO seja regenerado no Step 2 (createdProduct.id > 0)
  //  4. hasVariants: false — variantes do produto existente NÃO são pre-selecionadas
  //     (o produto já existe; o wizard está sendo usado para repor estoque, não criar)
  // ─────────────────────────────────────────────────────────────────────────────
  const selectDuplicateProduct = useCallback((productId: number, quantity: number = 1) => {
    logInfo('Wizard', 'Produto duplicado selecionado — iniciando fetch em background', { productId, quantity });

    getProductById(productId)
      .then(existingProduct => {
        logInfo('Wizard', 'Produto duplicado carregado com sucesso', { productId });

        const existingWithFlag = {
          ...(existingProduct as any),
          _hasWizardVariants: false, // Não pré-selecionar variantes: produto já existe
        } as Product;

        _wizardCreatedProductBackup = existingWithFlag;
        setState(prev => ({
          ...prev,
          createdProduct: existingWithFlag,
          hasVariants: false,          // Produto existente: não pré-marcar variantes
          duplicates: [],              // Limpar para sumir o painel e evitar loop de volta
          currentStep: 'confirm',      // Navegar diretamente — sem depender de useEffect externo
          productData: {
            ...prev.productData,
            name: existingProduct.name,
            sku: existingProduct.sku,
            barcode: existingProduct.barcode || undefined,
            description: existingProduct.description || undefined,
            brand: existingProduct.brand || undefined,
            color: existingProduct.color || undefined,
            size: existingProduct.size || undefined,
            gender: existingProduct.gender ? capitalizeWords(existingProduct.gender) : undefined,
            material: existingProduct.material || undefined,
            category_id: existingProduct.category_id,
            cost_price: existingProduct.cost_price || undefined,
            price: existingProduct.price || prev.productData.price,
          },
          entryChoice: 'new',
          isDirty: true,
        }));
      })
      .catch(error => {
        logError('Wizard', 'Erro ao carregar produto duplicado', {
          productId,
          message: error?.message,
        });
        showDialog('Erro', 'Não foi possível carregar o produto existente.', 'danger');
      });
  }, [showDialog]);
  // ─────────────────────────────────────────────────────────────────────────────

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
          ...(state.capturedImage ? { wizardImageUri: encodeURIComponent(state.capturedImage) } : {}),
          wizardProductData: JSON.stringify({
            product_name: product.name,
            product_sku: product.sku,
            product_barcode: product.barcode,
            product_description: product.description,
            product_brand: product.brand,
            product_color: product.color,
            product_size: product.size,
            product_gender: product.gender,
            product_material: product.material,
            product_category_id: product.category_id,
            product_cost_price: product.cost_price,
            product_price: product.price,
          }),
          // Snapshot para restaurar contexto completo ao voltar da entrada.
          preselectedProductData: JSON.stringify(state.createdProduct),
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
          ...(state.capturedImage ? { wizardImageUri: encodeURIComponent(state.capturedImage) } : {}),
          preselectedProductData: JSON.stringify(product),
          preselectedQuantity: String(validQuantity),
        },
      });
    }
  }, [state.createdProduct, state.hasVariants, state.capturedImage, router]);

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
          ...(state.capturedImage ? { wizardImageUri: encodeURIComponent(state.capturedImage) } : {}),
          wizardAtomicVariantsData: JSON.stringify({
            product_name: product.name,
            product_barcode: product.barcode ?? undefined,
            product_description: product.description ?? undefined,
            product_brand: product.brand ?? undefined,
            product_gender: product.gender ?? undefined,
            product_material: product.material ?? undefined,
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
        ...(state.capturedImage ? { wizardImageUri: encodeURIComponent(state.capturedImage) } : {}),
        preselectedVariantsData: JSON.stringify(variantsPayload),
        // Passa o produto completo (com variants[]) para que entries/add
        // possa devolvê-lo ao wizard via createdProductData ao retornar.
        // Sem isso, o WizardComplete não tem dados para exibir o resumo.
        preselectedProductData: JSON.stringify(state.createdProduct),
      },
    });
  }, [state.createdProduct, state.capturedImage, router, goToNewEntry]);

  // Processar retorno da tela de criação de entrada
  // Aceita dados do produto opcionalmente (para caso de entrada existente, onde o estado foi perdido)
  const handleEntryCreated = useCallback((entryData: LinkedEntryData, productData?: Partial<Product> | null) => {
    // Prioridade: params > backup module-level > estado React atual
    // O backup garante que mesmo um router.replace (novo componente, estado zerado)
    // ainda consiga exibir o produto correto no WizardComplete.
    const backup = _wizardCreatedProductBackup;
    _wizardCreatedProductBackup = null; // Consumido
    const normalized = normalizeRouteProductData(productData as any);
    const normalizedHasVariants =
      typeof (normalized as any)?._hasWizardVariants === 'boolean'
        ? (normalized as any)._hasWizardVariants
        : Array.isArray((normalized as any)?.variants)
          ? (normalized as any).variants.length > 0
          : undefined;

    setState(prev => ({
      ...prev,
      linkedEntry: entryData,
      identifyMethod: prev.identifyMethod ?? (normalized?.name ? 'manual' : prev.identifyMethod),
      productData: {
        ...prev.productData,
        ...(normalized?.name ? {
          name: normalized.name,
          sku: normalized.sku,
          barcode: normalized.barcode || undefined,
          description: normalized.description || undefined,
          brand: normalized.brand || undefined,
          color: normalized.color || undefined,
          size: normalized.size || undefined,
          gender: normalized.gender ? capitalizeWords(normalized.gender) : undefined,
          material: normalized.material || undefined,
          category_id: normalized.category_id,
          cost_price: normalized.cost_price || undefined,
          price: normalized.price || prev.productData.price,
        } : {}),
      },
      createdProduct: (normalized as Product) ?? backup ?? prev.createdProduct,
      hasVariants: normalizedHasVariants ?? prev.hasVariants,
      currentStep: 'complete',
      isDirty: false,
    }));
  }, []);

  const restoreFromRoute = useCallback((step: WizardStep, productData?: any) => {
    const normalized = normalizeRouteProductData(productData);
    const normalizedHasVariants =
      typeof (normalized as any)?._hasWizardVariants === 'boolean'
        ? (normalized as any)._hasWizardVariants
        : Array.isArray((normalized as any)?.variants)
          ? (normalized as any).variants.length > 0
          : undefined;

    setState(prev => ({
      ...prev,
      identifyMethod: prev.identifyMethod ?? (normalized?.name ? 'manual' : prev.identifyMethod),
      productData: {
        ...prev.productData,
        ...(normalized?.name ? {
          name: normalized.name,
          sku: normalized.sku,
          barcode: normalized.barcode || undefined,
          description: normalized.description || undefined,
          brand: normalized.brand || undefined,
          color: normalized.color || undefined,
          size: normalized.size || undefined,
          gender: normalized.gender ? capitalizeWords(normalized.gender) : undefined,
          material: normalized.material || undefined,
          category_id: normalized.category_id,
          cost_price: normalized.cost_price || undefined,
          price: normalized.price || prev.productData.price,
        } : {}),
      },
      createdProduct:
        step === 'entry' || step === 'complete'
          ? (normalized as Product) ?? prev.createdProduct
          : prev.createdProduct,
      hasVariants:
        normalized
          ? (normalizedHasVariants ?? false)
          : prev.hasVariants,
      currentStep: step,
      isDirty: true,
    }));
  }, []);

  const goToExistingEntry = useCallback(async (quantity: number = 1) => {
    if (!state.createdProduct) return;

    const productAny = state.createdProduct as any;

    // Produto simples virtual: criar na API antes de vincular a entrada existente
    if (productAny._virtual) {
      setState(prev => ({ ...prev, isCreating: true }));
      try {
        const { _virtual, ...productPayload } = productAny;
        let realProduct = await createProduct({ ...productPayload, is_catalog: true } as any);
        if (state.capturedImage) {
          try {
            realProduct = await uploadProductImageWithFallback(realProduct.id, state.capturedImage);
          } catch (uploadErr) {
            logWarn('Wizard', 'goToExistingEntry - erro ao fazer upload da imagem', uploadErr);
          }
        }
        invalidateProductCaches(realProduct.id);
        _wizardCreatedProductBackup = realProduct;
        setState(prev => ({ ...prev, createdProduct: realProduct as Product, isCreating: false }));
        // Navegar com o produto real recém-criado
        router.push({
          pathname: '/entries',
          params: {
            selectMode: 'true',
            fromWizard: 'true',
            productToLink: JSON.stringify({
              id: realProduct.id,
              name: realProduct.name,
              sku: realProduct.sku,
              barcode: realProduct.barcode,
              image_url: realProduct.image_url,
              cost_price: realProduct.cost_price,
              price: realProduct.price,
              category_id: realProduct.category_id,
              quantity,
            }),
          },
        });
        return;
      } catch (err: any) {
        setState(prev => ({ ...prev, isCreating: false }));
        showDialog('Erro', 'Não foi possível criar o produto. Tente novamente.', 'danger');
        return;
      }
    }

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
          barcode: state.createdProduct.barcode,
          image_url: (state.createdProduct as any).image_url,
          cost_price: state.createdProduct.cost_price,
          price: state.createdProduct.price,
          category_id: state.createdProduct.category_id,
          quantity: quantity, // Passar a quantidade escolhida
        }),
      },
    });
  }, [state.createdProduct, state.capturedImage, invalidateProductCaches, router, showDialog]);

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
          gender: product.gender,
          material: product.material,
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

        if (state.capturedImage) {
          try {
            product = await uploadProductImageWithFallback(product.id, state.capturedImage);
          } catch (uploadErr) {
            logWarn('Wizard', 'goToExistingEntryWithVariants - erro ao fazer upload da imagem', uploadErr);
          }
        }

        _wizardCreatedProductBackup = product; // Backup para sobreviver router.replace
        setState(prev => ({ ...prev, createdProduct: product as Product, isCreating: false }));
        invalidateProductCaches(product.id);

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

    // Montar payload com variantes e quantidades.
    // variantQtys é keyed por v.id:
    //   - Fluxo atômico (criado agora): id temporário = índice (0,1,2) → usar idx
    //   - Fluxo direto (produto existente): id real do banco → usar v.id
    // A expressão idx ?? v.id cobre ambos os casos corretamente.
    const finalVariants: any[] = (product as any).variants ?? variants;
    const variantsPayload = finalVariants
      .map((v: any, idx: number) => {
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
          barcode: product.barcode,
          image_url: product.image_url,
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
  }, [state.createdProduct, state.capturedImage, router, goToExistingEntry, invalidateProductCaches, showDialog]);

  const skipEntry = useCallback(() => {
    const product = state.createdProduct as any;

    // PRODUTO SIMPLES VIRTUAL: nunca foi criado no banco.
    // Criar como catálogo agora (usuário escolheu explicitamente pular a entrada).
    if (product?._virtual) {
      setState(prev => ({ ...prev, isCreating: true }));
      const { _virtual, ...productPayload } = product;
      createProduct({ ...productPayload, is_catalog: true } as any).then(async (created) => {
        let createdWithImage = created;
        if (state.capturedImage) {
          try {
            createdWithImage = await uploadProductImageWithFallback(created.id, state.capturedImage);
          } catch (uploadErr) {
            logWarn('Wizard', 'skipEntry - erro ao fazer upload da imagem (produto virtual)', uploadErr);
          }
        }
        invalidateProductCaches(createdWithImage?.id);
        setState(prev => ({
          ...prev,
          createdProduct: createdWithImage as Product,
          linkedEntry: null,
          currentStep: 'complete',
          isDirty: false,
          isCreating: false,
        }));
      }).catch((err: any) => {
        logError('Wizard', 'skipEntry - erro ao criar produto virtual no catálogo', err);
        setState(prev => ({ ...prev, isCreating: false }));
        showDialog('Erro', 'Não foi possível salvar o produto. Tente novamente.', 'danger');
      });
      return;
    }

    // PRODUTO COM VARIANTES VIRTUAL: nunca foi criado no banco.
    // Criar como catálogo agora para não perder os dados configurados pelo usuário.
    if (product?._atomicVariants) {
      setState(prev => ({ ...prev, isCreating: true }));
      const variantsList: ProductVariantCreate[] = (product.variants ?? []).map((v: any) => ({
        sku: v.sku,
        size: v.size || undefined,
        color: v.color || undefined,
        price: v.price,
        cost_price: v.cost_price,
      }));
      createProductWithVariants({
        name: product.name,
        description: product.description,
        brand: product.brand,
        gender: product.gender,
        material: product.material,
        category_id: product.category_id,
        base_price: product.price,
        is_catalog: true,
        variants: variantsList,
      }).then(async (created) => {
        let createdWithImage = created;
        if (state.capturedImage) {
          try {
            createdWithImage = await uploadProductImageWithFallback(created.id, state.capturedImage);
          } catch (uploadErr) {
            logWarn('Wizard', 'skipEntry - erro ao fazer upload da imagem (produto variantes)', uploadErr);
          }
        }
        const createdProduct = {
          ...createdWithImage,
          sku: createdWithImage.variants?.[0]?.sku || product.sku,
          price: createdWithImage.base_price ?? createdWithImage.variants?.[0]?.price ?? 0,
          cost_price: createdWithImage.variants?.[0]?.cost_price ?? undefined,
          current_stock: 0,
          min_stock_threshold: 5,
          is_active: true,
        } as any;
        _wizardCreatedProductBackup = createdProduct;
        invalidateProductCaches(createdProduct?.id);
        setState(prev => ({
          ...prev,
          createdProduct: createdProduct as Product,
          linkedEntry: null,
          currentStep: 'complete',
          isDirty: false,
          isCreating: false,
        }));
      }).catch((err: any) => {
        logError('Wizard', 'skipEntry - erro ao criar produto atômico no catálogo', err);
        setState(prev => ({ ...prev, isCreating: false }));
        showDialog('Erro', 'Não foi possível salvar o produto. Tente novamente.', 'danger');
      });
      return;
    }

    // Produto simples: atualizar is_catalog se necessário (silencioso — não mostrar loading)
    if (state.createdProduct?.id && state.createdProduct.id > 0) {
      updateProduct(state.createdProduct.id, { is_catalog: true } as any, skipLoading()).catch(err => {
        logWarn('Wizard', 'Falha ao restaurar is_catalog=True no skipEntry', err);
      });
    }

    setState(prev => ({
      ...prev,
      linkedEntry: null,
      currentStep: 'complete',
      isDirty: false,
    }));
  }, [state.createdProduct, state.capturedImage, invalidateProductCaches, showDialog]);

  // ============================================
  // UTILS
  // ============================================

  const resetWizard = useCallback(() => {
    _wizardCreatedProductBackup = null;
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
    selectDuplicateProduct,

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
    restoreFromRoute,

    // Utils
    resetWizard,
    clearWizardDialog,
    resetCreatedProduct: useCallback(() => {
      setState(prev => ({ ...prev, createdProduct: null }));
    }, []),
  };
}

export default useProductWizard;
