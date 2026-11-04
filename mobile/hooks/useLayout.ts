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

/** Largura máxima de diálogos de confirmação/alerta no notebook (no celular eles já ocupam a tela com margem). */
export const DESKTOP_DIALOG_MAX = 460;
/** Largura máxima do conteúdo de telas de formulário e de detalhe no notebook (listas e tabelas usam a largura toda). */
export const DESKTOP_CONTENT_MAX = 960;

/** Diálogo centralizado com largura de diálogo no notebook; undefined no celular (nada muda lá). */
export function useDesktopDialogStyle() {
  const { isDesktop } = useLayout();
  // fundo e sombra transparentes: o contêiner do Modal do Paper desenhava uma moldura apagada atrás do cartão
  return isDesktop
    ? ({ width: '100%', maxWidth: DESKTOP_DIALOG_MAX, alignSelf: 'center', paddingHorizontal: 0, backgroundColor: 'transparent', shadowOpacity: 0, elevation: 0 } as const)
    : undefined;
}

/** Coluna centralizada de leitura no notebook para o conteúdo de formulários e detalhes; undefined no celular. */
export function useDesktopContentStyle() {
  const { isDesktop } = useLayout();
  return isDesktop ? ({ width: '100%', maxWidth: DESKTOP_CONTENT_MAX, alignSelf: 'center' } as const) : undefined;
}

/** Largura das folhas (menus que sobem de baixo no celular) quando viram janela no meio da tela do notebook. */
export const DESKTOP_SHEET_MAX = 560;

const SHEET_RADIUS = 24;
const desktopSheet = {
  /** Fundo escuro que, no celular, empurra a folha para baixo: no notebook centraliza. */
  overlay: { justifyContent: 'center', alignItems: 'center', padding: 24 },
  /** Folha em fluxo normal (dentro do overlay acima). */
  sheet: { width: '100%', maxWidth: DESKTOP_SHEET_MAX, alignSelf: 'center', borderRadius: SHEET_RADIUS },
  /** Folha com position absolute presa embaixo: no notebook fica no meio, acima da base. */
  absSheet: {
    left: '50%', right: undefined, width: DESKTOP_SHEET_MAX, marginLeft: -DESKTOP_SHEET_MAX / 2,
    bottom: '8%', borderRadius: SHEET_RADIUS,
  },
} as const;

/**
 * Folhas próprias (sem o BottomSheet do app) viram janela centralizada no notebook.
 * No celular devolve estilos vazios: nada muda lá.
 */
export function useDesktopSheet() {
  const { isDesktop } = useLayout();
  return isDesktop
    ? { isDesktop, overlay: desktopSheet.overlay, sheet: desktopSheet.sheet, absSheet: desktopSheet.absSheet }
    : { isDesktop, overlay: undefined, sheet: undefined, absSheet: undefined };
}

/**
 * Rodapé fixo (botões no pé da tela) no notebook: o fundo continua de ponta a ponta, mas os botões
 * ficam alinhados com a coluna central de DESKTOP_CONTENT_MAX. `base` é o recuo que o rodapé já tem.
 * undefined no celular.
 */
export function useDesktopFooterStyle(base = 16) {
  const { isDesktop, width } = useLayout();
  if (!isDesktop) return undefined;
  const area = width - SIDEBAR_WIDTH;
  return { paddingHorizontal: Math.max(base, (area - DESKTOP_CONTENT_MAX) / 2 + base) };
}
