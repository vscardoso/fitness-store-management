/**
 * Guarda o QueryClient do app para o cache poder ser limpo ao trocar de loja/conta.
 * Sem isso, as listas da loja anterior (fornecedores, produtos, vendas...) continuavam na tela por até 5 minutos
 * depois de entrar com outra conta no mesmo aparelho, como se fossem da loja nova.
 */
import type { QueryClient } from '@tanstack/react-query';
import { clearLastRoute } from './lastRoute';
import { clearPersistedCache } from './queryPersist';

let client: QueryClient | null = null;

export function getQueryClient(): QueryClient | null {
  return client;
}

export function registerQueryClient(qc: QueryClient): void {
  client = qc;
}

/** Apaga todo o cache de dados do servidor (consultas e mutações em andamento). */
export function clearQueryCache(): void {
  clearLastRoute(); // troca de conta ou saída: a próxima abertura começa no início
  clearPersistedCache(); // e sem os dados da conta anterior
  try {
    client?.cancelQueries();
    client?.clear();
  } catch {
    // sem cache para limpar: nada a fazer
  }
}
