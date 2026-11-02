// Testes das respostas rápidas. Rodar: node scripts/test-quick-reply.mts
import assert from 'node:assert/strict';
import { fillQuickReply, filterQuickReplies, profileFirstName, slashQuery } from '../utils/quickReply.ts';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n += 1; console.log('ok', name); };
const R = (id: number, shortcut: string, text: string) => ({ id, shortcut, text });

t('slashQuery só dispara com "/" no começo e sem espaço', () => {
  assert.equal(slashQuery('/'), '');
  assert.equal(slashQuery('/pre'), 'pre');
  assert.equal(slashQuery('/PRE'), 'pre');
  assert.equal(slashQuery('oi /pre'), null);
  assert.equal(slashQuery('/pre ço'), null);
  assert.equal(slashQuery(''), null);
  assert.equal(slashQuery('//x'), null);
});
t('filtra por atalho e por texto', () => {
  const all = [R(1, 'preco', 'O valor é R$ 99'), R(2, 'troca', 'Trocamos em 7 dias'), R(3, 'oi', 'Olá, {nome}!')];
  assert.deepEqual(filterQuickReplies(all, '').map((r) => r.id), [1, 2, 3]);
  assert.deepEqual(filterQuickReplies(all, 'pre').map((r) => r.id), [1]);
  assert.deepEqual(filterQuickReplies(all, '7 dias').map((r) => r.id), [2]);
  assert.deepEqual(filterQuickReplies(all, 'zzz'), []);
});
t('{nome} com cliente: primeiro nome', () => {
  assert.equal(fillQuickReply('Oi, {nome}! Tudo bem?', 'Wanessa Santos'), 'Oi, Wanessa! Tudo bem?');
  assert.equal(fillQuickReply('{nome}, chegou sua peça. Obrigada, {NOME}', '  maria  '), 'maria, chegou sua peça. Obrigada, maria');
});
t('{nome} sem cliente: some sem deixar pontuação solta', () => {
  assert.equal(fillQuickReply('Oi, {nome}! Tudo bem?', null), 'Oi! Tudo bem?');
  assert.equal(fillQuickReply('{nome}, chegou sua peça.', null), 'Chegou sua peça.');
  assert.equal(fillQuickReply('Olá {nome}, tudo bem?', ''), 'Olá, tudo bem?');
  assert.equal(fillQuickReply('Obrigada {nome}', undefined), 'Obrigada');
  assert.equal(fillQuickReply('Sem variável', null), 'Sem variável');
  assert.ok(!fillQuickReply('{nome}', null).includes('{'));
});
t('{nome} sem cadastro usa o nome do perfil do WhatsApp', () => {
  assert.equal(fillQuickReply('Oi, {nome}! Tudo bem?', null, 'Juliana Souza'), 'Oi, Juliana! Tudo bem?');
  assert.equal(fillQuickReply('Oi, {nome}!', '', 'JULIANA ✨'), 'Oi, Juliana!');
  assert.equal(fillQuickReply('Oi, {nome}!', undefined, 'ana clara'), 'Oi, Ana!');
  assert.equal(fillQuickReply('Oi, {nome}!', 'Maria Lima', 'Juliana'), 'Oi, Maria!');   // cadastro vence o perfil
});
t('perfil que não é nome não vira nome', () => {
  for (const ruim of ['👑', '.', '5534991234567', '', null, undefined, '  ', 'A', '🔥🔥 Loja']) {
    assert.equal(profileFirstName(ruim as any), '', String(ruim));
  }
  assert.equal(fillQuickReply('Oi, {nome}! Tudo bem?', null, '👑'), 'Oi! Tudo bem?');
  assert.equal(profileFirstName('Maria-Clara 💖'), 'Maria-Clara');
  assert.equal(profileFirstName('José'), 'José');
  assert.equal(profileFirstName("d'Ávila"), "d'Ávila");
});
console.log(`${n} testes ok`);
