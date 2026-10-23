import { UserRole } from '@/types';

/** O papel pode chegar como "admin" ou "ADMIN" (sessão antiga salva no aparelho): compara sempre em minúsculas. */
export function normalizeRole(role: unknown): string {
  return String(role ?? '').trim().toLowerCase();
}

export function isAdminRole(role: unknown): boolean {
  return normalizeRole(role) === UserRole.ADMIN;
}

/** Admin ou gerente: vê relatórios, despesas, fornecedores, entradas e o painel financeiro. */
export function isManagerRole(role: unknown): boolean {
  const r = normalizeRole(role);
  return r === UserRole.ADMIN || r === UserRole.MANAGER;
}
