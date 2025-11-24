/**
 * Hook customizado para autenticação
 * Facilita uso do authStore com helpers adicionais
 */

import { useAuthStore } from '@/store/authStore';
import type { LoginCredentials } from '@/types';

/**
 * Hook customizado para autenticação
 */
export const useAuth = () => {
  const {
    user,
    isAuthenticated,
    isLoading,
    error,
    login,
    logout,
    loadUser,
    clearError,
  } = useAuthStore();

  /**
   * Verificar se usuário tem permissão (role)
   */
  const hasRole = (roles: string | string[]): boolean => {
    if (!user) return false;

    const allowedRoles = Array.isArray(roles) ? roles : [roles];
    return allowedRoles.includes(user.role);
  };

  /**
   * Verificar se é admin
   */
  const isAdmin = (): boolean => {
    return hasRole(['admin']);
  };

  /**
   * Verificar se é manager ou admin
   */
  const isManager = (): boolean => {
    return hasRole(['admin', 'manager']);
  };

  return {
    // State
    user,
    isAuthenticated,
    isLoading,
    error,

    // Actions
    login,
    logout,
    loadUser,
    clearError,

    // Helpers
    hasRole,
    isAdmin,
    isManager,
  };
};
