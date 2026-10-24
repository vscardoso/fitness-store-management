import { ProvadorLogo } from './ProvadorLogo';

interface FitFlowLogoProps {
  size?: number;
  variant?: 'full' | 'icon' | 'minimal';
  dark?: boolean;
}

/**
 * Nome antigo mantido para os imports existentes: desenha o logo do Provador.
 * Em código novo, use ProvadorLogo.
 */
export function FitFlowLogo({ size = 128 }: FitFlowLogoProps) {
  return <ProvadorLogo size={size} variant="icon" />;
}

export default FitFlowLogo;
