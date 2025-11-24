/**
 * UI Store (Zustand)
 * Gerencia configurações de interface do usuário
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

type ColorScheme = 'light' | 'dark' | 'auto';

/**
 * Interface do UI Store
 */
interface UIState {
  // State
  colorScheme: ColorScheme;
  fontSize: number;
  isFirstLaunch: boolean;

  // Actions
  setColorScheme: (scheme: ColorScheme) => void;
  setFontSize: (size: number) => void;
  setFirstLaunchComplete: () => void;
}

/**
 * UI Store - Gerencia configurações de interface
 */
export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      // Estado inicial
      colorScheme: 'light',
      fontSize: 16,
      isFirstLaunch: true,

      /**
       * Definir esquema de cores
       */
      setColorScheme: (scheme: ColorScheme) => {
        set({ colorScheme: scheme });
      },

      /**
       * Definir tamanho da fonte
       */
      setFontSize: (size: number) => {
        set({ fontSize: Math.max(12, Math.min(24, size)) });
      },

      /**
       * Marcar primeiro lançamento como completo
       */
      setFirstLaunchComplete: () => {
        set({ isFirstLaunch: false });
      },
    }),
    {
      name: 'ui-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
