import { useCallback } from 'react';
import { useLocalSearchParams, useRouter, useSegments } from 'expo-router';

/**
 * Hook para padronizar comportamento do botão "voltar" em telas de detalhe.
 * 1. Se houver param `from`, usa ele.
 * 2. Caso contrário, infere rota pai pelos segmentos (ex: /entries/5 -> /entries)
 * 3. Fallback final para dashboard (/(tabs))
 */
export function useBackToList(defaultFallback: string = '/(tabs)') {
  const router = useRouter();
  const params = useLocalSearchParams<{ from?: string }>();
  const segments = useSegments();

  const inferredParent = segments.length > 1 ? '/' + segments.slice(0, -1).join('/') : undefined;
  const target = params.from || inferredParent || defaultFallback;

  const goBack = useCallback(() => {
    // Usar replace para evitar empilhar histórico residual
    router.replace(target);
  }, [router, target]);

  return { goBack, target };
}

export default useBackToList;
