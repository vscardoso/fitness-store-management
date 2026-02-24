/**
 * ErrorContext - Contexto global para gerenciamento de erros
 * 
 * Fornece:
 * - Hook useError() para exibir erros de qualquer componente
 * - Integração automática com React Query
 * - Tratamento padronizado de erros de API
 */

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { AxiosError } from 'axios';
import ErrorSnackbar, { ErrorSeverity } from '@/components/ui/ErrorSnackbar';

export interface AppError {
  id: string;
  message: string;
  severity: ErrorSeverity;
  retry?: () => void;
}

interface ErrorContextType {
  // Estado atual
  currentError: AppError | null;
  
  // Métodos
  showError: (message: string, severity?: ErrorSeverity, retry?: () => void) => void;
  showApiError: (error: unknown, retry?: () => void) => void;
  showSuccess: (message: string) => void;
  showWarning: (message: string) => void;
  showInfo: (message: string) => void;
  dismissError: () => void;
  
  // Utilitários
  formatApiError: (error: unknown) => string;
}

const ErrorContext = createContext<ErrorContextType | undefined>(undefined);

interface ErrorProviderProps {
  children: ReactNode;
}

export function ErrorProvider({ children }: ErrorProviderProps) {
  const [currentError, setCurrentError] = useState<AppError | null>(null);

  const generateId = () => `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  /**
   * Formata erros de API para mensagens amigáveis
   */
  const formatApiError = useCallback((error: unknown): string => {
    // Erro de rede
    if (error instanceof Error && error.message.includes('Network Error')) {
      return 'Sem conexão com o servidor. Verifique sua internet.';
    }

    // Erro de timeout
    if (error instanceof Error && error.message.includes('timeout')) {
      return 'Tempo de conexão esgotado. Tente novamente.';
    }

    // Erro do Axios (resposta do servidor)
    if (error instanceof AxiosError) {
      const status = error.response?.status;
      const detail = error.response?.data?.detail;

      // Mapear códigos HTTP para mensagens
      const httpMessages: Record<number, string> = {
        400: 'Dados inválidos. Verifique as informações.',
        401: 'Sessão expirada. Faça login novamente.',
        403: 'Acesso não autorizado.',
        404: 'Recurso não encontrado.',
        409: 'Conflito de dados. Atualize a página.',
        422: 'Dados incompletos ou inválidos.',
        429: 'Muitas requisições. Aguarde um momento.',
        500: 'Erro interno do servidor. Tente novamente.',
        502: 'Servidor indisponível. Tente novamente.',
        503: 'Serviço em manutenção. Tente mais tarde.',
      };

      // Se tem detalhe da API, usar ele
      if (typeof detail === 'string' && detail) {
        return detail;
      }

      // Se tem status conhecido, usar mensagem padrão
      if (status && httpMessages[status]) {
        return httpMessages[status];
      }

      // Mensagem genérica do erro
      if (error.message) {
        return error.message;
      }
    }

    // Erro genérico
    if (error instanceof Error) {
      return error.message || 'Ocorreu um erro inesperado.';
    }

    return 'Ocorreu um erro inesperado.';
  }, []);

  /**
   * Exibe um erro com severidade específica
   */
  const showError = useCallback((
    message: string,
    severity: ErrorSeverity = 'error',
    retry?: () => void
  ) => {
    setCurrentError({
      id: generateId(),
      message,
      severity,
      retry,
    });
  }, []);

  /**
   * Exibe erro de API formatado
   */
  const showApiError = useCallback((error: unknown, retry?: () => void) => {
    const message = formatApiError(error);
    showError(message, 'error', retry);
  }, [formatApiError, showError]);

  /**
   * Exibe mensagem de sucesso
   */
  const showSuccess = useCallback((message: string) => {
    showError(message, 'success');
  }, [showError]);

  /**
   * Exibe aviso
   */
  const showWarning = useCallback((message: string) => {
    showError(message, 'warning');
  }, [showError]);

  /**
   * Exibe informação
   */
  const showInfo = useCallback((message: string) => {
    showError(message, 'info');
  }, [showError]);

  /**
   * Fecha o erro atual
   */
  const dismissError = useCallback(() => {
    setCurrentError(null);
  }, []);

  const value: ErrorContextType = {
    currentError,
    showError,
    showApiError,
    showSuccess,
    showWarning,
    showInfo,
    dismissError,
    formatApiError,
  };

  return (
    <ErrorContext.Provider value={value}>
      {children}
      <ErrorSnackbar
        visible={!!currentError}
        message={currentError?.message || ''}
        severity={currentError?.severity || 'error'}
        onDismiss={dismissError}
        onRetry={currentError?.retry}
      />
    </ErrorContext.Provider>
  );
}

/**
 * Hook para usar o contexto de erros
 */
export function useError(): ErrorContextType {
  const context = useContext(ErrorContext);
  if (!context) {
    throw new Error('useError must be used within an ErrorProvider');
  }
  return context;
}

/**
 * HOC para adicionar tratamento de erro a queries do React Query
 */
export function withQueryErrorHandler<T>(
  queryFn: () => Promise<T>,
  onError?: (error: unknown) => void
): () => Promise<T> {
  return async () => {
    try {
      return await queryFn();
    } catch (error) {
      // Log para debug
      if (__DEV__) {
        console.error('Query error:', error);
      }
      
      // Chamar callback de erro se fornecido
      if (onError) {
        onError(error);
      }
      
      throw error;
    }
  };
}