import { useEffect } from 'react';
import { useRouter, useSegments } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import { getLegalStatus } from '@/services/legalService';

// Telas que não exigem o aceite: a própria tela de aceite, os textos e as telas sem login
export const LEGAL_FREE_ROUTES = new Set(['aceite-termos', 'termos', 'privacidade', '(auth)']);

/**
 * Leva para a tela de aceite quem está logado e ainda não aceitou a versão atual dos termos.
 * Se a consulta falhar (sem rede), não bloqueia: tenta de novo na próxima abertura.
 */
export function LegalGate() {
  const router = useRouter();
  const segments = useSegments();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { data } = useQuery({
    queryKey: ['legal-status'],
    queryFn: getLegalStatus,
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const first = segments[0] as string | undefined;
  useEffect(() => {
    if (!isAuthenticated || !data || data.accepted) return;
    if (first && LEGAL_FREE_ROUTES.has(first)) return;
    router.replace('/aceite-termos');
  }, [isAuthenticated, data, first, router]);

  return null;
}

export default LegalGate;
