/**
 * Serviço de autenticação
 * Login, registro, logout, refresh token
 */

import api from './api';
import { saveAccessToken, saveRefreshToken, saveUser, clearAuthData, getAccessToken } from './storage';
import type { 
  LoginCredentials, 
  RegisterData, 
  AuthResponse, 
  User,
  SignupData,
  SignupResponse,
  CheckEmailResponse,
  CheckSlugResponse,
} from '@/types';

/**
 * Fazer login
 */
export const login = async (credentials: LoginCredentials): Promise<User> => {
  try {
    // Fazer login
    const { data: authData } = await api.post<AuthResponse>('/auth/login', credentials);
    
    // Salvar tokens
    await saveAccessToken(authData.access_token);
    // refresh_token pode não existir no response do backend
    await saveRefreshToken(authData.refresh_token);
    
    // Buscar dados do usuário
    const { data: user } = await api.get<User>('/auth/me');
    
    // Salvar usuário
    await saveUser(user);
    
    return user;
  } catch (error) {
    throw error;
  }
};

/**
 * Registrar novo usuário
 */
export const register = async (userData: RegisterData): Promise<User> => {
  try {
    const { data: user } = await api.post<User>('/auth/register', userData);
    return user;
  } catch (error) {
    throw error;
  }
};

/**
 * Fazer logout
 */
export const logout = async (): Promise<void> => {
  try {
    // Aqui você pode fazer uma chamada ao backend se tiver endpoint de logout
    // await api.post('/auth/logout');
    
    // Limpar dados locais
    await clearAuthData();
  } catch (error) {
    // Mesmo com erro, limpar dados locais
    await clearAuthData();
  }
};

/**
 * Obter dados do usuário atual
 */
export const getCurrentUser = async (): Promise<User> => {
  try {
    const { data } = await api.get<User>('/auth/me');
    await saveUser(data);
    return data;
  } catch (error) {
    throw error;
  }
};

/**
 * Atualizar token (refresh)
 */
export const refreshToken = async (refreshToken: string): Promise<string> => {
  try {
    const { data } = await api.post<AuthResponse>('/auth/refresh', {
      refresh_token: refreshToken,
    });
    
    await saveAccessToken(data.access_token);
    return data.access_token;
  } catch (error) {
    throw error;
  }
};

/**
 * Verificar disponibilidade de email
 */
export const checkEmailAvailability = async (email: string): Promise<CheckEmailResponse> => {
  try {
    const { data } = await api.post<CheckEmailResponse>('/auth/check-email', { email });
    return data;
  } catch (error) {
    throw error;
  }
};

/**
 * Verificar disponibilidade de slug
 */
export const checkSlugAvailability = async (slug: string): Promise<CheckSlugResponse> => {
  try {
    const { data } = await api.post<CheckSlugResponse>('/auth/check-slug', { slug });
    return data;
  } catch (error) {
    throw error;
  }
};

/**
 * Realizar signup completo (usuário + loja + assinatura)
 */
export const signup = async (signupData: SignupData): Promise<User> => {
  try {
    // Guard: prevenir signup se já houver token ativo
    const existingToken = await getAccessToken();
    if (existingToken) {
      throw new Error('Você já está autenticado. Faça logout antes de criar uma nova conta.');
    }
    
    // Fazer signup
    const { data: signupResponse } = await api.post<SignupResponse>('/auth/signup', signupData);
    
    // Salvar tokens
    await saveAccessToken(signupResponse.access_token);
    await saveRefreshToken(signupResponse.refresh_token);
    
    // Buscar dados completos do usuário
    const { data: user } = await api.get<User>('/auth/me');
    
    // Salvar usuário
    await saveUser(user);
    
    return user;
  } catch (error) {
    throw error;
  }
};
