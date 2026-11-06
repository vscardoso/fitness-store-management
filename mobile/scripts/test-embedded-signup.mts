// Testes da leitura da mensagem do Embedded Signup da Meta. Rodar: node scripts/test-embedded-signup.mts
import assert from 'node:assert/strict';
import { parseSignupMessage } from '../utils/embeddedSignupMessage.ts';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n += 1; console.log('ok', name); };
const FB = 'https://www.facebook.com';
const fin = (event: string, data: object = { phone_number_id: '111', waba_id: '222', business_id: '333' }) =>
  JSON.stringify({ type: 'WA_EMBEDDED_SIGNUP', event, data });

t('coexistência: evento do app do celular marca coexistence', () => {
  const r = parseSignupMessage(FB, fin('FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING'));
  assert.deepEqual(r, { kind: 'finish', phone_number_id: '111', waba_id: '222', business_id: '333', coexistence: true });
});
t('FINISH comum não é coexistência; aceita objeto além de texto', () => {
  const r = parseSignupMessage(FB, { type: 'WA_EMBEDDED_SIGNUP', event: 'FINISH', data: { phone_number_id: 1, waba_id: 2 } });
  assert.deepEqual(r, { kind: 'finish', phone_number_id: '1', waba_id: '2', business_id: null, coexistence: false });
});
t('origem que não é do Facebook é ignorada (inclusive imitação)', () => {
  assert.equal(parseSignupMessage('https://evil.com', fin('FINISH')), null);
  assert.equal(parseSignupMessage('https://facebook.com.evil.com', fin('FINISH')), null);
  assert.equal(parseSignupMessage('http://www.facebook.com', fin('FINISH')), null);
});
t('outro tipo de mensagem ou JSON quebrado é ignorado', () => {
  assert.equal(parseSignupMessage(FB, JSON.stringify({ type: 'OUTRA', event: 'FINISH' })), null);
  assert.equal(parseSignupMessage(FB, '{quebrado'), null);
});
t('cancelar, erro e FINISH sem número', () => {
  assert.equal(parseSignupMessage(FB, JSON.stringify({ type: 'WA_EMBEDDED_SIGNUP', event: 'CANCEL', data: {} }))?.kind, 'cancel');
  assert.deepEqual(parseSignupMessage(FB, JSON.stringify({ type: 'WA_EMBEDDED_SIGNUP', event: 'ERROR', data: { error_message: 'x' } })), { kind: 'error', detail: 'x' });
  assert.equal(parseSignupMessage(FB, fin('FINISH', { waba_id: '2' }))?.kind, 'error');
});
console.log(`${n} testes ok`);
