/**
 * Termos de Uso e Política de Privacidade: situação do usuário logado e aceite.
 */
import api from './api';
import { skipLoading } from '@/utils/apiHelpers';

export interface LegalStatus {
  version: string;
  accepted: boolean;
}

export const getLegalStatus = async (): Promise<LegalStatus> => {
  const { data } = await api.get<LegalStatus>('/legal/status', skipLoading());
  return data;
};

export const acceptLegal = async (version: string): Promise<LegalStatus> => {
  const { data } = await api.post<LegalStatus>('/legal/accept', { version });
  return data;
};
