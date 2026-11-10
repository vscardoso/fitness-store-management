/**
 * Voltar padrão do app, um só jeito para todas as telas.
 *
 * Voltar é desfazer a última navegação: `router.back()`. Nunca `router.push(origem)` nem `router.replace(origem)`:
 * os dois ABREM outra cópia da tela de origem por cima da pilha (a entrada abre a lista, a lista volta para a entrada,
 * e a seta fica em loop). Só quando não há tela anterior (link direto, página recarregada, app reaberto) é que se vai
 * para a origem informada (`from`) ou para a tela de saída da própria tela.
 *
 * Telas que fecham um fluxo (venda concluída, assistente de cadastro) não usam isto: ficam na lista de exceções do
 * teste `scripts/test-back-navigation.mts`.
 */
export interface BackRouter {
  canGoBack(): boolean;
  back(): void;
  replace(href: any): void;
}

export function goBackOr(router: BackRouter, fallback: string, from?: string | null): void {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace((from || fallback) as any);
}
