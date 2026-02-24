/**
 * Redirecionamento de compatibilidade → Wizard unificado de produtos.
 *
 * Esta rota foi consolidada em /products/wizard.
 * Mantida aqui apenas para evitar erros em links antigos ou deep links externos.
 */
import { useEffect } from 'react';
import { View } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';

export default function AddProductRedirect() {
  const router = useRouter();
  const { prefillData } = useLocalSearchParams<{ prefillData?: string }>();

  useEffect(() => {
    router.replace({
      pathname: '/products/wizard',
      params: prefillData ? { prefillData } : {},
    });
  }, []);

  return <View />;
}
