/**
 * Recursos do app instalado (PWA) no navegador:
 * - useAppIconBadge: número no ícone do app = conversas do WhatsApp da loja sem resposta. Só atualiza com o app aberto
 *   (sem notificação push, o iPhone não acorda o app em segundo plano).
 * - useScreenWakeLock: mantém a tela acesa enquanto `active` (conferência e câmera de bipar). O navegador solta a
 *   trava quando o app sai da tela; ao voltar, pede de novo.
 * Fora do navegador (app nativo) não fazem nada.
 */
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { useAuthStore } from '@/store/authStore';
import { normalizeRole } from '@/utils/roles';
import { useWhatsappUnread } from '@/hooks/useWhatsappUnread';

const nav = (): any => (Platform.OS === 'web' && typeof navigator !== 'undefined' ? navigator : null);

export function useAppIconBadge() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const role = useAuthStore((s) => (s as any).user?.role);
  const enabled = isAuthenticated && normalizeRole(role) !== 'cashier';
  const { data: unread = 0 } = useWhatsappUnread(enabled && !!nav()?.setAppBadge);

  useEffect(() => {
    const n = nav();
    if (!n?.setAppBadge) return;
    const count = enabled ? Number(unread) || 0 : 0;
    (count > 0 ? n.setAppBadge(count) : n.clearAppBadge?.())?.catch?.(() => {});
  }, [enabled, unread]);
}

export function useScreenWakeLock(active: boolean) {
  useEffect(() => {
    const n = nav();
    if (!active || !n?.wakeLock?.request) return;
    let lock: any = null;
    let stopped = false;
    const acquire = async () => {
      try {
        if (!stopped && document.visibilityState === 'visible') lock = await n.wakeLock.request('screen');
      } catch {
        // sem permissão ou bateria fraca: segue sem travar a tela
      }
    };
    const onVisible = () => { if (document.visibilityState === 'visible') acquire(); };
    acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', onVisible);
      lock?.release?.().catch?.(() => {});
    };
  }, [active]);
}
