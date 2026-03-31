/**
 * Serviço de branding da loja
 * GET/PUT branding + upload de logo
 */

import api from './api';
import { skipLoading } from '@/utils/apiHelpers';
import { API_CONFIG } from '@/constants/Config';

export interface StoreBrandingData {
  name: string;
  tagline?: string | null;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  logo_url?: string | null;
}

export interface StoreBrandingUpdate {
  name?: string;
  tagline?: string;
  primary_color?: string;
  secondary_color?: string;
  accent_color?: string;
}

function toAbsoluteLogoUrl(logoUrl?: string | null): string | null | undefined {
  if (!logoUrl) {
    return logoUrl;
  }

  if (logoUrl.startsWith('http://') || logoUrl.startsWith('https://')) {
    return logoUrl;
  }

  const apiBase = API_CONFIG.BASE_URL.replace(/\/api\/v1\/?$/, '');
  const normalizedPath = logoUrl.startsWith('/') ? logoUrl : `/${logoUrl}`;
  return `${apiBase}${normalizedPath}`;
}

export const getBranding = async (): Promise<StoreBrandingData> => {
  const { data } = await api.get<StoreBrandingData>('/store/branding', skipLoading());
  return {
    ...data,
    logo_url: toAbsoluteLogoUrl(data.logo_url) ?? null,
  };
};

export const updateBranding = async (payload: StoreBrandingUpdate): Promise<StoreBrandingData> => {
  const { data } = await api.put<StoreBrandingData>('/store/branding', payload);
  return {
    ...data,
    logo_url: toAbsoluteLogoUrl(data.logo_url) ?? null,
  };
};

export const uploadLogo = async (uri: string): Promise<{ logo_url: string }> => {
  const filename = uri.split('/').pop() ?? 'logo.jpg';
  const ext = filename.split('.').pop()?.toLowerCase() ?? 'jpg';
  const mimeTypes: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
  };
  const type = mimeTypes[ext] ?? 'image/jpeg';

  const formData = new FormData();
  formData.append('file', { uri, name: filename, type } as any);

  const { data } = await api.post<{ logo_url: string }>('/store/logo', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return {
    logo_url: toAbsoluteLogoUrl(data.logo_url) ?? data.logo_url,
  };
};
