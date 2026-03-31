/**
 * Hook que retorna as cores corretas para light/dark mode.
 * Usa useColorScheme para detectar o tema do sistema.
 */
import { useColorScheme } from 'react-native';
import { Colors, theme } from '@/constants/Colors';

export type ThemeColors = typeof Colors.light;

export function useThemeColors(): ThemeColors {
  const scheme = useColorScheme();
  return scheme === 'dark' ? Colors.dark : Colors.light;
}

export function useTheme() {
  const colors = useThemeColors();
  return { ...theme, colors };
}
