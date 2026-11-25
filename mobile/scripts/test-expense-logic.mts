// Regras de texto e agrupamento da tela de Despesas (node scripts/test-expense-logic.mts)
import assert from 'node:assert/strict';
import { accountLine, approvalText, dayLabel, looksLikeOwnerDraw, matchesQuery, withDayHeaders } from '../utils/expenseLogic.ts';

let passed = 0;
function t(name: string, fn: () => void) { fn(); passed++; console.log('ok', name); }

t('parece retirada de sócio, empréstimo ou fatura (sem acento, em qualquer caixa)', () => {
  for (const s of ['Retirada Alice e Wanessa', 'RETIRADA', 'retirou da conta', 'Pró-labore', 'prolabore', 'Sócia Alice', 'socio', 'Empréstimo do banco', 'Fatura do cartão']) {
    assert.equal(looksLikeOwnerDraw(s), true, s);
  }
  for (const s of ['Aluguel', 'Conta de luz', 'Bolo', 'Frete da compra', 'Internet', '']) assert.equal(looksLikeOwnerDraw(s), false, s);
});
t('de onde saiu o dinheiro: conta, sem conta, lote e Financeiro desligado', () => {
  assert.deepEqual(accountLine({ account_id: 3 }, 'Santander', true), { text: 'Saiu de Santander', detail: null, tone: 'ok' });
  assert.equal(accountLine({ account_id: 3 }, undefined, true)!.text, 'Saiu de uma conta');
  const sem = accountLine({}, undefined, true)!;
  assert.equal(sem.text, 'Sem conta'); assert.equal(sem.tone, 'warn'); assert.match(sem.detail!, /não tirou dinheiro de nenhuma conta/);
  assert.equal(accountLine({ stock_entry_id: 9 }, undefined, true)!.text, 'Custo de um lote');
  assert.equal(accountLine({ stock_entry_id: 9, account_id: 1 }, 'Gaveta', true)!.text, 'Custo de um lote');   // lote vence a conta
  assert.equal(accountLine({}, undefined, false), null);                                                       // sem Financeiro não existe "conta"
});
t('pedido de aprovação em andamento, singular e plural', () => {
  assert.equal(approvalText({ id: 1, kind: 'delete', approved_count: 1, required_count: 2 }), 'Pedido para apagar esperando aprovação (aprovaram 1 de 2)');
  assert.equal(approvalText({ id: 1, kind: 'update', approved_count: 2, required_count: 3 }), 'Pedido para mudar esperando aprovação (aprovaram 2 de 3)');
  assert.equal(approvalText({ id: 1, kind: 'delete', approved_count: 0, required_count: 1 }), 'Pedido para apagar esperando aprovação (aprovaram 0 de 1)');
  assert.equal(approvalText({ id: 1, kind: 'delete', approved_count: 0, required_count: 0 }), 'Pedido para apagar esperando aprovação');
});
t('rótulo do dia: Hoje, Ontem ou data com dia da semana', () => {
  assert.equal(dayLabel('2026-11-25', '2026-11-25'), 'Hoje');
  assert.equal(dayLabel('2026-11-24', '2026-11-25'), 'Ontem');
  assert.equal(dayLabel('2026-11-23', '2026-11-25'), '23/11 · segunda');
  assert.equal(dayLabel('2026-11-30', '2026-12-01'), 'Ontem');        // virada de mês
  assert.equal(dayLabel('2026-11-01', '2026-12-01'), '01/11 · domingo');
});
t('um cabeçalho por dia, itens na ordem recebida', () => {
  const e = withDayHeaders([
    { id: 3, expense_date: '2026-11-25' }, { id: 2, expense_date: '2026-11-25' }, { id: 1, expense_date: '2026-11-23' },
  ], '2026-11-25');
  assert.deepEqual(e.map((x) => x.type === 'day' ? `D:${x.label}` : `I:${x.item.id}`), ['D:Hoje', 'I:3', 'I:2', 'D:23/11 · segunda', 'I:1']);
  assert.equal(new Set(e.map((x) => x.key)).size, e.length);
  assert.deepEqual(withDayHeaders([], '2026-11-25'), []);
});
t('busca por descrição, categoria e observação, sem acento', () => {
  const e = { description: 'Conta de luz', category: { name: 'Energia / Água / Internet' }, notes: 'vence dia 10' };
  assert.equal(matchesQuery(e, 'LUZ'), true);
  assert.equal(matchesQuery(e, 'agua'), true);
  assert.equal(matchesQuery(e, 'energia luz'), true);        // todas as palavras
  assert.equal(matchesQuery(e, 'dia 10'), true);
  assert.equal(matchesQuery(e, 'aluguel'), false);
  assert.equal(matchesQuery(e, '   '), true);                // busca vazia mostra tudo
  assert.equal(matchesQuery({ description: 'Bolo' }, 'bolo'), true);
});
console.log(`${passed} testes passaram`);
