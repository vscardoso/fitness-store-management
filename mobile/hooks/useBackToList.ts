import { useCallback } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';

/**
 * Hook para padronizar comportamento do botão "voltar" em telas de detalhe.
 *
 * Estratégia:
 * 1. Se houver param `from`, usa router.replace(from) — navegação explícita de origem.
 * 2. Se houver histórico de navegação (router.canGoBack()), usa router.back() — correto
 *    para fluxos em stack (lista → detalhe → editar → voltar para detalhe).
 * 3. Fallback: router.replace(defaultFallback) — quando não há histórico (deep link).
 *
 * Isso garante que telas acessadas via stack (ex: editar produto a partir do detalhe)
 * voltem corretamente para a tela anterior, sem pular etapas na pilha de navegação.
 */
export function useBackToList(defaultFallback: string = '/(tabs)') {
  const router = useRouter();
  const params = useLocalSearchParams<{ from?: string }>();

  const goBack = useCallback(() => {
    // 1. Origem explícita via param
    if (params.from) {
      router.replace(params.from as any);
      return;
    }
    // 2. Há histórico — voltar normalmente (mantém a pilha intacta)
    if (router.canGoBack()) {
      router.back();
      return;
    }
    // 3. Sem histórico (ex: deep link) — ir para fallback
    router.replace(defaultFallback as any);
  }, [router, params.from, defaultFallback]);

  return { goBack, target: defaultFallback };
}

export default useBackToList;
