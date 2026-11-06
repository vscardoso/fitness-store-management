/**
 * Embedded Signup da Meta no app web: carrega o SDK do Facebook, abre a janela de conexão e junta as duas respostas
 * que a Meta devolve separadas:
 *  - o `code` (FB.login com response_type 'code'; vale ~30 s, por isso o servidor troca na hora);
 *  - a mensagem da janela (`WA_EMBEDDED_SIGNUP`) com phone_number_id, waba_id e o evento
 *    (FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING = coexistência com o app do celular).
 * Documentação lida em 05/11/2026 (Embedded Signup, onboarding de usuários do WhatsApp Business app).
 * Só funciona no navegador; no app nativo a tela orienta a abrir pelo navegador.
 */
import { Platform } from 'react-native';
import { parseSignupMessage } from './embeddedSignupMessage';

const SDK_URL = 'https://connect.facebook.net/pt_BR/sdk.js';
const GRAPH_VERSION = 'v23.0';

export interface EmbeddedSignupResult {
  code: string;
  phone_number_id: string;
  waba_id: string;
  business_id: string | null;
  coexistence: boolean;
}

export class EmbeddedSignupCancelled extends Error {}

let sdkPromise: Promise<any> | null = null;

function loadSdk(appId: string): Promise<any> {
  if (Platform.OS !== 'web') return Promise.reject(new Error('A conexão do WhatsApp só funciona no navegador.'));
  const w = window as any;
  if (w.FB) return Promise.resolve(w.FB);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    w.fbAsyncInit = () => {
      w.FB.init({ appId, autoLogAppEvents: true, xfbml: false, version: GRAPH_VERSION });
      resolve(w.FB);
    };
    const s = document.createElement('script');
    s.src = SDK_URL;
    s.async = true;
    s.defer = true;
    s.crossOrigin = 'anonymous';
    s.onerror = () => {
      sdkPromise = null;
      reject(new Error('Não foi possível carregar o botão da Meta. Confira a internet e tente de novo.'));
    };
    document.body.appendChild(s);
  });
  return sdkPromise;
}

/** Abre a conexão da Meta e devolve o que o servidor precisa. Rejeita com EmbeddedSignupCancelled se a pessoa fechar. */
export async function runEmbeddedSignup(appId: string, configId: string): Promise<EmbeddedSignupResult> {
  const FB = await loadSdk(appId);
  return new Promise((resolve, reject) => {
    let code: string | null = null;
    let session: { phone_number_id: string; waba_id: string; business_id: string | null; coexistence: boolean } | null = null;
    let done = false;
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      window.removeEventListener('message', onMessage);
      clearTimeout(timer);
      fn();
    };
    const tryResolve = () => {
      if (code && session) finish(() => resolve({ code: code as string, ...session! }));
    };
    const onMessage = (ev: MessageEvent) => {
      const msg = parseSignupMessage(ev.origin, ev.data);
      if (!msg) return;
      if (msg.kind === 'finish') {
        session = msg;
        tryResolve();
      } else if (msg.kind === 'cancel') {
        finish(() => reject(new EmbeddedSignupCancelled('Conexão cancelada.')));
      } else {
        finish(() => reject(new Error(msg.detail)));
      }
    };
    // a Meta pode demorar; depois de 15 min sem resposta desiste (a pessoa pode tentar de novo)
    const timer = setTimeout(() => finish(() => reject(new Error('A conexão demorou demais. Tente de novo.'))), 15 * 60 * 1000);
    window.addEventListener('message', onMessage);
    FB.login(
      (response: any) => {
        const c = response?.authResponse?.code;
        if (c) {
          code = String(c);
          tryResolve();
          // a mensagem da janela às vezes chega um pouco depois do code
          setTimeout(() => {
            if (!done && !session) finish(() => reject(new Error('A Meta não informou o número conectado. Tente de novo.')));
          }, 20000);
        } else {
          finish(() => reject(new EmbeddedSignupCancelled('Conexão cancelada.')));
        }
      },
      {
        config_id: configId,
        response_type: 'code',
        override_default_response_type: true,
        extras: { setup: {}, featureType: 'whatsapp_business_app_onboarding', sessionInfoVersion: '3' },
      },
    );
  });
}
