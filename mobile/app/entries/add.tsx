/**
 * Stock Entry Add Screen - Nova Entrada de Estoque
 *
 * Funcionalidades:
 * - Escolher tipo de entrada (Viagem, Online, Local)
 * - Formulário com fornecedor, NF, pagamento
 * - Lista de produtos com busca
 * - Cálculo automático do total
 * - Validação completa
 * - Suporte a produto pré-selecionado do catálogo
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
  TouchableOpacity,
  Modal,
  Text,
} from 'react-native';
import {
  TextInput,
  Button,
  HelperText,
  Chip,
  Menu,
  IconButton,
  Divider,
} from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import PageHeader from '@/components/layout/PageHeader';
import { useTrips } from '@/hooks/useTrips';
import { useProducts } from '@/hooks';
import { createStockEntry, createStockEntryWithNewProduct, createStockEntryWithNewProductVariants, checkEntryCode } from '@/services/stockEntryService';
import { getCatalogProducts, activateCatalogProduct } from '@/services/catalogService';
import { formatCurrency } from '@/utils/format';
import { cnpjMask, phoneMask } from '@/utils/masks';
import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { EntryType, StockEntryCreate, EntryItem, Product } from '@/types';
import type { WizardStep } from '@/types/wizard';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import WizardStepper from '@/components/products/WizardStepper';
import KeyboardAwareScreen from '@/components/ui/KeyboardAwareScreen';
import { logInfo, logError } from '@/services/debugLog';

/**
 * Capitaliza a primeira letra de cada palavra no nome do fornecedor
 * Ex: "joão silva" -> "João Silva", "MARIA SANTOS" -> "Maria Santos"
 */
const capitalizeSupplierName = (text: string): string => {
  if (!text) return text;
  return text
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

interface EntryItemForm extends EntryItem {
  id: string; // ID temporário para gerenciar a lista
  product?: Product;
  variant_color?: string | null;
  variant_size?: string | null;
}

export default function AddStockEntryScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const brandingColors = useBrandingColors();

  const headerOpacity = useSharedValue(0);
  const headerScale = useSharedValue(0.94);
  const contentOpacity = useSharedValue(0);
  const contentTranslateY = useSharedValue(24);

  useFocusEffect(
    useCallback(() => {
      headerOpacity.value = 0;
      headerScale.value = 0.94;
      contentOpacity.value = 0;
      contentTranslateY.value = 24;

      headerOpacity.value = withTiming(1, {
        duration: 360,
        easing: Easing.out(Easing.quad),
      });
      headerScale.value = withSpring(1, { damping: 16, stiffness: 210 });

      const timer = setTimeout(() => {
        contentOpacity.value = withTiming(1, { duration: 320 });
        contentTranslateY.value = withSpring(0, { damping: 18, stiffness: 200 });
      }, 140);

      return () => clearTimeout(timer);
    }, [contentOpacity, contentTranslateY, headerOpacity, headerScale])
  );

  const headerAnimStyle = useAnimatedStyle(() => ({
    opacity: headerOpacity.value,
    transform: [{ scale: headerScale.value }],
  }));

  const contentAnimStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ translateY: contentTranslateY.value }],
  }));

  // Ler parâmetros da navegação (produto pré-selecionado do catálogo + viagem criada)
  const params = useLocalSearchParams<{
    // Legacy params (for backwards compatibility)
    preselectedProductId?: string;
    preselectedProductName?: string;
    preselectedQuantity?: string;
    preselectedPrice?: string;
    // New params (full product data from catalog)
    preselectedProductData?: string;
    fromCatalog?: string;
    fromAIScanner?: string; // ✨ Novo: indica que veio do AI Scanner
    // Wizard params (para retorno ao wizard após criar entrada)
    fromWizard?: string;
    wizardMode?: string; // 'atomic' | 'atomic-variants'
    wizardProductData?: string; // ✨ Novo: dados do produto não-criado (para modo atômico)
    wizardProductId?: string;
    wizardProductName?: string;
    wizardAtomicVariantsData?: string; // ✨ Novo: dados produto+variantes para modo atomic-variants
    // Wizard variant params (produtos com variantes)
    preselectedVariantsData?: string;
    // Trip params
    newTripId?: string;
    newTripCode?: string;
  }>();

  const isFromWizard = params.fromWizard === 'true';

  const buildWizardRestorePayload = (): string | null => {
    if (params.preselectedProductData) {
      return params.preselectedProductData;
    }

    if (!params.wizardProductData) {
      return null;
    }

    try {
      const raw = JSON.parse(params.wizardProductData);
      return JSON.stringify({
        name: raw.product_name,
        sku: raw.product_sku,
        barcode: raw.product_barcode,
        description: raw.product_description,
        brand: raw.product_brand,
        color: raw.product_color,
        size: raw.product_size,
        category_id: raw.product_category_id,
        cost_price: raw.product_cost_price,
        price: raw.product_price,
      });
    } catch {
      return null;
    }
  };

  const goToWizardStep = (targetStep: WizardStep) => {
    if (!isFromWizard) return;

    const restoreRaw = buildWizardRestorePayload();
    router.replace({
      pathname: '/products/wizard',
      params: {
        restoreStep: targetStep,
        ...(restoreRaw ? { restoreProductData: restoreRaw } : {}),
      },
    } as any);
  };

  const handleWizardStepPress = (targetStep: WizardStep) => {
    if (targetStep === 'entry') return;
    if (targetStep === 'complete') return;
    goToWizardStep(targetStep);
  };

  const getWizardBlockedReason = (targetStep: WizardStep): string | null => {
    if (targetStep === 'complete') {
      return 'Finalize a entrada para liberar o resumo.';
    }
    return null;
  };

  // Estados do formulário
  const [selectedType, setSelectedType] = useState<EntryType>(EntryType.LOCAL);
  const [entryCode, setEntryCode] = useState('');
  const [tripId, setTripId] = useState<number | undefined>();
  const [supplierName, setSupplierName] = useState('');
  const [supplierCnpj, setSupplierCnpj] = useState('');
  const [supplierContact, setSupplierContact] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<EntryItemForm[]>([]);
  const [itemCosts, setItemCosts] = useState<Record<string, string>>({});
  const [itemPrices, setItemPrices] = useState<Record<string, string>>({});

  // Estados de UI
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [tripMenuVisible, setTripMenuVisible] = useState(false);
  const [productMenuVisible, setProductMenuVisible] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [selectedItemIndex, setSelectedItemIndex] = useState<number | null>(null);
  const [showCreateTripDialog, setShowCreateTripDialog] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [createdEntryCode, setCreatedEntryCode] = useState<string | undefined>();
  const [createdEntryId, setCreatedEntryId] = useState<number | undefined>();
  const [codeValidationStatus, setCodeValidationStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle');
  const [cnpjValidationStatus, setCnpjValidationStatus] = useState<'idle' | 'valid' | 'invalid'>('idle');
  const codeCheckTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const preselectedProductAddedRef = useRef(false); // Previne adição dupla do produto pré-selecionado
  const [showTripLinkedDialog, setShowTripLinkedDialog] = useState(false);
  const [linkedTripInfo, setLinkedTripInfo] = useState<{ code: string; destination: string } | null>(null);
  const [showDeleteItemDialog, setShowDeleteItemDialog] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<number | null>(null);
  const [isFromAIScanner, setIsFromAIScanner] = useState(false); // ✨ Novo: flag para UX especial

  // Queries
  const { data: trips = [], refetch: refetchTrips } = useTrips({ status: undefined, limit: 100 });
  const { data: products = [], isLoading: isLoadingProducts } = useProducts({ limit: 100 });

  // Fetch catalog products for the modal
  const { data: catalogProducts = [], isLoading: isLoadingCatalog } = useQuery({
    queryKey: ['catalog-products-for-entry'],
    queryFn: () => getCatalogProducts({ limit: 200 }),
  });

  // Combine active products and catalog products for the modal
  // Mark catalog products with is_catalog flag
  const allAvailableProducts = [
    ...products,
    ...catalogProducts
      .filter(cp => !products.some(p => p.sku === cp.sku)) // Avoid duplicates
      .map(cp => ({ ...cp, is_catalog: true } as Product)),
  ];

  // Flag to show catalog option when no active products
  const showCatalogHint = !isLoadingProducts && products.length === 0;

  // Force refetch trips when returning from trip creation
  useEffect(() => {
    if (params.newTripId) {
      // Refetch trips to ensure the new trip is in the list
      refetchTrips();
    }
  }, [params.newTripId, refetchTrips]);

  /**
   * Detectar se veio do AI Scanner para UX especial
   */
  useEffect(() => {
    if (params.fromAIScanner === 'true') {
      setIsFromAIScanner(true);
      console.log('✨ Entrada de estoque iniciada do AI Scanner - FIFO obrigatório');
    }
  }, [params.fromAIScanner]);

  /**
   * Pré-adicionar produto do catálogo (se veio dos parâmetros)
   * Usa ref para prevenir adição dupla em caso de re-render
   */
  useEffect(() => {
    // Skip if already processed or has items
    if (preselectedProductAddedRef.current) return;
    if (items.length > 0) return;

    // ── MODO ATÔMICO-VARIANTES: produto + variantes + entrada numa transação ──
    if (params.wizardMode === 'atomic-variants' && params.wizardAtomicVariantsData) {
      try {
        const atomicData = JSON.parse(params.wizardAtomicVariantsData) as {
          product_name: string;
          product_barcode?: string;
          product_description?: string;
          product_brand?: string;
          product_category_id: number;
          base_price: number;
          variants: Array<{
            sku: string;
            color?: string | null;
            size?: string | null;
            price: number;
            cost_price?: number;
            quantity: number;
          }>;
        };

        preselectedProductAddedRef.current = true;

        const newItems: EntryItemForm[] = [];
        const newCosts: Record<string, string> = {};
        const newPrices: Record<string, string> = {};

        atomicData.variants.forEach((v, idx) => {
          const itemId = (Date.now() + idx).toString();

          const virtualProduct: Product = {
            id: 0, // Produto ainda não existe (será criado atomicamente)
            name: atomicData.product_name,
            sku: v.sku,
            cost_price: v.cost_price ?? 0,
            price: v.price,
            color: v.color ?? undefined,
            size: v.size ?? undefined,
            is_active: true,
            is_catalog: true,
            // Metadados para identificar o modo
            _atomicVariantsMode: true,
          } as any;

          const newItem: EntryItemForm = {
            id: itemId,
            product_id: 0,
            variant_id: undefined,
            quantity_received: v.quantity,
            unit_cost: v.cost_price ?? 0,
            notes: '',
            product: virtualProduct,
            variant_color: v.color ?? undefined,
            variant_size: v.size ?? undefined,
          };

          newItems.push(newItem);
          newCosts[itemId] = formatCostInput(Math.round((v.cost_price ?? 0) * 100).toString());
          newPrices[itemId] = formatCostInput(Math.round(v.price * 100).toString());
        });

        setItems(newItems);
        setItemCosts(newCosts);
        setItemPrices(newPrices);
        return;
      } catch (e) {
        console.error('Error parsing wizardAtomicVariantsData:', e);
      }
    }

    // Wizard com variantes: pré-adicionar múltiplos itens (um por variante)
    if (params.preselectedVariantsData && params.fromWizard === 'true') {
      try {
        const variantsPayload: Array<{
          variant_id: number;
          product_id: number;
          name: string;
          sku: string;
          color: string | null;
          size: string | null;
          quantity: number;
          cost_price: number;
          price: number;
        }> = JSON.parse(params.preselectedVariantsData);

        preselectedProductAddedRef.current = true;

        const newItems: EntryItemForm[] = [];
        const newCosts: Record<string, string> = {};
        const newPrices: Record<string, string> = {};

        variantsPayload.forEach((v, idx) => {
          const itemId = (Date.now() + idx).toString();

          const virtualProduct: Product = {
            id: v.product_id,
            name: v.name,
            sku: v.sku,
            cost_price: v.cost_price,
            price: v.price,
            color: v.color || undefined,
            size: v.size || undefined,
            is_active: true,
          } as Product;

          const newItem: EntryItemForm = {
            id: itemId,
            product_id: v.product_id,
            variant_id: v.variant_id,
            quantity_received: v.quantity,
            unit_cost: v.cost_price,
            notes: '',
            product: virtualProduct,
            variant_color: v.color,
            variant_size: v.size,
          };

          newItems.push(newItem);
          newCosts[itemId] = formatCostInput(Math.round(v.cost_price * 100).toString());
          newPrices[itemId] = formatCostInput(Math.round(v.price * 100).toString());
        });

        setItems(newItems);
        setItemCosts(newCosts);
        setItemPrices(newPrices);
        return;
      } catch (e) {
        console.error('Error parsing preselectedVariantsData:', e);
      }
    }

    // New flow: full product data from catalog or wizard
    // Em modo atômico, os dados chegam em wizardProductData (não em preselectedProductData)
    if ((params.preselectedProductData || params.wizardProductData) && (params.fromCatalog === 'true' || params.fromWizard === 'true')) {
      try {
        const serializedProductData =
          params.wizardMode === 'atomic' && params.wizardProductData
            ? params.wizardProductData
            : params.preselectedProductData;

        if (!serializedProductData) {
          return;
        }

        const productData = JSON.parse(serializedProductData);
        logInfo('Entries/Add', 'Produto parseado', { id: productData.id, name: productData.name });
        
        // Modo ATÔMICO: produto ainda não foi criado (wizardMode='atomic')
        const isAtomicMode = params.wizardMode === 'atomic';
        const quantity = params.preselectedQuantity ? parseInt(params.preselectedQuantity) : 1;
        
        if (isAtomicMode) {
          logInfo('Entries/Add', 'Modo atômico ativo - produto será criado junto com entrada', {
            productName: productData.product_name,
            quantity,
          });
        }

        const price = productData.cost_price || productData.product_cost_price || 0;

        // Marcar como processado ANTES de adicionar para evitar race condition
        preselectedProductAddedRef.current = true;

        // Converter price para formato aceito por formatCostInput (números inteiros representando centavos)
        const priceInCents = Math.round(price * 100).toString();
        const costFormatted = formatCostInput(priceInCents);

        // Create a virtual product for the catalog item or atomic mode
        const catalogProduct: Product = {
          id: productData.id || 0, // Modo atômico usa id temporário
          name: productData.name || productData.product_name || '',
          sku: productData.sku || productData.product_sku || `CAT-${productData.id}`,
          cost_price: price,
          price: productData.price || productData.product_price || 0,
          is_active: true,
          is_catalog: true,
          // Metadados para modo atômico
          _atomicMode: isAtomicMode,
          _atomicData: isAtomicMode ? productData : undefined,
        } as any;

        const newItem: EntryItemForm = {
          id: Date.now().toString(),
          product_id: productData.id || 0,
          quantity_received: quantity,
          unit_cost: price,
          notes: '',
          product: catalogProduct,
        };

        // Formatar preço de venda
        const finalPrice = productData.price || productData.product_price || 0;
        const priceFormatted = formatCostInput(Math.round(finalPrice * 100).toString());

        setItems([newItem]);
        setItemCosts({ [newItem.id]: costFormatted });
        setItemPrices({ [newItem.id]: priceFormatted });
        return;
      } catch (e) {
        console.error('Error parsing preselectedProductData:', e);
      }
    }

    // Legacy flow: product ID lookup in active products
    if (params.preselectedProductId && products.length > 0) {
      const productId = parseInt(params.preselectedProductId);
      const product = products.find((p: Product) => p.id === productId);

      if (product) {
        // Marcar como processado ANTES de adicionar
        preselectedProductAddedRef.current = true;

        const quantity = params.preselectedQuantity ? parseInt(params.preselectedQuantity) : 1;
        const price = params.preselectedPrice ? parseFloat(params.preselectedPrice) : (product.cost_price || 0);

        // Converter price para formato aceito por formatCostInput (números inteiros representando centavos)
        const priceInCents = Math.round(price * 100).toString();
        const costFormatted = formatCostInput(priceInCents);

        const newItem: EntryItemForm = {
          id: Date.now().toString(),
          product_id: product.id,
          quantity_received: quantity,
          unit_cost: price,
          notes: '',
          product,
        };

        // Formatar preço de venda
        const sellPriceFormatted = formatCostInput(Math.round((product.price || 0) * 100).toString());

        setItems([newItem]);
        setItemCosts({ [newItem.id]: costFormatted });
        setItemPrices({ [newItem.id]: sellPriceFormatted });
      }
    }
  }, [params.preselectedVariantsData, params.wizardAtomicVariantsData, params.wizardMode, params.wizardProductData, params.preselectedProductData, params.preselectedProductId, params.fromCatalog, params.fromWizard, products]);

  /**
   * Auto-selecionar viagem recém-criada (quando volta de /trips/add)
   */
  useEffect(() => {
    if (params.newTripId) {
      const newTripIdNum = parseInt(params.newTripId);

      // Always set trip type and ID immediately
      setSelectedType(EntryType.TRIP);
      setTripId(newTripIdNum);

      // Try to find trip in list for full info
      const trip = trips.find((t) => t.id === newTripIdNum);

      if (trip) {
        // Show feedback with full trip info
        setLinkedTripInfo({ code: trip.trip_code, destination: trip.destination });
        setShowTripLinkedDialog(true);
      } else if (params.newTripCode && !showTripLinkedDialog) {
        // Trip not in list yet, use params data for feedback
        setLinkedTripInfo({ code: params.newTripCode, destination: 'Carregando...' });
        setShowTripLinkedDialog(true);
      }
    }
  }, [params.newTripId, params.newTripCode, trips]);

  /**
   * Validar CNPJ em tempo real
   */
  useEffect(() => {
    if (!supplierCnpj.trim()) {
      setCnpjValidationStatus('idle');
      return;
    }

    const cleanCNPJ = supplierCnpj.replace(/\D/g, '');
    const isValid = cleanCNPJ.length === 14 || cleanCNPJ.length === 0;
    setCnpjValidationStatus(isValid ? 'valid' : 'invalid');
  }, [supplierCnpj]);

  /**
   * Validar código de entrada em tempo real (com debounce)
   */
  useEffect(() => {
    // Limpar timeout anterior
    if (codeCheckTimeoutRef.current) {
      clearTimeout(codeCheckTimeoutRef.current);
    }

    // Resetar se campo estiver vazio
    if (!entryCode.trim()) {
      setCodeValidationStatus('idle');
      return;
    }

    // Validar tamanho mínimo
    if (entryCode.trim().length < 5) {
      setCodeValidationStatus('idle');
      return;
    }

    // Iniciar validação após 500ms de inatividade
    setCodeValidationStatus('checking');
    codeCheckTimeoutRef.current = setTimeout(async () => {
      try {
        const result = await checkEntryCode(entryCode.trim());
        setCodeValidationStatus(result.exists ? 'invalid' : 'valid');
      } catch (error) {
        // Em caso de erro, assumir que está válido para não bloquear o usuário
        setCodeValidationStatus('valid');
      }
    }, 500);

    // Cleanup
    return () => {
      if (codeCheckTimeoutRef.current) {
        clearTimeout(codeCheckTimeoutRef.current);
      }
    };
  }, [entryCode]);

  /**
   * Filtrar produtos por busca (inclui catálogo e ativos)
   */
  const filteredProducts = allAvailableProducts.filter((p: Product) =>
    p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
    (p.sku && p.sku.toLowerCase().includes(productSearch.toLowerCase()))
  );

  /**
   * Mutation para criar entrada (modo tradicional)
   */
  const createMutation = useMutation({
    mutationFn: createStockEntry,
    onSuccess: (createdEntry) => {
      invalidateAndShowSuccess(createdEntry);
    },
    onError: (error: any) => {
      const errorMessage = error.message || 'Erro ao criar entrada';
      Alert.alert('Erro', errorMessage);
    },
  });

  /**
   * Mutation para criar entrada com NOVO produto (modo atômico)
   */
  const createAtomicMutation = useMutation({
    mutationFn: async () => {
      // Extrair dados do produto e quantidade do item
      const item = items[0];
      if (!item.product || !(item.product as any)._atomicData) {
        throw new Error('Dados do produto não encontrados para modo atômico');
      }

      const productData = (item.product as any)._atomicData;
      const quantity = item.quantity_received;

      return createStockEntryWithNewProduct(
        productData,
        {
          entry_code: entryCode.trim(),
          entry_date: computeEntryDateISO(),
          entry_type: selectedType as 'trip' | 'online' | 'local',
          trip_id: selectedType === EntryType.TRIP ? tripId : undefined,
          supplier_name: supplierName.trim(),
          supplier_cnpj: supplierCnpj.trim() || undefined,
          supplier_contact: supplierContact.trim() || undefined,
          invoice_number: invoiceNumber.trim() || undefined,
          payment_method: paymentMethod.trim() || undefined,
          notes: notes.trim() || undefined,
        },
        quantity
      );
    },
    onSuccess: (createdEntry) => {
      invalidateAndShowSuccess(createdEntry);
    },
    onError: (error: any) => {
      const errorMessage = error.message || 'Erro ao criar entrada com novo produto';
      Alert.alert('Erro', errorMessage);
    },
  });

  /**
   * Mutation para criar entrada com NOVO produto com VARIANTES (modo atomic-variants)
   * Chama POST /stock-entries/with-new-product-variants — transação atômica total.
   */
  const createAtomicVariantsMutation = useMutation({
    mutationFn: async () => {
      if (items.length === 0) {
        throw new Error('Nenhuma variante informada');
      }

      // Reconstruir payload de variantes a partir dos itens (usuario pode ter editado qtds/custos)
      const atomicData = JSON.parse(params.wizardAtomicVariantsData!) as {
        product_name: string;
        product_barcode?: string;
        product_description?: string;
        product_brand?: string;
        product_category_id: number;
        base_price: number;
        variants: Array<{ sku: string; color?: string | null; size?: string | null; price: number; cost_price?: number; quantity: number }>;
      };

      // Substituir quantities e costs pelos valores atuais do formulário
      const variantsWithCurrentData = atomicData.variants.map((v, idx) => {
        const item = items[idx];
        if (!item) return { ...v, quantity: 0 };
        return {
          sku: item.product?.sku || v.sku,
          color: item.variant_color ?? v.color ?? null,
          size: item.variant_size ?? v.size ?? null,
          price: item.product?.price ?? v.price,
          cost_price: item.unit_cost ?? v.cost_price,
          quantity: item.quantity_received,
        };
      }).filter(v => v.quantity > 0);

      if (variantsWithCurrentData.length === 0) {
        throw new Error('Informe ao menos uma variante com quantidade > 0');
      }

      return createStockEntryWithNewProductVariants(
        { ...atomicData, variants: variantsWithCurrentData },
        {
          entry_code: entryCode.trim(),
          entry_date: computeEntryDateISO(),
          entry_type: selectedType,
          trip_id: selectedType === EntryType.TRIP ? tripId : undefined,
          supplier_name: supplierName.trim(),
          supplier_cnpj: supplierCnpj.trim() || undefined,
          supplier_contact: supplierContact.trim() || undefined,
          invoice_number: invoiceNumber.trim() || undefined,
          payment_method: paymentMethod.trim() || undefined,
          notes: notes.trim() || undefined,
        }
      );
    },
    onSuccess: (createdEntry) => {
      invalidateAndShowSuccess(createdEntry);
    },
    onError: (error: any) => {
      const errorMessage = error.message || 'Erro ao criar produto com variantes e entrada';
      Alert.alert('Erro', errorMessage);
    },
  });

  /**
   * Invalidar queries e mostrar sucesso
   */
  const invalidateAndShowSuccess = (createdEntry: any) => {
    // Invalidate stock entries queries
    queryClient.invalidateQueries({ queryKey: ['stock-entries'] });
    queryClient.invalidateQueries({ queryKey: ['stock-entries-stats'] });
    queryClient.invalidateQueries({ queryKey: ['trips'] });
    queryClient.invalidateQueries({ queryKey: ['products'] });
    queryClient.invalidateQueries({ queryKey: ['grouped-products'] });
    queryClient.invalidateQueries({ queryKey: ['grouped-products-modal'] });
    queryClient.invalidateQueries({ queryKey: ['active-products'] });
    queryClient.invalidateQueries({ queryKey: ['low-stock'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    queryClient.invalidateQueries({ queryKey: ['inventory-valuation'] });
    queryClient.invalidateQueries({ queryKey: ['period-purchases'] });

    setCreatedEntryCode(createdEntry.entry_code);
    setCreatedEntryId(createdEntry.id);
    setShowSuccessDialog(true);
  };

  /**
   * Formatar custo unitário (formato brasileiro)
   */
  const formatCostInput = (text: string): string => {
    const numbers = text.replace(/[^0-9]/g, '');
    if (numbers.length === 0) return '0,00';
    const value = parseInt(numbers) / 100;
    return value.toFixed(2).replace('.', ',');
  };

  /**
   * Converter custo formatado para número
   */
  const parseCost = (value: string): number => {
    if (!value) return 0;
    const cleaned = value.replace(/[^\d,]/g, '').replace(',', '.');
    return parseFloat(cleaned) || 0;
  };

  /**
   * Adicionar produto à lista (suporta catálogo e ativos)
   */
  const handleAddProduct = (product: Product) => {
    // Check if this product is already in the list
    const alreadyAdded = items.some(item => item.product_id === product.id);
    if (alreadyAdded) {
      Alert.alert('Atenção', 'Este produto já foi adicionado à entrada.');
      return;
    }

    const costFormatted = formatCostInput(Math.round((product.cost_price || 0) * 100).toString());
    const priceFormatted = formatCostInput(Math.round((product.price || 0) * 100).toString());

    console.log('🔍 ADD PRODUCT DEBUG:', {
      product_name: product.name,
      product_price: product.price,
      priceFormatted,
      costFormatted
    });

    // Mark catalog products appropriately
    const productWithFlag = product.is_catalog
      ? { ...product, is_catalog: true }
      : product;

    const newItem: EntryItemForm = {
      id: Date.now().toString(),
      product_id: product.id,
      quantity_received: 1,
      unit_cost: product.cost_price || 0,
      notes: '',
      product: productWithFlag,
    };

    console.log('🔍 NEW ITEM:', {
      item_id: newItem.id,
      product_price_in_item: newItem.product?.price
    });

    setItems([...items, newItem]);
    setItemCosts({ ...itemCosts, [newItem.id]: costFormatted });
    setItemPrices({ ...itemPrices, [newItem.id]: priceFormatted });
    
    console.log('🔍 ITEM PRICES AFTER SET:', { ...itemPrices, [newItem.id]: priceFormatted });
    
    setProductMenuVisible(false);
    setProductSearch('');
  };

  /**
   * Atualizar item da lista
   */
  const handleUpdateItem = (index: number, field: keyof EntryItemForm, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  /**
   * Atualizar custo do item
   */
  const handleUpdateItemCost = (itemId: string, index: number, formattedValue: string) => {
    const numericValue = parseCost(formattedValue);
    setItemCosts({ ...itemCosts, [itemId]: formattedValue });
    handleUpdateItem(index, 'unit_cost', numericValue);
  };

  /**
   * Atualizar preço de venda do item
   */
  const handleUpdateItemPrice = (itemId: string, index: number, formattedValue: string) => {
    const numericValue = parseCost(formattedValue);
    setItemPrices({ ...itemPrices, [itemId]: formattedValue });
    
    // Atualizar o preço de venda no produto do item
    const newItems = [...items];
    if (newItems[index].product) {
      newItems[index].product = {
        ...newItems[index].product!,
        price: numericValue,
      };
      setItems(newItems);
    }
  };

  /**
   * Remover item da lista
   */
  const handleRemoveItem = (index: number) => {
    setItemToDelete(index);
    setShowDeleteItemDialog(true);
  };

  /**
   * Confirmar remoção do item
   */
  const confirmRemoveItem = () => {
    if (itemToDelete !== null) {
      const newItems = items.filter((_, i) => i !== itemToDelete);
      setItems(newItems);
      setItemToDelete(null);
    }
    setShowDeleteItemDialog(false);
  };

  /**
   * Calcular total da entrada
   */
  const calculateTotal = (): number => {
    return items.reduce((sum, item) => {
      const quantity = Number(item.quantity_received) || 0;
      const cost = Number(item.unit_cost) || 0;
      return sum + (quantity * cost);
    }, 0);
  };

  /**
   * Validar formulário
   */
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!entryCode.trim()) {
      newErrors.entryCode = 'Código da entrada é obrigatório';
    }

    if (entryCode.trim().length < 5) {
      newErrors.entryCode = 'Código deve ter no mínimo 5 caracteres';
    }

    if (!supplierName.trim()) {
      newErrors.supplierName = 'Fornecedor é obrigatório';
    }

    // Validar CNPJ se preenchido
    if (supplierCnpj.trim()) {
      const cleanCNPJ = supplierCnpj.replace(/\D/g, '');
      if (cleanCNPJ.length !== 14) {
        newErrors.supplierCnpj = 'CNPJ deve ter 14 dígitos';
      }
    }

    if (selectedType === EntryType.TRIP && !tripId) {
      newErrors.tripId = 'Selecione uma viagem';
    }

    // Validar cada item
    items.forEach((item, index) => {
      if (item.quantity_received <= 0) {
        newErrors[`item_${index}_quantity`] = 'Quantidade inválida';
      }
      if (item.unit_cost < 0) {
        newErrors[`item_${index}_cost`] = 'Custo inválido';
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  /** Calcular data da entrada (auto)
   * - Viagem: usa data de retorno (se existir) ou data da viagem
   * - Outros tipos: hoje
   */
  const computeEntryDateISO = (): string => {
    if (selectedType === EntryType.TRIP && tripId) {
      const trip = trips.find((t) => t.id === tripId);
      if (trip) {
        const baseDate = trip.return_time ? new Date(trip.return_time) : new Date(trip.trip_date);
        // Usar data local em vez de UTC
        const year = baseDate.getFullYear();
        const month = String(baseDate.getMonth() + 1).padStart(2, '0');
        const day = String(baseDate.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      }
    }
    // Usar data local em vez de UTC
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  /**
   * Submeter formulário
   */
  const handleSubmit = async () => {
    if (!validate()) {
      Alert.alert('Atenção', 'Preencha todos os campos obrigatórios');
      return;
    }

    // Modo ATÔMICO-VARIANTES: novo produto + variantes + entrada em uma transação
    const isAtomicVariantsMode = params.wizardMode === 'atomic-variants';
    if (isAtomicVariantsMode) {
      createAtomicVariantsMutation.mutate();
      return;
    }

    // Modo ATÔMICO: produto será criado junto com entrada
    const isAtomicMode = items.length > 0 && (items[0].product as any)?._atomicMode;
    
    if (isAtomicMode) {
      // Validação específica para modo atômico
      if (items.length !== 1) {
        Alert.alert('Atenção', 'Modo atômico: apenas um produto permitido');
        return;
      }
      createAtomicMutation.mutate();
      return;
    }

    // Modo TRADICIONAL + catálogo: ativar templates no tenant antes de criar entrada.
    let normalizedItems = items;
    const catalogItems = items.filter((item) => item.product?.is_catalog);

    if (catalogItems.length > 0) {
      try {
        const activationCache = new Map<number, Product>();

        normalizedItems = await Promise.all(
          items.map(async (item) => {
            if (!item.product?.is_catalog) return item;

            const catalogId = item.product_id;
            let activated = activationCache.get(catalogId);

            if (!activated) {
              activated = await activateCatalogProduct(catalogId, item.product.price);
              activationCache.set(catalogId, activated);
            }

            return {
              ...item,
              product_id: activated.id,
              product: {
                ...item.product,
                ...activated,
                is_catalog: false,
              },
            };
          })
        );
      } catch (error: any) {
        Alert.alert(
          'Erro ao ativar produto do catálogo',
          error?.response?.data?.detail || 'Não foi possível ativar o produto para sua loja.'
        );
        return;
      }
    }

    // Modo TRADICIONAL: usar endpoint normal
    const entryData: StockEntryCreate = {
      entry_code: entryCode.trim(),
      entry_date: computeEntryDateISO(),
      entry_type: selectedType,
      trip_id: selectedType === EntryType.TRIP ? tripId : undefined,
      supplier_name: supplierName.trim(),
      supplier_cnpj: supplierCnpj.trim() || undefined,
      supplier_contact: supplierContact.trim() || undefined,
      invoice_number: invoiceNumber.trim() || undefined,
      payment_method: paymentMethod.trim() || undefined,
      notes: notes.trim() || undefined,
      items: normalizedItems.map(item => ({
        product_id: item.product_id,
        variant_id: item.variant_id ?? undefined,
        quantity_received: item.quantity_received,
        unit_cost: item.unit_cost,
        selling_price: item.product?.price || undefined,
        notes: item.notes || undefined,
      })),
    };

    createMutation.mutate(entryData);
  };

  const total = calculateTotal();
  const selectedTrip = trips.find(t => t.id === tripId);

  /**
   * Agrupar itens por product_id para exibir variantes dentro do card do produto
   */
  const getGroupedItems = () => {
    const orderMap = new Map<number | string, number[]>();
    const order: (number | string)[] = [];

    items.forEach((item, index) => {
      const key = item.product_id !== undefined ? item.product_id : item.id;
      if (!orderMap.has(key)) {
        orderMap.set(key, []);
        order.push(key);
      }
      orderMap.get(key)!.push(index);
    });

    return order.map(key => ({ key, indices: orderMap.get(key)! }));
  };

  /**
   * Renderizar linha de variante dentro do card agrupado
   */
  const renderVariantRow = (index: number, showDivider: boolean) => {
    const item = items[index];
    const variantColor = item.variant_color || item.product?.color;
    const variantSize = item.variant_size || item.product?.size;
    return (
      <View key={item.id}>
        {showDivider && <View style={styles.variantDivider} />}
        <View style={styles.variantRowHeader}>
          <View style={styles.variantChipsRow}>
            {variantSize && (
              <View style={styles.variantChipSize}>
                <Text style={styles.variantChipText}>{variantSize}</Text>
              </View>
            )}
            {variantColor && (
              <View style={styles.variantChipColor}>
                <Text style={styles.variantChipText}>{variantColor}</Text>
              </View>
            )}
            {item.product?.sku && (
              <Text style={styles.variantSkuText}>{item.product.sku}</Text>
            )}
          </View>
          <IconButton
            icon="close"
            size={16}
            onPress={() => handleRemoveItem(index)}
            style={styles.variantRemoveBtn}
          />
        </View>
        <View style={styles.itemRow}>
          <View style={styles.itemInput}>
            <TextInput
              label="Qtd"
              value={item.quantity_received.toString()}
              onChangeText={(text) => handleUpdateItem(index, 'quantity_received', parseInt(text) || 0)}
              keyboardType="numeric"
              mode="outlined"
              dense
              error={!!errors[`item_${index}_quantity`]}
            />
          </View>
          <View style={styles.itemInput}>
            <TextInput
              label="Custo (R$)"
              value={itemCosts[item.id] || '0,00'}
              onChangeText={(text) => handleUpdateItemCost(item.id, index, formatCostInput(text))}
              keyboardType="decimal-pad"
              mode="outlined"
              dense
            />
          </View>
        </View>
        <View style={styles.itemRow}>
          <View style={styles.itemInputFull}>
            <TextInput
              label="Venda (R$)"
              value={itemPrices[item.id] || '0,00'}
              onChangeText={(text) => handleUpdateItemPrice(item.id, index, formatCostInput(text))}
              keyboardType="decimal-pad"
              mode="outlined"
              dense
              right={
                parseCost(itemPrices[item.id] || '0') < parseCost(itemCosts[item.id] || '0') ? (
                      <TextInput.Icon icon="alert" color={Colors.light.warning} />
                ) : undefined
              }
            />
            {parseCost(itemPrices[item.id] || '0') < parseCost(itemCosts[item.id] || '0') && (
              <Text style={styles.warningText}>⚠️ Preço menor que o custo</Text>
            )}
          </View>
        </View>
      </View>
    );
  };

  /**
   * Renderizar card de produto (simples ou agrupado com variantes)
   */
  const renderProductGroupCard = (key: number | string, indices: number[]) => {
    const firstItem = items[indices[0]];
    const baseName = firstItem.product?.name || `Produto #${firstItem.product_id}`;
    const isMultiVariant = indices.length > 1;
    const hasVariantInfo = !!(
      firstItem.variant_id ||
      firstItem.variant_color ||
      firstItem.variant_size ||
      firstItem.product?.color ||
      firstItem.product?.size
    );

    if (!isMultiVariant && !hasVariantInfo) {
      // Card simples (sem variantes)
      const item = firstItem;
      const index = indices[0];
      return (
        <View key={String(key)} style={styles.itemCard}>
            <View style={styles.itemHeader}>
              <Text style={styles.itemName}>{baseName}</Text>
              <IconButton icon="close" size={20} onPress={() => handleRemoveItem(index)} />
            </View>
            <View style={styles.itemRow}>
              <View style={styles.itemInput}>
                <TextInput
                  label="Quantidade"
                  value={item.quantity_received.toString()}
                  onChangeText={(text) => handleUpdateItem(index, 'quantity_received', parseInt(text) || 0)}
                  keyboardType="numeric"
                  mode="outlined"
                  dense
                  error={!!errors[`item_${index}_quantity`]}
                />
              </View>
              <View style={styles.itemInput}>
                <TextInput
                  label="Custo Unit. (R$)"
                  value={itemCosts[item.id] || '0,00'}
                  onChangeText={(text) => handleUpdateItemCost(item.id, index, formatCostInput(text))}
                  keyboardType="decimal-pad"
                  mode="outlined"
                  dense
                  error={!!errors[`item_${index}_cost`]}
                />
              </View>
            </View>
            <View style={styles.itemRow}>
              <View style={styles.itemInputFull}>
                <TextInput
                  label="Preço Venda (R$)"
                  value={itemPrices[item.id] || '0,00'}
                  onChangeText={(text) => handleUpdateItemPrice(item.id, index, formatCostInput(text))}
                  keyboardType="decimal-pad"
                  mode="outlined"
                  dense
                  right={
                    parseCost(itemPrices[item.id] || '0') < parseCost(itemCosts[item.id] || '0') ? (
                      <TextInput.Icon icon="alert" color={Colors.light.warning} />
                    ) : undefined
                  }
                />
                {parseCost(itemPrices[item.id] || '0') < parseCost(itemCosts[item.id] || '0') && (
                  <Text style={styles.warningText}>⚠️ Preço menor que o custo</Text>
                )}
              </View>
            </View>
            <View style={styles.itemTotal}>
              <Text style={styles.itemTotalLabel}>Subtotal:</Text>
              <Text style={[styles.itemTotalValue, { color: brandingColors.primary }] }>
                {formatCurrency((Number(item.quantity_received) || 0) * (Number(item.unit_cost) || 0))}
              </Text>
            </View>
        </View>
      );
    }

    // Card com variante(s)
    const subtotal = indices.reduce((sum, idx) => {
      const it = items[idx];
      return sum + (Number(it.quantity_received) || 0) * (Number(it.unit_cost) || 0);
    }, 0);

    return (
      <View key={String(key)} style={styles.itemCard}>
          <View style={styles.variantGroupHeader}>
            <View style={[styles.variantGroupIcon, { backgroundColor: `${brandingColors.primary}14` }]}>
              <Ionicons name="layers-outline" size={16} color={brandingColors.primary} />
            </View>
            <Text style={[styles.itemName, { flex: 1 }]} numberOfLines={1}>{baseName}</Text>
            {indices.length > 1 && (
              <View style={[styles.variantCountBadge, { backgroundColor: brandingColors.primary }]}>
                <Text style={styles.variantCountText}>{indices.length} var.</Text>
              </View>
            )}
          </View>
          {indices.map((idx, i) => renderVariantRow(idx, i > 0))}
          <View style={[styles.itemTotal, { marginTop: 12 }]}>
            <Text style={styles.itemTotalLabel}>Subtotal:</Text>
            <Text style={[styles.itemTotalValue, { color: brandingColors.primary }]}>{formatCurrency(subtotal)}</Text>
          </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Animated.View style={headerAnimStyle}>
        <PageHeader
          title="Nova Entrada"
          subtitle="Preencha os dados para cadastrar nova entrada de estoque"
          showBackButton
          onBack={() => {
            if (isFromWizard) {
              // Volta para o passo de entrada preservando contexto completo.
              goToWizardStep('entry');
              return;
            }
            router.push('/(tabs)/entries');
          }}
        />
      </Animated.View>

      {/* Banner de contexto quando vem do Wizard */}
      {isFromWizard && (
        <View style={[
          styles.wizardBanner,
          {
            backgroundColor: `${brandingColors.primary}10`,
            borderBottomColor: `${brandingColors.primary}20`,
          },
        ]}>
          <View style={styles.wizardBannerHeaderRow}>
            <Ionicons name="cube" size={20} color={brandingColors.primary} />
            <View style={styles.wizardBannerText}>
              <Text style={styles.wizardBannerTitle}>
                Finalizando cadastro de produto
              </Text>
              <Text style={styles.wizardBannerSubtitle}>
                {params.wizardProductName || 'Produto'}
              </Text>
            </View>
          </View>
          <WizardStepper
            currentStep="entry"
            compact
            onStepPress={handleWizardStepPress}
            getBlockedReason={getWizardBlockedReason}
          />
        </View>
      )}

      <Animated.View style={[styles.content, contentAnimStyle]}>
        <KeyboardAwareScreen
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          bottomPadding={theme.spacing.xxl}
        >
        {/* Tipo de Entrada */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tipo de Entrada</Text>
          <View style={styles.typeButtons}>
            <TouchableOpacity
              style={[
                styles.typeButton,
                selectedType === EntryType.TRIP && {
                  borderColor: brandingColors.primary,
                  backgroundColor: `${brandingColors.primary}14`,
                },
              ]}
              activeOpacity={0.78}
              onPress={() => setSelectedType(EntryType.TRIP)}
            >
              <Ionicons
                name="car-outline"
                size={18}
                color={selectedType === EntryType.TRIP ? brandingColors.primary : Colors.light.textSecondary}
              />
              <Text style={[
                styles.typeButtonText,
                selectedType === EntryType.TRIP && { color: brandingColors.primary },
              ]}>
                Viagem
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.typeButton,
                selectedType === EntryType.ONLINE && {
                  borderColor: brandingColors.primary,
                  backgroundColor: `${brandingColors.primary}14`,
                },
              ]}
              activeOpacity={0.78}
              onPress={() => setSelectedType(EntryType.ONLINE)}
            >
              <Ionicons
                name="cart-outline"
                size={18}
                color={selectedType === EntryType.ONLINE ? brandingColors.primary : Colors.light.textSecondary}
              />
              <Text style={[
                styles.typeButtonText,
                selectedType === EntryType.ONLINE && { color: brandingColors.primary },
              ]}>
                Online
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.typeButton,
                selectedType === EntryType.LOCAL && {
                  borderColor: brandingColors.primary,
                  backgroundColor: `${brandingColors.primary}14`,
                },
              ]}
              activeOpacity={0.78}
              onPress={() => setSelectedType(EntryType.LOCAL)}
            >
              <Ionicons
                name="storefront-outline"
                size={18}
                color={selectedType === EntryType.LOCAL ? brandingColors.primary : Colors.light.textSecondary}
              />
              <Text style={[
                styles.typeButtonText,
                selectedType === EntryType.LOCAL && { color: brandingColors.primary },
              ]}>
                Local
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Informações Básicas */}
        <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={[styles.cardHeaderIcon, { backgroundColor: `${brandingColors.primary}14` }]}>
                <Ionicons name="document-text-outline" size={20} color={brandingColors.primary} />
              </View>
              <Text style={styles.cardTitle}>Informações Básicas</Text>
            </View>
          
          <View style={styles.inputGroup}>
            <TextInput
              label="Código da Entrada *"
              value={entryCode}
              onChangeText={setEntryCode}
              mode="outlined"
              placeholder="Ex: ENTRADA-001 (mín. 5 caracteres)"
              maxLength={50}
              autoCapitalize="characters"
              error={!!errors.entryCode || codeValidationStatus === 'invalid'}
              right={
                codeValidationStatus === 'checking' ? (
                  <TextInput.Icon icon="clock-outline" />
                ) : codeValidationStatus === 'valid' ? (
                  <TextInput.Icon icon="check-circle" color={Colors.light.success} />
                ) : codeValidationStatus === 'invalid' ? (
                  <TextInput.Icon icon="close-circle" color={Colors.light.error} />
                ) : null
              }
            />
            {errors.entryCode && (
              <HelperText type="error" visible={!!errors.entryCode}>
                {errors.entryCode}
              </HelperText>
            )}
            {!errors.entryCode && codeValidationStatus === 'invalid' && (
              <HelperText type="error" visible={true}>
                Código já existe. Por favor, escolha outro código.
              </HelperText>
            )}
            {!errors.entryCode && codeValidationStatus === 'valid' && (
              <HelperText type="info" visible={true} style={{ color: Colors.light.success }}>
                Código disponível ✓
              </HelperText>
            )}
          </View>

          <View style={styles.inputGroup}>
            <TextInput
              label="Data da Entrada (auto)"
              value={computeEntryDateISO().split('-').reverse().join('/')}
              mode="outlined"
              editable={false}
              left={<TextInput.Icon icon="calendar" />}
            />
            <HelperText type="info">
              Calculada automaticamente
            </HelperText>
          </View>
        </View>

        {/* Seleção de Viagem (se tipo = TRIP) */}
        {selectedType === EntryType.TRIP && (
          <View style={styles.inputGroup}>
            <View style={styles.labelWithAction}>
              <Text style={styles.label}>Viagem *</Text>
              <TouchableOpacity
                onPress={() => {
                  setTripMenuVisible(false);
                  setShowCreateTripDialog(true);
                }}
                style={styles.addButton}
                activeOpacity={0.75}
              >
                <Ionicons name="add-circle" size={20} color={brandingColors.primary} />
                <Text style={[styles.addButtonText, { color: brandingColors.primary }]}>Nova Viagem</Text>
              </TouchableOpacity>
            </View>
            <Menu
              visible={tripMenuVisible}
              onDismiss={() => setTripMenuVisible(false)}
              anchor={
                <TouchableOpacity
                  style={[styles.selectButton, errors.tripId && styles.selectButtonError]}
                  onPress={() => {
                    if (!tripMenuVisible) {
                      setTripMenuVisible(true);
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.selectButtonText}>
                    {selectedTrip ? `${selectedTrip.trip_code} - ${selectedTrip.destination}` : 'Selecionar viagem'}
                  </Text>
                  <Ionicons name="chevron-down" size={20} color={Colors.light.textSecondary} />
                </TouchableOpacity>
              }
            >
              {trips.length === 0 ? (
                <Menu.Item
                  onPress={() => {
                    setTripMenuVisible(false);
                    setShowCreateTripDialog(true);
                  }}
                  title="➕ Criar Nova Viagem"
                  titleStyle={{ color: brandingColors.primary, fontWeight: '600' }}
                />
              ) : (
                <>
                  <Menu.Item
                    onPress={() => {
                      setTripMenuVisible(false);
                      setShowCreateTripDialog(true);
                    }}
                    title="➕ Criar Nova Viagem"
                    titleStyle={{ color: brandingColors.primary, fontWeight: '600' }}
                  />
                  <Divider />
                  {trips.map((trip) => (
                    <Menu.Item
                      key={trip.id}
                      onPress={() => {
                        setTripId(trip.id);
                        setTripMenuVisible(false);
                      }}
                      title={`${trip.trip_code} - ${trip.destination}`}
                    />
                  ))}
                </>
              )}
            </Menu>
            {errors.tripId && (
              <HelperText type="error">{errors.tripId}</HelperText>
            )}
            {trips.length === 0 && !errors.tripId && (
              <HelperText type="info">
                Nenhuma viagem cadastrada. Crie uma nova viagem para continuar.
              </HelperText>
            )}
          </View>
        )}

        {/* Fornecedor */}
        <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={[styles.cardHeaderIcon, { backgroundColor: `${brandingColors.primary}14` }]}>
                <Ionicons name="briefcase-outline" size={20} color={brandingColors.primary} />
              </View>
              <Text style={styles.cardTitle}>Informações do Fornecedor</Text>
            </View>

          <View style={styles.inputGroup}>
            <TextInput
              label="Nome do Fornecedor *"
              value={supplierName}
              onChangeText={(text) => setSupplierName(capitalizeSupplierName(text))}
              mode="outlined"
              error={!!errors.supplierName}
              left={<TextInput.Icon icon="store" />}
              autoCapitalize="words"
            />
            {errors.supplierName && (
              <HelperText type="error">{errors.supplierName}</HelperText>
            )}
          </View>

          <View style={styles.inputGroup}>
            <TextInput
              label="CNPJ"
              value={supplierCnpj}
              onChangeText={(text) => {
                const masked = cnpjMask(text);
                setSupplierCnpj(masked);
                setErrors({ ...errors, supplierCnpj: '' });
              }}
              mode="outlined"
              keyboardType="numeric"
              placeholder="00.000.000/0000-00"
              maxLength={18}
              left={<TextInput.Icon icon="card-account-details" />}
              error={!!errors.supplierCnpj || cnpjValidationStatus === 'invalid'}
              right={
                cnpjValidationStatus === 'valid' ? (
                  <TextInput.Icon icon="check-circle" color={Colors.light.success} />
                ) : cnpjValidationStatus === 'invalid' ? (
                  <TextInput.Icon icon="close-circle" color={Colors.light.error} />
                ) : null
              }
            />
            {!errors.supplierCnpj && cnpjValidationStatus === 'invalid' && (
              <HelperText type="error" visible={true}>
                CNPJ deve ter 14 dígitos
              </HelperText>
            )}
            {!errors.supplierCnpj && cnpjValidationStatus === 'valid' && (
              <HelperText type="info" visible={true} style={{ color: Colors.light.success }}>
                CNPJ válido ✓
              </HelperText>
            )}
            {errors.supplierCnpj && (
              <HelperText type="error">{errors.supplierCnpj}</HelperText>
            )}
          </View>

          <View style={styles.inputGroup}>
            <TextInput
              label="Contato"
              value={supplierContact}
              onChangeText={(text) => {
                setSupplierContact(phoneMask(text));
                setErrors({ ...errors, supplierContact: '' });
              }}
              mode="outlined"
              keyboardType="phone-pad"
              placeholder="(00) 00000-0000"
              maxLength={15}
              left={<TextInput.Icon icon="phone" />}
              error={!!errors.supplierContact}
            />
            {errors.supplierContact && (
              <HelperText type="error">{errors.supplierContact}</HelperText>
            )}
          </View>
        </View>

        {/* Nota Fiscal e Pagamento */}
        <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={[styles.cardHeaderIcon, { backgroundColor: `${brandingColors.primary}14` }]}>
                <Ionicons name="cash-outline" size={20} color={brandingColors.primary} />
              </View>
              <Text style={styles.cardTitle}>Pagamento</Text>
            </View>

          <View style={styles.inputGroup}>
            <TextInput
              label="Número da NF"
              value={invoiceNumber}
              onChangeText={setInvoiceNumber}
              mode="outlined"
              placeholder="Ex: 12345"
              left={<TextInput.Icon icon="receipt" />}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Forma de Pagamento</Text>
            <View style={styles.paymentChips}>
              {['PIX', 'Cartão', 'Dinheiro', 'Boleto'].map((method) => (
                <Chip
                  key={method}
                  selected={paymentMethod === method}
                  onPress={() => setPaymentMethod(method)}
                  style={styles.paymentChip}
                  mode={paymentMethod === method ? 'flat' : 'outlined'}
                >
                  {method}
                </Chip>
              ))}
            </View>
            <TextInput
              label="Ou digite outro método"
              value={paymentMethod}
              onChangeText={setPaymentMethod}
              mode="outlined"
              placeholder="Ex: Transferência"
              left={<TextInput.Icon icon="cash" />}
              style={{ marginTop: 8 }}
            />
          </View>
        </View>

        {/* Lista de Produtos */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Produtos ({items.length}) <Text style={{ fontSize: 12, color: '#888', fontWeight: 'normal' }}>opcional</Text></Text>
            <Button
              mode="outlined"
              onPress={() => setProductMenuVisible(true)}
              icon="plus"
              compact
              textColor={brandingColors.primary}
              style={{ borderColor: `${brandingColors.primary}55` }}
            >
              Adicionar
            </Button>
          </View>

          {errors.items && (
            <HelperText type="error">{errors.items}</HelperText>
          )}

          {/* Modal de Produtos */}
          <Modal
            visible={productMenuVisible}
            transparent
            animationType="slide"
            onRequestClose={() => {
              setProductMenuVisible(false);
              setProductSearch('');
            }}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Adicionar Produto</Text>
                  <IconButton
                    icon="close"
                    size={24}
                    onPress={() => {
                      setProductMenuVisible(false);
                      setProductSearch('');
                    }}
                  />
                </View>

                <TextInput
                  placeholder="Buscar produto..."
                  value={productSearch}
                  onChangeText={setProductSearch}
                  mode="outlined"
                  left={<TextInput.Icon icon="magnify" />}
                  style={styles.searchInput}
                />

                {(isLoadingProducts || isLoadingCatalog) ? (
                  <View style={styles.loadingContainer}>
                    <Text style={styles.loadingText}>Carregando produtos...</Text>
                  </View>
                ) : (
                  <ScrollView style={styles.productList}>
                    {filteredProducts.map((product: Product) => (
                      <TouchableOpacity
                        key={`${product.is_catalog ? 'cat' : 'act'}-${product.id}`}
                        style={styles.productItem}
                        onPress={() => handleAddProduct(product)}
                      >
                        <View style={styles.productItemContent}>
                          <View style={styles.productItemHeader}>
                            <Text style={styles.productName} numberOfLines={2}>{product.name}</Text>
                            {product.is_catalog && (
                              <View style={styles.catalogBadge}>
                                <Text style={styles.catalogBadgeText}>Catálogo</Text>
                              </View>
                            )}
                          </View>
                          <Text style={styles.productPrice}>
                            Custo: {formatCurrency(product.cost_price || 0)}
                          </Text>
                          {product.sku && (
                            <Text style={styles.productSku}>SKU: {product.sku}</Text>
                          )}
                        </View>
                        <IconButton icon="plus" size={20} />
                      </TouchableOpacity>
                    ))}
                    {filteredProducts.length === 0 && (
                      <View style={styles.emptyState}>
                        <Ionicons name="cube-outline" size={48} color={Colors.light.textSecondary} />
                        <Text style={styles.emptyText}>
                          Nenhum produto encontrado
                        </Text>
                        <Text style={styles.emptySubtext}>
                          Tente buscar por outro termo
                        </Text>
                      </View>
                    )}
                  </ScrollView>
                )}
              </View>
            </View>
          </Modal>

          {/* Lista de Items - agrupada por produto com variantes */}
          {getGroupedItems().map(({ key, indices }) => renderProductGroupCard(key, indices))}
        </View>

        {/* Observações */}
        <View style={styles.inputGroup}>
          <TextInput
            label="Observações"
            value={notes}
            onChangeText={setNotes}
            mode="outlined"
            multiline
            numberOfLines={3}
          />
        </View>

        {/* Resumo */}
        {items.length > 0 && (
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Produtos</Text>
              <Text style={styles.summaryValue}>{items.length} {items.length === 1 ? 'item' : 'itens'}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Quantidade Total</Text>
              <Text style={styles.summaryValue}>
                {items.reduce((sum, item) => sum + item.quantity_received, 0)} unidades
              </Text>
            </View>
            <Divider style={styles.summaryDivider} />
            <View style={styles.summaryRow}>
              <Text style={styles.totalLabel}>Total da Entrada</Text>
              <Text style={[styles.totalValue, { color: brandingColors.primary }]}>{formatCurrency(total)}</Text>
            </View>
          </View>
        )}

        {/* Botões */}
        <View style={styles.actions}>
          <Button
            mode="outlined"
            onPress={() => isFromWizard ? router.back() : router.push('/(tabs)/entries')}
            disabled={createMutation.isPending || createAtomicMutation.isPending || createAtomicVariantsMutation.isPending}
            textColor={brandingColors.primary}
            style={[styles.actionButton, { borderColor: `${brandingColors.primary}55` }]}
            contentStyle={styles.cancelButtonContent}
          >
            Cancelar
          </Button>

          <TouchableOpacity
            onPress={handleSubmit}
            activeOpacity={0.8}
            disabled={
              createMutation.isPending ||
              createAtomicMutation.isPending ||
              createAtomicVariantsMutation.isPending ||
              codeValidationStatus === 'invalid' ||
              codeValidationStatus === 'checking'
            }
            style={[
              styles.submitButton,
              styles.actionButton,
              (createMutation.isPending ||
                createAtomicMutation.isPending ||
                createAtomicVariantsMutation.isPending ||
                codeValidationStatus === 'invalid' ||
                codeValidationStatus === 'checking') && styles.submitButtonDisabled,
            ]}
          >
            <LinearGradient
              colors={brandingColors.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.submitButtonContent}
            >
              <Ionicons
                name={(createMutation.isPending || createAtomicMutation.isPending || createAtomicVariantsMutation.isPending) ? 'sync-outline' : 'checkmark-circle-outline'}
                size={20}
                color="#fff"
              />
              <Text style={styles.submitButtonText}>
                {(createMutation.isPending || createAtomicMutation.isPending || createAtomicVariantsMutation.isPending)
                  ? 'Salvando...'
                  : 'Salvar Entrada'}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
        </KeyboardAwareScreen>
      </Animated.View>

      {/* Dialog de Criar Nova Viagem */}
      <ConfirmDialog
        visible={showCreateTripDialog}
        title="Criar Nova Viagem"
        message="Você será redirecionado para cadastrar uma nova viagem. Seus dados da entrada atual serão preservados."
        details={[
          'Cadastre a viagem com destino, data e custos',
          'Após salvar, você voltará automaticamente',
          'A viagem será vinculada automaticamente',
          'Continue preenchendo a entrada de estoque'
        ]}
        type="info"
        confirmText="Ir para Nova Viagem"
        cancelText="Cancelar"
        onConfirm={() => {
          setShowCreateTripDialog(false);
          router.push({
            pathname: '/trips/add',
            params: {
              from: 'entries',
              // Preservar produto pré-selecionado (novo fluxo com dados completos)
              ...(params.preselectedProductData && {
                preselectedProductData: params.preselectedProductData,
                preselectedQuantity: params.preselectedQuantity,
                fromCatalog: params.fromCatalog,
              }),
              // Legacy: Preservar produto pré-selecionado (se houver)
              ...(params.preselectedProductId && !params.preselectedProductData && {
                preselectedProductId: params.preselectedProductId,
                preselectedQuantity: params.preselectedQuantity,
                preselectedPrice: params.preselectedPrice,
              })
            }
          });
        }}
        onCancel={() => setShowCreateTripDialog(false)}
        icon="airplane"
      />

      {/* Dialog de Sucesso da Entrada */}
      <ConfirmDialog
        visible={showSuccessDialog}
        title={
          isFromWizard
            ? params.wizardMode === 'atomic-variants'
              ? "Produto Criado com Sucesso!"
              : "Entrada Vinculada!"
            : isFromAIScanner
            ? "Produto Criado com Sucesso FIFO!"
            : "Entrada Criada!"
        }
        message={
          isFromWizard
            ? params.wizardMode === 'atomic-variants'
              ? `${params.wizardProductName || 'Produto'} e variantes criados com entrada ${createdEntryCode || ''}!`
              : `Produto vinculado a entrada ${createdEntryCode || ''} com sucesso!`
            : isFromAIScanner
            ? `Produto escaneado foi cadastrado e vinculado à entrada de estoque!`
            : items.length === 0
            ? `Entrada ${createdEntryCode || ''} criada. Adicione produtos quando quiser.`
            : `A entrada ${createdEntryCode || ''} foi registrada com sucesso.`
        }
        details={
          isFromWizard
            ? [
                `Produto: ${params.wizardProductName || 'N/A'}`,
                `Entrada: ${createdEntryCode}`,
                `Variantes: ${items.length} | Total: ${items.reduce((sum, i) => sum + i.quantity_received, 0)} un`,
                '✅ Produto + Variantes + Estoque criados atomicamente',
                '✅ Rastreabilidade FIFO ativa',
              ]
            : isFromAIScanner
            ? [
                '✅ Produto criado no catálogo',
                '✅ Entrada de estoque vinculada (FIFO)',
                '✅ Rastreabilidade completa garantida',
                '📊 Você pode acompanhar:',
                '  • Custo real por venda (FIFO)',
                '  • ROI por entrada/viagem',
                '  • Sell-Through Rate',
                '',
                'Cada venda usará o estoque da entrada mais antiga primeiro (FIFO)',
              ]
            : items.length === 0
            ? [
                '📦 Entrada registrada sem produtos',
                'Abra a entrada para vincular produtos a qualquer momento',
                selectedType === EntryType.TRIP && selectedTrip
                  ? `Viagem: ${selectedTrip.trip_code}`
                  : '',
              ].filter(Boolean)
            : [
                `${items.length} ${items.length === 1 ? 'item' : 'itens'} adicionados`,
                `Total: ${formatCurrency(total)}`,
                selectedType === EntryType.TRIP && selectedTrip
                  ? `Viagem vinculada: ${selectedTrip.trip_code}`
                  : 'Tipo: ' +
                    (selectedType === EntryType.TRIP
                      ? 'Viagem'
                      : selectedType === EntryType.ONLINE
                      ? 'Online'
                      : 'Local'),
                'Você pode acompanhar performance (Sell-Through / ROI) após vendas',
              ].filter(Boolean)
        }
        type="success"
        confirmText={isFromWizard ? "Ver Resumo" : isFromAIScanner ? "Ver Produto" : items.length === 0 ? "Abrir Entrada" : "Ver Entradas"}
        cancelText={isFromWizard ? "" : isFromAIScanner ? "Escanear Outro" : "Nova Entrada"}
        onConfirm={() => {
          setShowSuccessDialog(false);

          // Se veio do wizard, retornar ao wizard com dados da entrada E do produto
          if (isFromWizard && createdEntryId) {
            router.replace({
              pathname: '/products/wizard',
              params: {
                returnFromEntry: 'true',
                createdEntryId: String(createdEntryId),
                createdEntryCode: createdEntryCode || '',
                createdEntryQuantity: String(items.reduce((sum, i) => sum + i.quantity_received, 0)),
                createdEntrySupplier: supplierName || undefined,
                // Passar dados do produto para restaurar no wizard
                createdProductData: params.preselectedProductData || '',
              },
            });
            return;
          }

          if (isFromAIScanner && items.length > 0 && items[0].product?.id) {
            router.push(`/products/${items[0].product.id}`);
          } else if (items.length === 0 && createdEntryId) {
            // Sem produtos: abrir detalhes para vincular depois
            router.push(`/entries/${createdEntryId}`);
          } else {
            router.push('/(tabs)/entries');
          }
        }}
        onCancel={() => {
          // Reset para nova entrada/scan rápido
          setShowSuccessDialog(false);
          if (isFromAIScanner) {
            // Voltar para scanner para escanear outro produto
            router.replace('/products/scan');
          } else {
            // Reset formulário para nova entrada
            setEntryCode('');
            setSupplierName('');
            setSupplierCnpj('');
            setSupplierContact('');
            setInvoiceNumber('');
            setPaymentMethod('');
            setNotes('');
            setItems([]);
            setItemCosts({});
            setTripId(undefined);
            setSelectedType(EntryType.LOCAL);
          }
        }}
        icon="checkmark-circle"
      />

      {/* Dialog de Viagem Vinculada */}
      <ConfirmDialog
        visible={showTripLinkedDialog}
        title="Viagem Vinculada!"
        message={`A viagem foi vinculada automaticamente a esta entrada.`}
        details={
          linkedTripInfo
            ? [
                `Código: ${linkedTripInfo.code}`,
                `Destino: ${linkedTripInfo.destination}`,
                'Continue preenchendo os dados da entrada',
              ]
            : []
        }
        type="success"
        confirmText="Continuar"
        cancelText=""
        onConfirm={() => setShowTripLinkedDialog(false)}
        onCancel={() => setShowTripLinkedDialog(false)}
        icon="checkmark-circle"
      />

      {/* Dialog de Remover Item */}
      <ConfirmDialog
        visible={showDeleteItemDialog}
        title="Remover Produto"
        message="Deseja remover este produto da entrada?"
        type="danger"
        confirmText="Remover"
        cancelText="Cancelar"
        onConfirm={confirmRemoveItem}
        onCancel={() => {
          setShowDeleteItemDialog(false);
          setItemToDelete(null);
        }}
        icon="trash"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.backgroundSecondary,
  },
  wizardBanner: {
    flexDirection: 'column',
    backgroundColor: Colors.light.primary + '10',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.primary + '20',
  },
  wizardBannerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  wizardBannerText: {
    flex: 1,
  },
  wizardBannerTitle: {
    fontSize: 12,
    color: Colors.light.textSecondary,
  },
  wizardBannerSubtitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.text,
  },
  content: {
    flex: 1,
    backgroundColor: Colors.light.backgroundSecondary,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  section: {
    marginBottom: 24,
  },
  card: {
    marginBottom: 16,
    borderRadius: 16,
    elevation: 2,
    backgroundColor: Colors.light.background,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  cardHeaderIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.light.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.light.text,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.light.text,
    marginBottom: 12,
  },
  typeButtons: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: theme.spacing.xs,
  },
  typeButton: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  typeButtonActive: {
    borderColor: Colors.light.primary,
    backgroundColor: Colors.light.primaryLight,
    ...theme.shadows.sm,
  },
  typeButtonText: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    color: Colors.light.textSecondary,
  },
  typeButtonTextActive: {
    color: Colors.light.primary,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: 8,
  },
  labelWithAction: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: Colors.light.primaryLight,
  },
  addButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.light.primary,
  },
  selectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: Colors.light.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  selectButtonError: {
    borderColor: Colors.light.error,
  },
  selectButtonText: {
    fontSize: 16,
    color: Colors.light.text,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.light.text,
  },
  searchInput: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
  },
  productList: {
    maxHeight: 400,
  },
  productItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  productItemContent: {
    flex: 1,
  },
  productItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  productName: {
    fontSize: 16,
    fontWeight: '500',
    color: Colors.light.text,
    flex: 1,
  },
  productPrice: {
    fontSize: 14,
    color: Colors.light.textSecondary,
  },
  productSku: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  catalogBadge: {
    backgroundColor: Colors.light.infoLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  catalogBadgeText: {
    fontSize: 10,
    color: Colors.light.info,
    fontWeight: '600',
  },
  loadingContainer: {
    padding: 32,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 14,
    color: Colors.light.textSecondary,
  },
  emptyState: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.light.text,
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    marginTop: 8,
    textAlign: 'center',
  },
  catalogButton: {
    marginTop: 16,
    backgroundColor: Colors.light.primary,
  },
  itemCard: {
    marginBottom: 12,
    backgroundColor: Colors.light.card,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  itemName: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.text,
    flex: 1,
  },
  itemRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  itemInput: {
    flex: 1,
  },
  itemInputFull: {
    flex: 1,
  },
  warningText: {
    fontSize: 11,
    color: Colors.light.warning,
    marginTop: 4,
  },
  itemTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
  },
  itemTotalLabel: {
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  itemTotalValue: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.light.primary,
  },
  paymentChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  paymentChip: {
    marginRight: 0,
  },
  summaryCard: {
    backgroundColor: Colors.light.card,
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  summaryLabel: {
    fontSize: 14,
    color: Colors.light.textSecondary,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.text,
  },
  summaryDivider: {
    marginVertical: 8,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.light.text,
  },
  totalValue: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.light.primary,
  },
  actions: {
    marginTop: 8,
    gap: 10,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  actionButton: {
    flex: 1,
  },
  submitButton: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    ...theme.shadows.sm,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonContent: {
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  submitButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: theme.fontSize.base,
  },
  cancelButtonContent: {
    height: 52,
  },
  // Variante grouped card styles
  variantDivider: {
    height: 1,
    backgroundColor: Colors.light.border,
    marginVertical: 10,
  },
  variantGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  variantGroupIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: Colors.light.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  variantCountBadge: {
    backgroundColor: Colors.light.primary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  variantCountText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
  variantRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  variantChipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    flexWrap: 'wrap',
  },
  variantChipSize: {
    backgroundColor: Colors.light.primary + '20',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  variantChipColor: {
    backgroundColor: Colors.light.infoLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  variantChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.light.text,
  },
  variantSkuText: {
    fontSize: 11,
    color: Colors.light.textSecondary,
  },
  variantRemoveBtn: {
    margin: 0,
    width: 28,
    height: 28,
  },
});
