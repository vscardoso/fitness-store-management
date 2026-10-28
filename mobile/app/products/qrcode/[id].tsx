/** Tela antiga "QR Code / PDF" (folha com SKU): substituída pela tela única de etiquetas. */
import { Redirect, useLocalSearchParams } from 'expo-router';

export default function QrCodeRedirect() {
  const { id, variantId } = useLocalSearchParams<{ id: string; variantId?: string }>();
  return <Redirect href={{ pathname: '/products/label/[id]', params: variantId ? { id, variantId } : { id } } as any} />;
}
