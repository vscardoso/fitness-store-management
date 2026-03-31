/**
 * Hook para gerenciamento do AI Scanner
 * Captura de imagem, análise e criação de produto
 */

import { useState, useCallback } from 'react';
import { Alert, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { scanProductImage } from '@/services/aiService';
import type { ProductScanResult, ProductScanResponse, ProductCreate } from '@/types';
import { createProduct } from '@/services/productService';

export interface UseAIScannerReturn {
  // Permissões
  hasPermission: boolean;
  requestPermission: () => Promise<boolean>;

  // Captura
  takePhoto: () => Promise<void>;
  pickFromGallery: () => Promise<void>;
  capturedImage: string | null;

  // Análise
  isAnalyzing: boolean;
  analyzeImage: (uri: string) => Promise<void>;
  scanResult: ProductScanResult | null;
  error: string | null;
  processingTime: number;

  // Ações
  confirmAndCreate: () => Promise<void>;
  isCreating: boolean;
  editManually: () => void;
  addToDuplicate: (productId: number, quantity?: number) => void;
  addAsVariant: (productId: number) => void;
  retake: () => void;
  reset: () => void;
  // Modal de similares
  showSimilarModal: boolean;
  dismissSimilarModal: () => void;
}

export function useAIScanner(): UseAIScannerReturn {
  const router = useRouter();
  const queryClient = useQueryClient();

  // Estados
  const [hasPermission, setHasPermission] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [scanResult, setScanResult] = useState<ProductScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [processingTime, setProcessingTime] = useState(0);
  const [isCreating, setIsCreating] = useState(false);
  const [showSimilarModal, setShowSimilarModal] = useState(false);

  /**
   * Solicita permissões de câmera e galeria
   */
  const requestPermission = useCallback(async (): Promise<boolean> => {
    try {
      // Permissão de câmera
      const cameraResult = await ImagePicker.requestCameraPermissionsAsync();

      // Permissão de galeria
      const libraryResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

      const granted = cameraResult.status === 'granted' && libraryResult.status === 'granted';
      setHasPermission(granted);

      if (!granted) {
        Alert.alert(
          'Permissão Necessária',
          'Para usar o scanner de IA, precisamos de acesso à câmera e galeria.',
          [{ text: 'OK' }]
        );
      }

      return granted;
    } catch (err) {
      console.error('Error requesting permissions:', err);
      return false;
    }
  }, []);

  /**
   * Analisa a imagem com IA
   */
  const analyzeImage = useCallback(async (uri: string) => {
    setIsAnalyzing(true);
    setError(null);
    setScanResult(null);

    try {
      const response = await scanProductImage(uri, {
        checkDuplicates: true,
        suggestPrice: true,
      });

      setProcessingTime(response.processing_time_ms);

      if (response.success && response.data) {
        setScanResult(response.data);
        // Abrir modal de similares automaticamente se score >= 0.65
        if (
          response.data.possible_duplicates &&
          response.data.possible_duplicates.length > 0 &&
          response.data.possible_duplicates[0].similarity_score >= 0.65
        ) {
          setShowSimilarModal(true);
        }
      } else {
        setError(response.error || 'Não foi possível analisar a imagem');
      }
    } catch (err: any) {
      console.error('Error analyzing image:', err);
      setError(err.message || 'Erro ao analisar imagem');
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  /**
   * Tira foto com a câmera
   */
  const takePhoto = useCallback(async () => {
    // Verificar permissão
    if (!hasPermission) {
      const granted = await requestPermission();
      if (!granted) return;
    }

    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: [ImagePicker.MediaType.Images],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const uri = result.assets[0].uri;
        setCapturedImage(uri);
        await analyzeImage(uri);
      }
    } catch (err) {
      console.error('Error taking photo:', err);
      Alert.alert('Erro', 'Não foi possível tirar a foto');
    }
  }, [hasPermission, requestPermission, analyzeImage]);

  /**
   * Seleciona imagem da galeria
   */
  const pickFromGallery = useCallback(async () => {
    // Verificar permissão
    if (!hasPermission) {
      const granted = await requestPermission();
      if (!granted) return;
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: [ImagePicker.MediaType.Images],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const uri = result.assets[0].uri;
        setCapturedImage(uri);
        await analyzeImage(uri);
      }
    } catch (err) {
      console.error('Error picking image:', err);
      Alert.alert('Erro', 'Não foi possível selecionar a imagem');
    }
  }, [hasPermission, requestPermission, analyzeImage]);

  /**
   * Confirma e cria o produto
   * Após criar, SEMPRE redireciona para entrada de estoque (FIFO)
   */
  const confirmAndCreate = useCallback(async () => {
    if (!scanResult) {
      Alert.alert('Erro', 'Nenhum resultado de análise disponível');
      return;
    }

    setIsCreating(true);

    try {
      const productData: ProductCreate = {
        name: scanResult.name,
        sku: scanResult.suggested_sku,
        barcode: scanResult.detected_barcode,
        description: scanResult.description,
        brand: scanResult.brand,
        color: scanResult.color,
        size: scanResult.size, // Agora pode ser null se não identificável
        category_id: scanResult.suggested_category_id || 1, // Fallback para categoria 1
        cost_price: scanResult.suggested_cost_price,
        price: scanResult.suggested_sale_price || 0,
        initial_stock: 0, // Sempre 0 - estoque via entrada FIFO
        min_stock: 5,
      };

      const created = await createProduct(productData);

      // Invalidar cache de produtos
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['grouped-products'] });
      queryClient.invalidateQueries({ queryKey: ['grouped-products-modal'] });
      
      // SEMPRE redirecionar para entrada de estoque (FIFO obrigatório)
      router.replace({
        pathname: '/entries/add',
        params: {
          fromAIScanner: 'true',
          preselectedProductData: JSON.stringify({
            id: created.id,
            name: created.name,
            sku: created.sku,
            cost_price: created.cost_price,
            price: created.price,
            category_id: created.category_id,
          }),
          preselectedQuantity: '1',
          fromCatalog: 'false',
        },
      });
    } catch (err: any) {
      console.error('Error creating product:', err);
      Alert.alert('Erro', err.message || 'Não foi possível criar o produto');
    } finally {
      setIsCreating(false);
    }
  }, [scanResult, queryClient, router]);

  /**
   * Vai para edição manual com dados pré-preenchidos (usa o Wizard unificado)
   */
  const editManually = useCallback(() => {
    if (!scanResult) return;

    router.push({
      pathname: '/products/wizard',
      params: {
        prefillData: JSON.stringify({
          name: scanResult.name,
          sku: scanResult.suggested_sku,
          barcode: scanResult.detected_barcode,
          description: scanResult.description,
          brand: scanResult.brand,
          color: scanResult.color,
          size: scanResult.size,
          category_id: scanResult.suggested_category_id,
          cost_price: scanResult.suggested_cost_price,
          price: scanResult.suggested_sale_price,
        }),
      },
    });
  }, [scanResult, router]);

  /**
   * Adiciona estoque a um produto EXISTENTE (mesmo produto).
   * Usa a tela rápida add-stock dedicada a este fluxo.
   */
  const addToDuplicate = useCallback((productId: number, quantity: number = 1) => {
    const dup = scanResult?.possible_duplicates?.find(d => d.product_id === productId);
    router.push({
      pathname: '/entries/add-stock',
      params: {
        productId:    String(productId),
        quantity:     String(quantity),
        ...(dup?.product_name ? { productName:   dup.product_name }            : {}),
        ...(dup?.sku           ? { productSku:    dup.sku }                     : {}),
        ...(dup?.current_stock !== undefined ? { currentStock: String(dup.current_stock) } : {}),
        ...(dup?.cost_price    ? { costPrice:     String(dup.cost_price) }      : {}),
      },
    } as any);
  }, [router, scanResult]);

  /**
   * Cria uma nova variação baseada em um produto similar existente.
   * Vai para o wizard (Step 2) com os dados do produto similar pré-preenchidos,
   * permitindo ajustar cor, tamanho, SKU etc. antes de criar a entrada.
   */
  const addAsVariant = useCallback((productId: number) => {
    const dup = scanResult?.possible_duplicates?.find(d => d.product_id === productId);
    // Mescla dados do produto similar com dados do scan (scan tem cor/tamanho da foto)
    // Usa prefillData para ir direto ao Step 2 (igual ao editManually)
    const prefillData = {
      name: scanResult?.name || dup?.product_name || '',
      cost_price: dup?.cost_price ?? scanResult?.suggested_cost_price ?? 0,
      price: scanResult?.suggested_sale_price ?? 0,
      color: scanResult?.color || undefined,
      size: scanResult?.size || undefined,
      brand: scanResult?.brand || undefined,
      description: scanResult?.description || undefined,
      category_id: scanResult?.suggested_category_id || undefined,
    };
    router.push({
      pathname: '/products/wizard',
      params: {
        prefillData: JSON.stringify(prefillData),
      },
    } as any);
  }, [router, scanResult]);

  /**
   * Refaz a foto
   */
  const retake = useCallback(() => {
    setCapturedImage(null);
    setScanResult(null);
    setError(null);
    setProcessingTime(0);
    setShowSimilarModal(false);
  }, []);

  /**
   * Reseta todo o estado
   */
  const reset = useCallback(() => {
    setCapturedImage(null);
    setScanResult(null);
    setError(null);
    setProcessingTime(0);
    setIsAnalyzing(false);
    setIsCreating(false);
    setShowSimilarModal(false);
  }, []);

  const dismissSimilarModal = useCallback(() => {
    setShowSimilarModal(false);
  }, []);

  return {
    hasPermission,
    requestPermission,
    takePhoto,
    pickFromGallery,
    capturedImage,
    isAnalyzing,
    analyzeImage,
    scanResult,
    error,
    processingTime,
    confirmAndCreate,
    isCreating,
    editManually,
    addToDuplicate,
    addAsVariant,
    retake,
    reset,
    showSimilarModal,
    dismissSimilarModal,
  };
}

export default useAIScanner;
