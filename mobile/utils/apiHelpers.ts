/**
 * API Helper Utilities
 * Helper functions to customize API request behavior
 */

import { AxiosRequestConfig } from 'axios';

/**
 * Create config to skip global loading indicator
 * Use for background refreshes or silent operations
 *
 * @example
 * ```typescript
 * const response = await api.get('/products', skipLoading());
 * ```
 */
export function skipLoading(): AxiosRequestConfig {
  return {
    headers: {
      'X-Skip-Loading': 'true',
    },
  };
}

/**
 * Create config with custom loading message
 * Use to provide context-specific feedback
 *
 * @param message - Custom message to display
 *
 * @example
 * ```typescript
 * const response = await api.post('/products', data, withLoadingMessage('Criando produto...'));
 * ```
 */
export function withLoadingMessage(message: string): AxiosRequestConfig {
  return {
    headers: {
      'X-Loading-Message': message,
    },
  };
}

/**
 * Merge multiple configs together
 *
 * @example
 * ```typescript
 * const response = await api.post(
 *   '/products',
 *   data,
 *   mergeConfigs(
 *     withLoadingMessage('Criando produto...'),
 *     { timeout: 10000 }
 *   )
 * );
 * ```
 */
export function mergeConfigs(...configs: AxiosRequestConfig[]): AxiosRequestConfig {
  return configs.reduce<AxiosRequestConfig>((acc, config) => {
    return {
      ...acc,
      ...config,
      headers: {
        ...acc.headers,
        ...config.headers,
      },
    };
  }, {});
}
