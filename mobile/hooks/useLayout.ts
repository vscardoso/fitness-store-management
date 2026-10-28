/**
 * Ponto de quebra único do "modo notebook" (docs/PLANO_WEB_NOTEBOOK.md).
 *
 * Só vale no app web: no celular (iOS/Android) `isDesktop` é sempre falso, então nada muda lá.
 * Abaixo de 1024 px de largura o app web também fica igual ao do celular.
 */
import { Platform, useWindowDimensions } from 'react-native';

export const DESKTOP_MIN_WIDTH = 1024;
/** Largura da barra lateral do modo notebook. */
export const SIDEBAR_WIDTH = 240;

export function useLayout() {
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= DESKTOP_MIN_WIDTH;
  return { width, isDesktop };
}

export function useIsDesktop(): boolean {
  return useLayout().isDesktop;
}
