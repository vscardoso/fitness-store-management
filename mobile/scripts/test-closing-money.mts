// node scripts/test-closing-money.mts
import assert from 'node:assert/strict';
import { parseSignedMoney, signedMoneyInput, toMoneyField } from '../utils/cashMoney.ts';

assert.equal(signedMoneyInput('-5000', true), '-50,00');
assert.equal(signedMoneyInput('-5000', false), '50,00');      // gaveta não fica negativa
assert.equal(signedMoneyInput('-', true), '-');
assert.equal(signedMoneyInput('', true), '');
assert.equal(signedMoneyInput('123456', true), '1.234,56');
assert.equal(parseSignedMoney('-50,00'), -50);
assert.equal(parseSignedMoney('1.234,56'), 1234.56);
assert.equal(parseSignedMoney('0,00'), 0);
assert.equal(parseSignedMoney('-'), null);
assert.equal(parseSignedMoney('abc'), null);
assert.equal(toMoneyField(12.5), '12,50');
assert.equal(toMoneyField(-50), '-50,00');
assert.equal(toMoneyField(0), '0,00');
assert.equal(toMoneyField(1234.56), '1.234,56');
for (const n of [0, 0.01, 7, 99.99, 1234.56, -0.5, -1200]) assert.equal(parseSignedMoney(toMoneyField(n)), n);
console.log('closing money: 19 ok');
