/**
 * Serviço de galeria de mídia de produtos.
 *
 * Endpoints:
 *   GET    /products/{id}/media              — listar
 *   POST   /products/{id}/media/upload       — upload FormData
 *   POST   /products/{id}/media/upload/base64 — upload base64
 *   PATCH  /products/{id}/media/{mid}/cover  — definir capa
 *   DELETE /products/{id}/media/{mid}        — deletar
 *   PUT    /products/{id}/media/reorder      — reordenar
 */
import api from './api';
import type { ProductMedia } from '@/types/productMedia';

export async function getProductMedia(
  productId: number,
  scope?: 'product' | 'variant',
  variantId?: number,
): Promise<ProductMedia[]> {
  const params: Record<string, any> = {};
  if (scope) params.scope = scope;
  if (variantId != null) params.variant_id = variantId;
  const { data } = await api.get(`/products/${productId}/media`, { params });
  return data;
}

export async function uploadProductMedia(
  productId: number,
  imageUri: string,
  variantId?: number,
): Promise<ProductMedia> {
  if (imageUri.startsWith('data:')) {
    return uploadProductMediaBase64(productId, imageUri, variantId);
  }

  const formData = new FormData();
  const uriParts = imageUri.split('/');
  const fileName = uriParts[uriParts.length - 1];
  const fileType = fileName.endsWith('.png') ? 'image/png' : 'image/jpeg';
  formData.append('file', { uri: imageUri, name: fileName, type: fileType } as any);

  const params = variantId != null ? `?variant_id=${variantId}` : '';
  const { data } = await api.post<ProductMedia>(
    `/products/${productId}/media/upload${params}`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
  return data;
}

async function _uriToBase64(uri: string): Promise<string> {
  const resp = await fetch(uri);
  const blob = await resp.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function uploadProductMediaBase64(
  productId: number,
  imageData: string,
  variantId?: number,
): Promise<ProductMedia> {
  const { data } = await api.post<ProductMedia>(
    `/products/${productId}/media/upload/base64`,
    { image_data: imageData, variant_id: variantId ?? null },
  );
  return data;
}

export async function uploadProductMediaWithFallback(
  productId: number,
  imageUri: string,
  variantId?: number,
): Promise<ProductMedia> {
  try {
    return await uploadProductMedia(productId, imageUri, variantId);
  } catch {
    const base64 = await _uriToBase64(imageUri);
    return await uploadProductMediaBase64(productId, base64, variantId);
  }
}

export async function setProductMediaAsCover(
  productId: number,
  mediaId: number,
): Promise<ProductMedia> {
  const { data } = await api.patch<ProductMedia>(
    `/products/${productId}/media/${mediaId}/cover`,
  );
  return data;
}

export async function deleteProductMedia(
  productId: number,
  mediaId: number,
): Promise<void> {
  await api.delete(`/products/${productId}/media/${mediaId}`);
}

export async function reorderProductMedia(
  productId: number,
  items: { id: number; position: number }[],
): Promise<ProductMedia[]> {
  const { data } = await api.put<ProductMedia[]>(
    `/products/${productId}/media/reorder`,
    items,
  );
  return data;
}
