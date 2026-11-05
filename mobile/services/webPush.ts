/**
 * Notificações do app instalado (Web Push). No iPhone só existe com o app na tela de início (iOS 16.4+),
 * e a permissão só pode ser pedida a partir de um toque.
 */
import { Platform } from 'react-native';
import api from './api';

export type WebPushState = 'unsupported' | 'needs-install' | 'server-off' | 'denied' | 'off' | 'on';

const w = (): any => (Platform.OS === 'web' && typeof window !== 'undefined' ? window : null);

function isIos(): boolean {
  const n = w()?.navigator;
  return !!n && /iphone|ipad|ipod/i.test(n.userAgent || '');
}

function installed(): boolean {
  const win = w();
  return !!win && ((win.navigator as any).standalone === true || !!win.matchMedia?.('(display-mode: standalone)').matches);
}

function keyToBytes(base64url: string): Uint8Array {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function registration(): Promise<any | null> {
  const sw = w()?.navigator?.serviceWorker;
  if (!sw) return null;
  return (await sw.getRegistration()) || (await sw.register('/sw.js'));
}

export async function getWebPushState(): Promise<WebPushState> {
  const win = w();
  if (!win) return 'unsupported';
  if (!('serviceWorker' in win.navigator) || !('PushManager' in win) || !('Notification' in win)) {
    return isIos() && !installed() ? 'needs-install' : 'unsupported';
  }
  const { data } = await api.get('/notifications/web-push/key', { headers: { 'X-Skip-Loading': 'true' } });
  if (!data?.enabled) return 'server-off';
  if (win.Notification.permission === 'denied') return 'denied';
  const reg = await registration();
  const sub = await reg?.pushManager?.getSubscription();
  return sub && win.Notification.permission === 'granted' ? 'on' : 'off';
}

/** Chamar a partir de um toque (exigência do iPhone). */
export async function enableWebPush(): Promise<WebPushState> {
  const win = w();
  if (!win) return 'unsupported';
  const { data } = await api.get('/notifications/web-push/key', { headers: { 'X-Skip-Loading': 'true' } });
  if (!data?.enabled || !data.public_key) return 'server-off';
  const perm = await win.Notification.requestPermission();
  if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'off';
  const reg = await registration();
  const sub = (await reg.pushManager.getSubscription())
    || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(data.public_key) }));
  const json = sub.toJSON();
  await api.post('/notifications/web-push/subscribe', { endpoint: json.endpoint, keys: json.keys });
  return 'on';
}

export async function disableWebPush(): Promise<WebPushState> {
  const reg = await registration();
  const sub = await reg?.pushManager?.getSubscription();
  if (sub) {
    await api.post('/notifications/web-push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
    await sub.unsubscribe();
  }
  return 'off';
}
