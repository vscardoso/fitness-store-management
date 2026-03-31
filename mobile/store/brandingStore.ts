import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, PRESET_THEMES } from '@/constants/Colors';
import { getBranding, updateBranding, uploadLogo, type StoreBrandingUpdate } from '@/services/storeService';

export interface StoreBranding {
  name: string;
  tagline: string;
  logoUri: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
}

const DEFAULT_BRANDING: StoreBranding = {
  name: 'Sua Loja de Fitness',
  tagline: 'Gestão de produtos fitness',
  logoUri: null,
  primaryColor: Colors.light.primary,
  secondaryColor: Colors.light.secondary,
  accentColor: Colors.light.success,
};

interface BrandingState {
  branding: StoreBranding;
  synced: boolean;
  isHydrating: boolean;
  initialSyncAttempted: boolean;
  setBranding: (updates: Partial<StoreBranding>) => void;
  applyPreset: (preset: typeof PRESET_THEMES[number]) => void;
  resetToDefault: () => void;
  /** Carrega branding do servidor e atualiza o store local */
  fetchFromServer: () => Promise<void>;
  /** Salva nome/tagline/cores no servidor */
  saveToServer: (data: StoreBrandingUpdate) => Promise<void>;
  /** Faz upload do logo e atualiza o store */
  uploadLogoToServer: (uri: string) => Promise<void>;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const useBrandingStore = create<BrandingState>()(
  persist(
    (set, get) => ({
      branding: DEFAULT_BRANDING,
      synced: false,
      isHydrating: false,
      initialSyncAttempted: false,

      setBranding: (updates) =>
        set((state) => ({
          synced: false,
          branding: { ...state.branding, ...updates },
        })),

      applyPreset: (preset) =>
        set((state) => ({
          synced: false,
          branding: {
            ...state.branding,
            primaryColor: preset.primary,
            secondaryColor: preset.secondary,
            accentColor: preset.accent,
          },
        })),

      resetToDefault: () =>
        set({
          branding: DEFAULT_BRANDING,
          synced: false,
          isHydrating: false,
          initialSyncAttempted: false,
        }),

      fetchFromServer: async () => {
        const MAX_ATTEMPTS = 3;

        set({ isHydrating: true });

        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
          try {
            const remote = await getBranding();
            set((state) => ({
              synced: true,
              isHydrating: false,
              initialSyncAttempted: true,
              branding: {
                name: remote.name,
                tagline: remote.tagline ?? state.branding.tagline,
                logoUri: remote.logo_url ?? state.branding.logoUri,
                primaryColor: remote.primary_color,
                secondaryColor: remote.secondary_color,
                accentColor: remote.accent_color,
              },
            }));
            return;
          } catch {
            if (attempt < MAX_ATTEMPTS) {
              await wait(250 * attempt);
            }
          }
        }

        // Falha silenciosa apos retries — usa cache local
        set((state) => ({
          synced: false,
          isHydrating: false,
          initialSyncAttempted: true,
          branding: state.branding,
        }));
      },

      saveToServer: async (data) => {
        const remote = await updateBranding(data);
        set((state) => ({
          synced: true,
          initialSyncAttempted: true,
          branding: {
            ...state.branding,
            name: remote.name,
            tagline: remote.tagline ?? state.branding.tagline,
            logoUri: remote.logo_url ?? state.branding.logoUri,
            primaryColor: remote.primary_color,
            secondaryColor: remote.secondary_color,
            accentColor: remote.accent_color,
          },
        }));
      },

      uploadLogoToServer: async (uri) => {
        const { logo_url } = await uploadLogo(uri);
        set((state) => ({ branding: { ...state.branding, logoUri: logo_url } }));
      },
    }),
    {
      name: 'store-branding',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

/** Hook conveniente — retorna apenas as cores do branding atual */
export function useBrandingColors() {
  const { branding } = useBrandingStore();
  return {
    primary: branding.primaryColor,
    secondary: branding.secondaryColor,
    accent: branding.accentColor,
    gradient: [branding.primaryColor, branding.secondaryColor] as [string, string],
  };
}
