import { Colors } from '@/constants/Colors';
/**
 * Layout para telas de autenticação
 * Redireciona para tabs se já autenticado
 */

import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/store/authStore';
import { useNavReady } from '@/hooks/useNavReady';

export default function AuthLayout() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const navReady = useNavReady();

  // Se já autenticado, redirecionar para tabs
  useEffect(() => {
    if (navReady && isAuthenticated) {
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, navReady]);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.light.white },
      }}
    >
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="login" />
      <Stack.Screen name="signup" />
      <Stack.Screen name="create-store" />
    </Stack>
  );
}
