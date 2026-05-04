/**
 * Rota mantida por compatibilidade — redireciona para a lista de produtos.
 * O conceito de "produtos incompletos" foi removido: produtos sem estoque
 * agora aparecem normalmente na lista com is_catalog=true (sem estoque).
 */

import { useEffect } from 'react';
import { useRouter } from 'expo-router';

export default function IncompleteProductsRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/(tabs)/products');
  }, []);

  return null;
}
