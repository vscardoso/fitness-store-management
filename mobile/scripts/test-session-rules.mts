/**
 * Regras da sessão (utils/sessionRules.ts): o que derruba e o que NÃO derruba o login.
 * Caso real de 10/11/2026: renovação duplicada entre abas, 429 e rede apagavam a sessão da dona da loja.
 */
import assert from 'node:assert/strict';
import {
  IDLE_LIMIT_MS, REFRESH_ATTEMPTS, isIdleExpired, refreshFailureKind, refreshRetryDelayMs, sentTokenIsStale,
} from '../utils/sessionRules.ts';

let ok = 0;
const t = (nome: string, fn: () => void) => { fn(); ok += 1; console.log('ok -', nome); };

const HORA = 60 * 60 * 1000;

t('o limite de inatividade é de 2 horas', () => assert.equal(IDLE_LIMIT_MS, 2 * HORA));

t('quem usou há pouco nunca é derrubado, mesmo com a sessão aberta há muito tempo', () => {
  const agora = 10 * HORA;
  assert.equal(isIdleExpired(agora, agora - 5 * 60 * 1000), false);
  assert.equal(isIdleExpired(agora, agora - (2 * HORA - 1000)), false);
});

t('só depois de 2 horas sem uso a sessão acaba', () => {
  const agora = 10 * HORA;
  assert.equal(isIdleExpired(agora, agora - 2 * HORA), false); // exatamente no limite ainda vale
  assert.equal(isIdleExpired(agora, agora - (2 * HORA + 1)), true);
  assert.equal(isIdleExpired(agora, agora - 5 * HORA), true);
});

t('sessão sem registro de uso (anterior ao controle) não é derrubada', () => {
  assert.equal(isIdleExpired(Date.now(), 0), false);
  assert.equal(isIdleExpired(Date.now(), null), false);
  assert.equal(isIdleExpired(Date.now(), undefined), false);
  assert.equal(isIdleExpired(Date.now(), NaN), false);
});

t('só o servidor dizendo que o token não vale encerra a sessão', () => {
  assert.equal(refreshFailureKind(401), 'definitive');
  assert.equal(refreshFailureKind(403), 'definitive');
  assert.equal(refreshFailureKind(400), 'definitive');
});

t('limite de pedidos, servidor reiniciando e rede fora NÃO encerram a sessão', () => {
  assert.equal(refreshFailureKind(429), 'transient');
  assert.equal(refreshFailureKind(500), 'transient');
  assert.equal(refreshFailureKind(502), 'transient');
  assert.equal(refreshFailureKind(503), 'transient');
  assert.equal(refreshFailureKind(504), 'transient');
  assert.equal(refreshFailureKind(undefined), 'transient'); // sem resposta = rede
  assert.equal(refreshFailureKind(0), 'transient');
  assert.equal(refreshFailureKind(null), 'transient');
});

t('a espera entre tentativas cresce e respeita o Retry-After (máx. 5 s)', () => {
  assert.equal(refreshRetryDelayMs(0), 1000);
  assert.equal(refreshRetryDelayMs(1), 2000);
  assert.equal(refreshRetryDelayMs(2), 4000);
  assert.equal(refreshRetryDelayMs(9), 4000);
  assert.equal(refreshRetryDelayMs(0, '3'), 3000);
  assert.equal(refreshRetryDelayMs(0, 60), 5000);
  assert.equal(refreshRetryDelayMs(1, 'abc'), 2000);
  assert.ok(REFRESH_ATTEMPTS >= 2);
});

t('pedido enviado com token que já não é o guardado é repetido, não derruba a sessão nova', () => {
  // entrou de novo no meio do caminho: o pedido velho volta 401, mas o token guardado já é o da sessão nova
  assert.equal(sentTokenIsStale('Bearer VELHO', 'NOVO'), true);
  // o pedido saiu com o token de agora: 401 de verdade, segue para a renovação
  assert.equal(sentTokenIsStale('Bearer NOVO', 'NOVO'), false);
  // sem token guardado ou sem cabeçalho: não há o que repetir
  assert.equal(sentTokenIsStale('Bearer VELHO', null), false);
  assert.equal(sentTokenIsStale(undefined, 'NOVO'), false);
});

console.log(`\n${ok} testes de sessão OK`);
