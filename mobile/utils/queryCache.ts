/**
 * Guarda o QueryClient do app para o cache poder ser limpo ao trocar de loja/conta.
 * Sem isso, as listas da loja anterior (fornecedores, produtos, vendas...) continuavam na tela por até 5 minutos
 * depois de entrar com outra conta no mesmo aparelho, como se fossem da loja nova.
 */
import type { QueryClient } from '@tanstack/react-query';

let client: QueryClient | null = null;

export function registerQueryClient(qc: QueryClient): void {
  client = qc;
}

/** Apaga todo o cache de dados do servidor (consultas e mutações em andamento). */
export function clearQueryCache(): void {
  try {
    client?.cancelQueries();
    client?.clear();
  } catch {
    // sem cache para limpar: nada a fazer
  }
}
