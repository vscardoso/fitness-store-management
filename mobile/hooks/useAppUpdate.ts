import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { AUTO_RELOAD_AFTER_HIDDEN_MS, hasNewVersion, shouldAutoReload } from '@/utils/appUpdate';

const CHECK_EVERY_MS = 5 * 60 * 1000;

/**
 * Só no app web: confere de tempos em tempos se há versão nova publicada. Quando há:
 * - volta de ficar escondido por mais de 1 minuto: recarrega sozinho;
 * - em uso: devolve updateAvailable para mostrar o aviso "Atualizar".
 */
export function useAppUpdate() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const hiddenAt = useRef<number | null>(null);
  const availableRef = useRef(false);

  const reload = useCallback(() => {
    if (typeof window !== 'undefined') window.location.reload();
  }, []);

  const check = useCallback(async () => {
    try {
      const current = (window as any).__APP_BUILD__ as string | undefined;
      const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) return;
      const remote = (await res.json())?.build as string | undefined;
      const novo = hasNewVersion(current, remote);
      availableRef.current = novo;
      setUpdateAvailable(novo);
    } catch {
      // sem rede ou arquivo ausente: tenta de novo na próxima vez
    }
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    check();
    const timer = setInterval(check, CHECK_EVERY_MS);
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt.current = Date.now();
        return;
      }
      const hiddenFor = hiddenAt.current ? Date.now() - hiddenAt.current : 0;
      hiddenAt.current = null;
      if (shouldAutoReload(availableRef.current, hiddenFor)) {
        reload();
        return;
      }
      check();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [check, reload]);

  return { updateAvailable, reload, autoReloadAfterMs: AUTO_RELOAD_AFTER_HIDDEN_MS };
}
