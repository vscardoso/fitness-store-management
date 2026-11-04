/**
 * Ponto de quebra único do "modo notebook" (docs/PLANO_WEB_NOTEBOOK.md).
 *
 * Só vale no app web: no celular (iOS/Android) `isDesktop` é sempre falso, então nada muda lá.
 * Abaixo de 1024 px de largura o app web também fica igual ao do celular.
 */
import { createElement, useState } from 'react';
import { Platform, View, useWindowDimensions } from 'react-native';

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
/**
 * Largura PADRÃO de todas as telas no PC (pedido do Victor: uma largura só, mesmas margens em tudo):
 * listas, tabelas, formulários, fichas e rodapés. Listas usam a largura em grade de cartões (useDesktopGrid).
 */
export const DESKTOP_CONTENT_MAX = 1200;

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

/**
 * Grade de cartões no PC: quantas colunas cabem e a largura de cada cartão, medindo a largura real
 * da área (onLayout). No celular devolve 1 coluna e `cardStyle` vazio (lista normal, nada muda).
 */
export function useDesktopGrid(minCard = 340, gap = 12) {
  const { isDesktop } = useLayout();
  const [gridW, setGridW] = useState(0);
  const cols = isDesktop && gridW > 0 ? Math.max(1, Math.floor((gridW + gap) / (minCard + gap))) : 1;
  const cardW = cols > 1 ? Math.floor((gridW - gap * (cols - 1)) / cols) : undefined;
  return {
    isGrid: cols > 1,
    cols,
    onLayout: (e: { nativeEvent: { layout: { width: number } } }) => setGridW(e.nativeEvent.layout.width),
    gridStyle: isDesktop ? ({ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap } as const) : undefined,
    cardStyle: cardW ? ({ width: cardW } as const) : undefined,
  };
}

/**
 * Lista (FlatList) em grade de cartões no PC. Uso:
 *   const listGrid = useListGrid();
 *   <FlatList key={listGrid.listKey} {...listGrid.listProps} renderItem={listGrid.wrap(renderCard)} ... />
 * (o key muda com o número de colunas: a FlatList não aceita trocar numColumns sem remontar)
 * `padX` é o recuo lateral do contentContainerStyle da lista. No celular `listProps` é vazio e
 * `wrap` devolve o próprio renderItem: a lista fica exatamente como era.
 */
export function useListGrid(minCard = 340, gap = 12, padX = 16) {
  const { isDesktop } = useLayout();
  const [w, setW] = useState(0);
  const inner = Math.max(0, w - padX * 2);
  const cols = isDesktop && inner > 0 ? Math.max(1, Math.floor((inner + gap) / (minCard + gap))) : 1;
  const cardW = cols > 1 ? Math.floor((inner - gap * (cols - 1)) / cols) : 0;
  const listProps = isDesktop
    ? {
        numColumns: cols,
        onLayout: (e: { nativeEvent: { layout: { width: number } } }) => setW(e.nativeEvent.layout.width),
        ...(cols > 1 ? { columnWrapperStyle: { gap } } : {}),
      }
    : {};
  function wrap<T>(render: (info: T) => any) {
    if (!cardW) return render;
    return (info: T) => createElement(View, { style: { width: cardW } }, render(info));
  }
  return { listProps, listKey: isDesktop ? `grade-${cols}` : undefined, wrap, cols, inner };
}
