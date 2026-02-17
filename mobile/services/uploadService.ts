/**
 * Serviço de upload de imagens.
 *
 * Suporta:
 * - Upload de arquivo (FormData)
 * - Upload de base64 (útil para fotos do scanner)
 */

import api from './api';
import type { Product } from '@/types';

/**
 * Faz upload de uma imagem para um produto.
 *
 * @param productId ID do produto
 * @param imageUri URI local da imagem (file:///...)
 * @returns Produto atualizado com image_url
 */
export async function uploadProductImage(
  productId: number,
  imageUri: string
): Promise<Product> {
  // Se a URI for base64, usar endpoint específico
  if (imageUri.startsWith('data:')) {
    return uploadProductImageBase64(productId, imageUri);
  }

  // Criar FormData para upload de arquivo
  const formData = new FormData();

  // Extrair nome e tipo do arquivo
  const uriParts = imageUri.split('/');
  const fileName = uriParts[uriParts.length - 1];
  const fileType = fileName.endsWith('.png') ? 'image/png' : 'image/jpeg';

  // Adicionar arquivo ao FormData
  formData.append('file', {
    uri: imageUri,
    name: fileName,
    type: fileType,
  } as any);

  const response = await api.post<Product>(
    `/products/${productId}/image`,
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    }
  );

  return response.data;
}

/**
 * Faz upload de uma imagem em base64 para um produto.
 *
 * @param productId ID do produto
 * @param base64Data String base64 (com ou sem prefixo data:image/...)
 * @returns Produto atualizado com image_url
 */
export async function uploadProductImageBase64(
  productId: number,
  base64Data: string
): Promise<Product> {
  const response = await api.post<Product>(
    `/products/${productId}/image/base64`,
    { image_data: base64Data }
  );

  return response.data;
}

/**
 * Converte uma URI local para base64.
 * Útil quando o upload direto de arquivo não funciona.
 *
 * @param uri URI local da imagem
 * @returns String base64
 */
export async function uriToBase64(uri: string): Promise<string> {
  const response = await fetch(uri);
  const blob = await response.blob();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      resolve(reader.result as string);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Faz upload de imagem para produto, tentando primeiro FormData
 * e fallback para base64 se falhar.
 *
 * @param productId ID do produto
 * @param imageUri URI local da imagem
 * @returns Produto atualizado com image_url
 */
export async function uploadProductImageWithFallback(
  productId: number,
  imageUri: string
): Promise<Product> {
  try {
    // Tentar upload direto (mais eficiente)
    return await uploadProductImage(productId, imageUri);
  } catch (error) {
    console.log('Upload direto falhou, tentando base64...');

    // Fallback: converter para base64 e enviar
    const base64 = await uriToBase64(imageUri);
    return await uploadProductImageBase64(productId, base64);
  }
}
