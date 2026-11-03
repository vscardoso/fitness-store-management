/** Link antigo da vitrine (app.provadorfit.com.br/produtos/{id}?store={slug}): continua abrindo a mesma página. */
import { useLocalSearchParams } from 'expo-router';

import ProdutoVitrine from '@/components/vitrine/ProdutoVitrine';

export default function ProdutoPublicoScreen() {
  const { id, store } = useLocalSearchParams<{ id: string; store?: string }>();
  return <ProdutoVitrine store={store} id={id} />;
}
