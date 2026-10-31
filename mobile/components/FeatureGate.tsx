import { Redirect } from 'expo-router';
import { FEATURES, type FeatureKey } from '@/constants/features';

/** Tela de funcionalidade que ainda não está no ar: com a chave falsa (constants/features.ts) quem abre o endereço direto volta ao início. */
export default function FeatureGate({ feature, children }: { feature: FeatureKey | FeatureKey[]; children: React.ReactNode }) {
  const on = (Array.isArray(feature) ? feature : [feature]).some((k) => FEATURES[k]);
  if (!on) return <Redirect href="/(tabs)" />;
  return <>{children}</>;
}
