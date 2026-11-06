// Leitura pura da mensagem da janela da Meta (Embedded Signup). Teste: node scripts/test-embedded-signup.mts
/** Mensagem da janela da Meta: só aceita origem facebook.com e o tipo WA_EMBEDDED_SIGNUP. */
export function parseSignupMessage(origin: string, raw: unknown):
  | { kind: 'finish'; phone_number_id: string; waba_id: string; business_id: string | null; coexistence: boolean }
  | { kind: 'cancel' | 'error'; detail: string }
  | null {
  if (!/^https:\/\/([a-z0-9-]+\.)*facebook\.com$/.test(origin)) return null;
  let data: any = raw;
  if (typeof raw === 'string') {
    try { data = JSON.parse(raw); } catch { return null; }
  }
  if (!data || data.type !== 'WA_EMBEDDED_SIGNUP') return null;
  const event = String(data.event || '');
  if (event.startsWith('FINISH')) {
    const d = data.data || {};
    if (!d.phone_number_id || !d.waba_id) return { kind: 'error', detail: 'A Meta não informou o número conectado.' };
    return {
      kind: 'finish',
      phone_number_id: String(d.phone_number_id),
      waba_id: String(d.waba_id),
      business_id: d.business_id ? String(d.business_id) : null,
      coexistence: event === 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING',
    };
  }
  if (event === 'CANCEL') return { kind: 'cancel', detail: String(data.data?.current_step || '') };
  if (event === 'ERROR') return { kind: 'error', detail: String(data.data?.error_message || 'Erro na Meta.') };
  return null;
}

