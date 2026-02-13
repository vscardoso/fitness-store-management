/**
 * Team Service
 * Gerenciamento de membros da equipe (usuários da loja)
 */

import api from './api';
import {
  UserRole,
  type TeamMember,
  type TeamMemberCreate,
  type TeamMemberUpdate,
  type TeamMemberListResponse,
} from '@/types';

const BASE_URL = '/team';

/**
 * Lista todos os membros da equipe
 */
export async function getTeamMembers(params?: {
  skip?: number;
  limit?: number;
  include_inactive?: boolean;
  role?: UserRole;
}): Promise<TeamMemberListResponse> {
  const response = await api.get<TeamMemberListResponse>(BASE_URL, { params });
  return response.data;
}

/**
 * Busca um membro específico
 */
export async function getTeamMember(userId: number): Promise<TeamMember> {
  const response = await api.get<TeamMember>(`${BASE_URL}/${userId}`);
  return response.data;
}

/**
 * Cria um novo membro da equipe
 */
export async function createTeamMember(data: TeamMemberCreate): Promise<TeamMember> {
  const response = await api.post<TeamMember>(BASE_URL, data);
  return response.data;
}

/**
 * Atualiza um membro da equipe
 */
export async function updateTeamMember(
  userId: number,
  data: TeamMemberUpdate
): Promise<TeamMember> {
  const response = await api.put<TeamMember>(`${BASE_URL}/${userId}`, data);
  return response.data;
}

/**
 * Altera a role de um membro
 */
export async function changeTeamMemberRole(
  userId: number,
  role: UserRole
): Promise<TeamMember> {
  const response = await api.patch<TeamMember>(`${BASE_URL}/${userId}/role`, { role });
  return response.data;
}

/**
 * Reseta a senha de um membro
 */
export async function resetTeamMemberPassword(
  userId: number,
  newPassword: string
): Promise<{ message: string }> {
  const response = await api.patch<{ message: string }>(
    `${BASE_URL}/${userId}/reset-password`,
    { new_password: newPassword }
  );
  return response.data;
}

/**
 * Desativa um membro da equipe
 */
export async function deactivateTeamMember(userId: number): Promise<{ message: string }> {
  const response = await api.delete<{ message: string }>(`${BASE_URL}/${userId}`);
  return response.data;
}

/**
 * Reativa um membro da equipe
 */
export async function activateTeamMember(userId: number): Promise<{ message: string }> {
  const response = await api.patch<{ message: string }>(`${BASE_URL}/${userId}/activate`);
  return response.data;
}

/**
 * Helper: Traduz role para português
 */
export function getRoleLabel(role: UserRole): string {
  const labels: Record<UserRole, string> = {
    [UserRole.ADMIN]: 'Administrador',
    [UserRole.MANAGER]: 'Gerente',
    [UserRole.SELLER]: 'Vendedor',
    [UserRole.CASHIER]: 'Caixa',
  };
  return labels[role] || role;
}

/**
 * Helper: Cor do badge da role
 */
export function getRoleColor(role: UserRole): string {
  const colors: Record<UserRole, string> = {
    [UserRole.ADMIN]: '#8B5CF6',
    [UserRole.MANAGER]: '#3B82F6',
    [UserRole.SELLER]: '#10B981',
    [UserRole.CASHIER]: '#F59E0B',
  };
  return colors[role] || '#6B7280';
}
