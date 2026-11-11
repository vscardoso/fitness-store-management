/** Aviso de peça duplicada na conferência (utils/duplicateScan.ts). */
import assert from 'node:assert/strict';
import { duplicateMessage, needsDuplicateConfirm } from '../utils/duplicateScan.ts';

let ok = 0;
const t = (nome: string, fn: () => void) => { fn(); ok += 1; console.log('ok -', nome); };

t('a primeira bipada da peça conta direto', () => assert.equal(needsDuplicateConfirm(0, true), false));
t('a segunda bipada da mesma peça pede confirmação', () => {
  assert.equal(needsDuplicateConfirm(1, true), true);
  assert.equal(needsDuplicateConfirm(5, true), true);
});
t('com o aviso desligado a pessoa conta várias iguais seguidas', () => {
  assert.equal(needsDuplicateConfirm(1, false), false);
  assert.equal(needsDuplicateConfirm(9, false), false);
});
t('a frase diz quantas já foram contadas e que é duplicada', () => {
  assert.match(duplicateMessage('Legging · Preto · M', 1, 3), /Legging · Preto · M já foi bipada \(1 de 3\)\. Duplicada/);
  assert.match(duplicateMessage('Top · P', 2, null), /já foi bipada \(2\)\./);
  assert.match(duplicateMessage('Top · P', 2, 0), /já foi bipada \(2\)\./);
});
console.log(`\n${ok} testes de duplicada OK`);
