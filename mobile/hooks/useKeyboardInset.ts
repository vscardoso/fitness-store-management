/**
 * Teclado para folhas, janelas e rodapés colados embaixo.
 *  - app web instalado (PWA): o `pwa-boot` encolhe o app para a área visível, então a altura a somar é 0;
 *  - Safari/Chrome comuns: a área visível (visualViewport) diminui e o rodapé sobe pela parte coberta;
 *  - celular nativo: eventos do teclado do react-native.
 * Regras e medidas em utils/keyboardInset.ts.
 */
import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

import { computeKeyboardInset, isInstalledWebApp, isKeyboardOpen } from '@/utils/keyboardInset';

export interface KeyboardState {
  /** Quanto somar embaixo para ficar acima do teclado */
  inset: number;
  /** Teclado aberto (mesmo quando não há nada a somar): serve para tirar a folga da barra de início do iPhone */
  open: boolean;
}

export function useKeyboardState(enabled: boolean = true): KeyboardState {
  const [state, setState] = useState<KeyboardState>({ inset: 0, open: false });

  useEffect(() => {
    const closed = { inset: 0, open: false };
    if (!enabled) {
      setState(closed);
      return;
    }
    if (Platform.OS === 'web') {
      const vv = typeof window !== 'undefined' ? window.visualViewport : null;
      if (!vv) return;
      const installed = isInstalledWebApp();
      const update = () => {
        const inset = computeKeyboardInset(window.innerHeight, vv.height, vv.offsetTop, installed);
        const open = inset > 0 || isKeyboardOpen(window.screen.height, vv.height);
        setState((s) => (s.inset === inset && s.open === open ? s : { inset, open }));
      };
      update();
      vv.addEventListener('resize', update);
      vv.addEventListener('scroll', update);
      return () => {
        vv.removeEventListener('resize', update);
        vv.removeEventListener('scroll', update);
      };
    }
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvt, (e) => setState({ inset: e.endCoordinates?.height ?? 0, open: true }));
    const hide = Keyboard.addListener(hideEvt, () => setState(closed));
    return () => {
      show.remove();
      hide.remove();
      setState(closed);
    };
  }, [enabled]);

  return state;
}

/**
 * Área que a pessoa está VENDO agora no app web (visualViewport): topo e altura em px.
 * Janela/folha presa embaixo deve caber nessa caixa: com o teclado aberto ela termina acima dele, em qualquer caso
 * (Safari, app instalado, Android). No iPhone instalado a camada da janela (Modal) não encolhe com o teclado,
 * então somar 0 deixava os campos da folha atrás do teclado (05/11/2026, "Nova cor ou tamanho").
 * Fora do web devolve null.
 */
export function useVisibleBox(enabled: boolean = true): { top: number; height: number } | null {
  const [box, setBox] = useState<{ top: number; height: number } | null>(null);
  useEffect(() => {
    if (!enabled || Platform.OS !== 'web' || typeof window === 'undefined' || !window.visualViewport) {
      setBox(null);
      return;
    }
    const vv = window.visualViewport;
    const update = () => {
      const next = { top: Math.round(vv.offsetTop), height: Math.round(vv.height) };
      setBox((b) => (b && b.top === next.top && b.height === next.height ? b : next));
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [enabled]);
  return box;
}

export function useKeyboardInset(enabled: boolean = true): number {
  return useKeyboardState(enabled).inset;
}
