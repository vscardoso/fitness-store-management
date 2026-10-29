/**
 * Altura do teclado que cobre a parte de baixo da tela, para folhas e janelas que ficam coladas embaixo.
 *  - app web no iPhone: o teclado NÃO diminui a janela, só a área visível (visualViewport);
 *  - Android/Chrome: a janela já encolhe sozinha, então devolve 0;
 *  - celular nativo: eventos do teclado do react-native.
 */
import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

export function useKeyboardInset(enabled: boolean = true): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setInset(0);
      return;
    }
    if (Platform.OS === 'web') {
      const vv = typeof window !== 'undefined' ? window.visualViewport : null;
      if (!vv) return;
      const update = () => {
        const covered = Math.round(window.innerHeight - vv.height - vv.offsetTop);
        setInset(covered > 80 ? covered : 0);
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
    const show = Keyboard.addListener(showEvt, (e) => setInset(e.endCoordinates?.height ?? 0));
    const hide = Keyboard.addListener(hideEvt, () => setInset(0));
    return () => {
      show.remove();
      hide.remove();
      setInset(0);
    };
  }, [enabled]);

  return inset;
}
