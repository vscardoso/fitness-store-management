/**
 * Helper para AsyncStorage com tipo seguro
 * Gerencia tokens, usuário e carrinho
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '@/constants/Config';
import type { User } from '@/types';

/**
 * Salvar token de acesso
 */
export const saveAccessToken = async (token: string): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, token);
  } catch (error) {
    console.error('Error saving access token:', error);
    throw error;
  }
};

/**
 * Obter token de acesso
 */
export const getAccessToken = async (): Promise<string | null> => {
  try {
    return await AsyncStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
  } catch (error) {
    console.error('Error getting access token:', error);
    return null;
  }
};

/**
 * Remover token de acesso
 */
export const removeAccessToken = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
  } catch (error) {
    console.error('Error removing access token:', error);
  }
};

/**
 * Salvar refresh token
 * Observação: alguns endpoints não retornam refresh_token.
 * Se token for null/undefined, removemos a chave para evitar erros do AsyncStorage.
 */
export const saveRefreshToken = async (token?: string | null): Promise<void> => {
  try {
    if (!token) {
      await AsyncStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
      return;
    }
    await AsyncStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, token);
  } catch (error) {
    console.error('Error saving refresh token:', error);
    throw error;
  }
};

/**
 * Obter refresh token
 */
export const getRefreshToken = async (): Promise<string | null> => {
  try {
    return await AsyncStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
  } catch (error) {
    console.error('Error getting refresh token:', error);
    return null;
  }
};

/**
 * Salvar dados do usuário
 */
export const saveUser = async (user: User): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
  } catch (error) {
    console.error('Error saving user:', error);
    throw error;
  }
};

/**
 * Obter dados do usuário
 */
export const getUser = async (): Promise<User | null> => {
  try {
    const userJson = await AsyncStorage.getItem(STORAGE_KEYS.USER);
    return userJson ? JSON.parse(userJson) : null;
  } catch (error) {
    console.error('Error getting user:', error);
    return null;
  }
};

/**
 * Remover dados do usuário
 */
export const removeUser = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(STORAGE_KEYS.USER);
  } catch (error) {
    console.error('Error removing user:', error);
  }
};

/**
 * Limpar todos os dados de autenticação
 */
export const clearAuthData = async (): Promise<void> => {
  try {
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.ACCESS_TOKEN,
      STORAGE_KEYS.REFRESH_TOKEN,
      STORAGE_KEYS.USER,
    ]);
  } catch (error) {
    console.error('Error clearing auth data:', error);
  }
};

/**
 * Salvar carrinho (para persistência offline)
 */
export const saveCart = async (cart: any): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.CART, JSON.stringify(cart));
  } catch (error) {
    console.error('Error saving cart:', error);
  }
};

/**
 * Obter carrinho salvo
 */
export const getCart = async (): Promise<any | null> => {
  try {
    const cartJson = await AsyncStorage.getItem(STORAGE_KEYS.CART);
    return cartJson ? JSON.parse(cartJson) : null;
  } catch (error) {
    console.error('Error getting cart:', error);
    return null;
  }
};

/**
 * Limpar carrinho
 */
export const clearCart = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(STORAGE_KEYS.CART);
  } catch (error) {
    console.error('Error clearing cart:', error);
  }
};
