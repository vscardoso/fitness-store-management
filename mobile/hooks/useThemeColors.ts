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

/** Cores da caixa de conversas do WhatsApp (claro/escuro seguindo o sistema; balão enviado e destaque usam a cor da marca da loja). */
export function useChatColors(): ChatColors {
  const scheme = useColorScheme();
  const brand = useBrandingColors();
  const base = scheme === 'dark' ? CHAT.dark : CHAT.light;
  return { ...base, bubbleOut: brand.primary, accent: brand.primary };
}
