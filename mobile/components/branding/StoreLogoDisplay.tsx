import React from 'react';
import { View, StyleSheet, Image } from 'react-native';
import { FitFlowLogo } from './FitFlowLogo';

interface StoreLogoDisplayProps {
  size?: number;
  logoPath?: string | null;
  showFallback?: boolean;
}

/**
 * Componente para exibir logo da empresa.
 * 
 * Prioridade:
 * 1. Se logoPath está definido → Tenta carregar o logo da empresa
 * 2. Se falhar carregamento → Mostra FitFlowLogo (fallback)
 * 3. Se showFallback=false → Não exibe nada
 */
export function StoreLogoDisplay({
  size = 128,
  logoPath,
  showFallback = true,
}: StoreLogoDisplayProps) {
  const [logoError, setLogoError] = React.useState(false);

  // Se não tem logo path e fallback está desativado, não renderiza nada
  if (!logoPath && !showFallback) {
    return null;
  }

  // Se não tem logo path, mostra FitFlowLogo
  if (!logoPath) {
    return <FitFlowLogo size={size} />;
  }

  // Tenta carregar logo da empresa
  if (!logoError) {
    return (
      <View style={[styles.container, { width: size, height: size }]}>
        <Image
          source={{ uri: logoPath }}
          style={{ width: size, height: size, resizeMode: 'contain' }}
          onError={() => setLogoError(true)}
        />
      </View>
    );
  }

  // Se falhar carregamento e showFallback está ativo, mostra FitFlowLogo
  if (showFallback) {
    return <FitFlowLogo size={size} />;
  }

  return null;
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default StoreLogoDisplay;
