/**
 * Página inicial do app
 * Redireciona para onboarding (primeira vez), auth ou tabs baseado em autenticação
 */

import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import { View } from 'react-native';
import { useAuthStore } from '@/store/authStore';
import { useBrandingColors, useBrandingStore } from '@/store/brandingStore';
import { getAccessToken } from '@/services/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '@/constants/Colors';
import { restoreQueryCache } from '@/utils/queryPersist';
import { getQueryClient } from '@/utils/queryCache';
import ScreenLoader from '@/components/ui/ScreenLoader';

const ONBOARDING_COMPLETED_KEY = '@fitness_store:onboarding_completed';

export default function Index() {
  const user = useAuthStore((state) => state.user);
  const isLoading = useAuthStore((state) => state.isLoading);
  const logout = useAuthStore((state) => state.logout);
  const brandingColors = useBrandingColors();
  const brandingSynced = useBrandingStore((state) => state.synced);
  const brandingHydrating = useBrandingStore((state) => state.isHydrating);
  const initialSyncAttempted = useBrandingStore((state) => state.initialSyncAttempted);
  const fetchBrandingFromServer = useBrandingStore((state) => state.fetchFromServer);
  const [checking, setChecking] = useState(true);
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);

  // Verificar se token realmente existe no AsyncStorage
  useEffect(() => {
    const checkAuth = async () => {
      const token = await getAccessToken();
      
      // Se store diz que tem user mas não tem token, limpar
      if (user && !token) {
        await logout();
      }
      
      // Verificar se onboarding já foi concluído
      const completed = await AsyncStorage.getItem(ONBOARDING_COMPLETED_KEY);
      setOnboardingCompleted(completed === 'true');
      
      setChecking(false);
    };

    checkAuth();
  }, []);

  useEffect(() => {
    if (user && !brandingSynced && !initialSyncAttempted && !brandingHydrating) {
      fetchBrandingFromServer().catch(() => {});
    }
  }, [user, brandingSynced, initialSyncAttempted, brandingHydrating, fetchBrandingFromServer]);

  if (isLoading || checking) {
    return (
      <ScreenLoader style={{ backgroundColor: '#fff' }} />
    );
  }

  // Só espera o que está guardado no aparelho; o servidor atualiza as cores por trás (esperar a rede deixava a abertura lenta)
  if (user && brandingHydrating) {
    return (
      <ScreenLoader style={{ backgroundColor: '#fff' }} />
    );
  }

  // Redirecionar baseado em autenticação
  if (user) {
    const qc = getQueryClient();
    if (qc) restoreQueryCache(qc, user.id);
    // Fechou e reabriu o app: sempre começa no início (decisão do Victor, 02/11/2026)
    return <Redirect href="/(tabs)" />;
  }

  // Primeira vez? Mostrar onboarding
  if (!onboardingCompleted) {
    return <Redirect href="/(auth)/onboarding" />;
  }

  return <Redirect href="/(auth)/login" />;
}
