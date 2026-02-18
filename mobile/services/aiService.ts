/**
 * Serviço de IA para análise de produtos
 * Integração com Claude Vision API via backend
 */

import api from './api';
import { skipLoading } from '@/utils/apiHelpers';
import { logError } from './debugLog';
import type { ProductScanResponse, AIStatusResponse } from '@/types';

/**
 * Analisa imagem de produto com IA
 *
 * @param imageUri - URI da imagem (file:// ou content://)
 * @param options - Opções de análise
 * @returns Resultado da análise com dados do produto
 */
export const scanProductImage = async (
  imageUri: string,
  options?: {
    context?: string;
    checkDuplicates?: boolean;
    suggestPrice?: boolean;
  }
): Promise<ProductScanResponse> => {
  const formData = new FormData();

  // Preparar imagem para upload
  const extension = imageUri.split('.').pop()?.toLowerCase() || 'jpg';
  const mimeType = extension === 'png' ? 'image/png' :
                   extension === 'webp' ? 'image/webp' :
                   extension === 'gif' ? 'image/gif' : 'image/jpeg';

  // Criar objeto de arquivo para FormData
  const imageFile = {
    uri: imageUri,
    type: mimeType,
    name: `scan.${extension}`,
  } as any;

  formData.append('image', imageFile);

  // Adicionar opções
  if (options?.context) {
    formData.append('context', options.context);
  }
  formData.append('check_duplicates', String(options?.checkDuplicates ?? true));
  formData.append('suggest_price', String(options?.suggestPrice ?? true));

  try {
    // Usar skipLoading() porque o wizard tem seu próprio loading (isAnalyzing)
    const { data } = await api.post<ProductScanResponse>(
      '/ai/scan-product',
      formData,
      {
        ...skipLoading(),
        headers: {
          ...skipLoading().headers,
          'Content-Type': 'multipart/form-data',
        },
        timeout: 60000, // 60s para processamento de IA
      }
    );

    return data;
  } catch (error: any) {
    logError('AIScanner', 'Erro ao escanear produto', error);

    // Retornar formato esperado em caso de erro
    return {
      success: false,
      error: error.message || 'Erro ao analisar imagem',
      processing_time_ms: 0,
    };
  }
};

/**
 * Verifica status do serviço de IA
 */
export const getAIStatus = async (): Promise<AIStatusResponse> => {
  try {
    const { data } = await api.get<AIStatusResponse>('/ai/status');
    return data;
  } catch (error) {
    console.error('Error getting AI status:', error);
    return {
      enabled: false,
      model: 'unknown',
      has_api_key: false,
    };
  }
};

export default {
  scanProductImage,
  getAIStatus,
};
