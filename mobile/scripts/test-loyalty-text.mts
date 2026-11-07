// node scripts/test-loyalty-text.mts
import assert from 'node:assert/strict';
import { describeLoyalty } from '../utils/loyaltyText.ts';

let ok = 0;
const t = (nome: string, fn: () => void) => { fn(); ok++; console.log('ok', nome); };
t('regra de hoje: 1 ponto a cada R$ 10, ponto vale R$ 0,10 = 1% de cashback, sem validade', () => {
  assert.equal(describeLoyalty({ enabled: true, spend_per_point: 10, point_value: 0.1, min_redeem: 0, expiry_days: null }),
    'A cada R$ 10,00 em compras, a cliente ganha 1 ponto. Cada ponto vale R$ 0,10 de desconto (é como 1,0% de cashback). Os pontos não vencem.');
});
t('com validade e mínimo', () => {
  const s = describeLoyalty({ enabled: true, spend_per_point: 20, point_value: 0.5, min_redeem: 50, expiry_days: 90 });
  assert.ok(s.includes('vencem 90 dias depois da compra') && s.includes('a partir de 50 pontos') && s.includes('2,5% de cashback'));
});
t('desligado', () => {
  assert.equal(describeLoyalty({ enabled: false, spend_per_point: 10, point_value: 0.1, min_redeem: 0, expiry_days: null }),
    'Programa desligado: ninguém ganha nem usa pontos.');
});
console.log(`${ok} testes OK`);
