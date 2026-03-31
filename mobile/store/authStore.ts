/**
 * Auth Store (Zustand)
 * Gerencia autenticação global do app
 * Parte 1: Interface e tipos
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
// import * as Sentry from 'sentry-expo'; // TEMP: Desabilitado por conflito de versão
import type { User, LoginCredentials, SignupData } from '@/types';
import * as authService from '@/services/authService';
import { getUser, clearAuthData } from '@/services/storage';
import { useCartStore } from './cartStore';
import { useNotificationStore } from './notificationStore';
import { useBrandingStore } from './brandingStore';

const SESSION_STORAGE_KEYS = [
  'auth-storage',
  'cart-storage',
  '@fitness_store:cart',
  '@notifications',
  '@notification_config',
];

async function clearSessionState() {
  // Limpar stores em memória imediatamente
  useCartStore.getState().clear();
  useNotificationStore.getState().clearAll();

  // Limpar persistências de sessão no AsyncStorage
  await AsyncStorage.multiRemove(SESSION_STORAGE_KEYS);
}

/**
 * Interface do Auth Store
 */
interface AuthState {
  // State
  user: User | null;
  token: string | null;
  tenant_id: number | null;  // Identificador da loja (tenant)
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  login: (credentials: LoginCredentials) => Promise<void>;
  signup: (signupData: SignupData) => Promise<void>;
  logout: () => Promise<void>;
  forceLogout: (reason?: string) => Promise<void>;
  loadUser: () => Promise<void>;
  setUser: (user: User | null) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
}

/**
 * Auth Store - Gerencia autenticação e usuário
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      // Estado inicial
      user: null,
      token: null,
      tenant_id: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      /**
       * Fazer login
       */
      login: async (credentials: LoginCredentials) => {
        set({ isLoading: true, error: null });
        
        try {
          const user = await authService.login(credentials);

          // Estrategia agressiva: sempre tenta hidratar branding do banco antes de marcar sessao autenticada.
          await useBrandingStore.getState().fetchFromServer();
          
          // TEMP: Sentry desabilitado
          // Sentry.Native.setUser({
          //   id: user.id.toString(),
          //   email: user.email,
          //   username: user.name,
          // });
          // Sentry.Native.setTag('user_role', user.role);
          
          set({
            user,
            tenant_id: user.tenant_id,  // Persistir tenant da loja
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Erro ao fazer login';
          set({
            isLoading: false,
            error: message,
          });
          throw error;
        }
      },

      /**
       * Realizar signup completo
       */
      signup: async (signupData: SignupData) => {
        set({ isLoading: true, error: null });
        
        try {
          const user = await authService.signup(signupData);

          // Garantir branding do tenant recem-criado aplicado ainda no fluxo de autenticacao.
          await useBrandingStore.getState().fetchFromServer();
          
          // TEMP: Sentry desabilitado
          // Sentry.Native.setUser({
          //   id: user.id.toString(),
          //   email: user.email,
          //   username: user.full_name,
          // });
          // Sentry.Native.setTag('user_role', user.role);
          
          set({
            user,
            tenant_id: user.tenant_id,  // Persistir tenant da loja
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Erro ao criar conta';
          set({
            isLoading: false,
            error: message,
          });
          throw error;
        }
      },

      /**
       * Fazer logout
       */
      logout: async () => {
        // TEMP: Sentry desabilitado
        // Sentry.Native.setUser(null);
        
        // Limpar estado imediatamente
        set({
          user: null,
          token: null,
          tenant_id: null,
          isAuthenticated: false,
          error: null,
        });

        // Limpar AsyncStorage
        try {
          useBrandingStore.getState().resetToDefault();
          await clearAuthData();
          await clearSessionState();
        } catch (error) {
          console.error('Erro ao limpar dados de autenticação:', error);
        }
      },

      /**
       * Logout forçado (chamado quando token é inválido/expirado)
       * @param reason - Motivo do logout forçado (opcional)
       */
      forceLogout: async (reason?: string) => {
        console.log('🔐 Logout forçado:', reason || 'Token inválido');

        // TEMP: Sentry desabilitado
        // Sentry.Native.setUser(null);

        // Limpar estado imediatamente
        set({
          user: null,
          token: null,
          tenant_id: null,
          isAuthenticated: false,
          error: reason || 'Sessão expirada. Faça login novamente.',
        });

        // Limpar AsyncStorage
        try {
          useBrandingStore.getState().resetToDefault();
          await clearAuthData();
          await clearSessionState();
        } catch (error) {
          console.error('Erro ao limpar dados de autenticação:', error);
        }
      },

      /**
       * Carregar dados do usuário (ao iniciar app)
       */
      loadUser: async () => {
        set({ isLoading: true });
        
        try {
          const user = await getUser();
          
          if (user) {
            set({
              user,
              tenant_id: user.tenant_id,
              isAuthenticated: true,
              isLoading: false,
            });
          } else {
            set({ isLoading: false });
          }
        } catch (error) {
          console.error('Erro ao carregar usuário:', error);
          set({ isLoading: false });
        }
      },

      /**
       * Atualizar usuário
       */
      setUser: (user: User | null) => {
        set({ user, isAuthenticated: !!user });
      },

      /**
       * Definir erro
       */
      setError: (error: string | null) => {
        set({ error });
      },

      /**
       * Limpar erro
       */
      clearError: () => {
        set({ error: null });
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
