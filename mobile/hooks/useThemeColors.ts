/**
 * Hook que retorna as cores corretas para light/dark mode.
 * Usa useColorScheme para detectar o tema do sistema.
 */
import { useColorScheme } from 'react-native';
import { Colors, theme } from '@/constants/Colors';
import { CHAT, ChatColors } from '@/constants/tokens';
import { useBrandingColors } from '@/store/brandingStore';

export type ThemeColors = typeof Colors.light;

export function useThemeColors(): ThemeColors {
  const scheme = useColorScheme();
  return scheme === 'dark' ? Colors.dark : Colors.light;
}

export function useTheme() {
  const colors = useThemeColors();
  return { ...theme, colors };
}

/** Cores da caixa de conversas do WhatsApp (sempre claro; balão enviado e destaque usam a cor da marca da loja). */
export function useChatColors(): ChatColors {
  const brand = useBrandingColors();
  // Decisão do Victor (31/10/2026): a caixa de conversas fica SEMPRE clara, mesmo com o aparelho em escuro. CHAT.dark fica pronto para uma futura opção de aparência.
  const base = CHAT.light;
  return {
    ...base,
    bubbleOut: brand.primary,
    accent: brand.primary,
    // mesmo tom translúcido da marca que a tela já usava (brand.primary + '20')
    label: { ...base.label, primary: { bg: brand.primary + '20', fg: brand.primary } },
  };
}
