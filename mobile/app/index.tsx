/**
 * Página inicial do app
 * Redireciona para onboarding (primeira vez), auth ou tabs baseado em autenticação
 */

import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { useAuthStore } from '@/store/authStore';
import { getAccessToken } from '@/services/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ONBOARDING_COMPLETED_KEY = '@fitness_store:onboarding_completed';

export default function Index() {
  const user = useAuthStore((state) => state.user);
  const isLoading = useAuthStore((state) => state.isLoading);
  const logout = useAuthStore((state) => state.logout);
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

  if (isLoading || checking) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color="#667eea" />
      </View>
    );
  }

  // Redirecionar baseado em autenticação
  if (user) {
    return <Redirect href="/(tabs)" />;
  }

  // TODO: Temporário - sempre mostrar onboarding para testes
  // Depois adicionar timestamp ou versão para controlar
  return <Redirect href="/(auth)/onboarding" />;

  // Primeira vez? Mostrar onboarding
  // if (!onboardingCompleted) {
  //   return <Redirect href="/(auth)/onboarding" />;
  // }

  // return <Redirect href="/(auth)/login" />;
}
