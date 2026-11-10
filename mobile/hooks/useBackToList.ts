import { useCallback } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { goBackOr } from '@/utils/navBack';

/**
 * Hook para padronizar comportamento do botão "voltar" em telas de detalhe.
 *
 * Estratégia (utils/navBack.goBackOr):
 * 1. Se houver histórico de navegação (router.canGoBack()), usa router.back() — correto
 *    para fluxos em stack (lista → detalhe → editar → voltar para detalhe).
 * 2. Sem histórico (deep link, página recarregada): vai para o param `from` ou, se não houver, para o fallback.
 *
 * Nunca empurra a origem por cima da pilha (isso criava loop entre detalhe e lista).
 */
export function useBackToList(defaultFallback: string = '/(tabs)') {
  const router = useRouter();
  const params = useLocalSearchParams<{ from?: string }>();

  const goBack = useCallback(() => {
    // Padrão do app (utils/navBack): há tela anterior = voltar a ela; sem histórico (link direto, recarregou) =
    // origem informada em `from` ou a tela de saída. router.replace(from) ABRIA outra cópia da origem por cima da
    // pilha e a seta ficava em loop (entrada <-> lista).
    goBackOr(router, defaultFallback, params.from);
  }, [router, params.from, defaultFallback]);

  return { goBack, target: defaultFallback };
}

export default useBackToList;
