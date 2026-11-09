// node scripts/test-audit-text.mts
import assert from 'node:assert/strict';
import { describeAudit, money } from '../utils/auditText.ts';

let ok = 0;
const t = (nome: string, fn: () => void) => { fn(); ok++; console.log('ok', nome); };
const J = (o: unknown) => JSON.stringify(o);

t('dinheiro em reais', () => {
  assert.equal(money(800), 'R$ 800,00');
  assert.equal(money('1234.5'), 'R$ 1.234,50');
  assert.equal(money(-5), '-R$ 5,00');
});
t('ajuste de saldo diz quem, a conta e de quanto para quanto', () => {
  const r = describeAudit({ action: 'FINANCE_ACCOUNT_ADJUSTED', user_name: 'Alice Borges',
    detail: J({ conta: 'Gaveta', antes: 800, depois: 750, motivo: 'contei de novo' }) });
  assert.equal(r.text, 'Alice Borges corrigiu o saldo da Gaveta de R$ 800,00 para R$ 750,00');
  assert.equal(r.reason, 'contei de novo');
});
t('despesa editada mostra o valor antes e depois', () => {
  const r = describeAudit({ action: 'EXPENSE_UPDATED', user_name: 'Bia',
    detail: J({ nome: 'Luz', antes: { amount: 100 }, depois: { amount: 150 } }) });
  assert.equal(r.text, 'Bia alterou a despesa "Luz": o valor de R$ 100,00 para R$ 150,00');
});
t('produto com preço e custo', () => {
  const r = describeAudit({ action: 'PRODUCT_UPDATED', user_name: 'Caio',
    detail: J({ nome: 'Legging', antes: { sale_price: 10, cost_price: 5 }, depois: { sale_price: 12, cost_price: 6 } }) });
  assert.ok(r.text.includes('o preço de venda de R$ 10,00 para R$ 12,00') && r.text.includes('o custo de R$ 5,00 para R$ 6,00'));
});
t('caixa e fechamento do mês', () => {
  assert.equal(describeAudit({ action: 'CASH_SESSION_OPENED', user_name: 'Dani', detail: J({ corpo: { opening_amount: 100 } }) }).text,
    'Dani abriu o caixa com R$ 100,00');
  assert.equal(describeAudit({ action: 'CASH_MOVEMENT_CREATED', user_name: 'Dani', detail: J({ corpo: { kind: 'withdrawal', amount: 30 } }) }).text,
    'Dani tirou R$ 30,00 do caixa');
  assert.equal(describeAudit({ action: 'MONTH_REOPENED', user_name: 'Eva', detail: J({ ids: { year: 2026, month: 10 } }) }).text,
    'Eva reabriu o mês 10/2026');
});
t('sem nome usa o e-mail e sem ninguém diz "Alguém"', () => {
  assert.ok(describeAudit({ action: 'USER_CREATED', user_email: 'a@b.com', detail: J({ corpo: { full_name: 'Zé' } }) }).text.startsWith('a@b.com cadastrou'));
  assert.ok(describeAudit({ action: 'TRANSFER_DELETED' }).text.startsWith('Alguém apagou'));
});
t('ação desconhecida e detalhe quebrado caem numa frase genérica', () => {
  assert.equal(describeAudit({ action: 'COISA_NOVA_FEITA', user_name: 'Fê', detail: '{quebrado' }).text, 'Fê fez uma ação no sistema (coisa nova feita)');
  assert.equal(describeAudit({ action: 'EXPENSE_CREATED', user_name: 'Fê', detail: null }).reason, null);
});
console.log(`${ok} testes de texto do histórico passaram`);

// ── regra geral e acessos (08/11/2026: "fez uma alteração (login success)" estava errado) ──
{
  const login = describeAudit({ action: 'LOGIN_SUCCESS', user_name: 'Wanessa Santos Cardoso' });
  assert.equal(login.text, 'Wanessa Santos Cardoso entrou no sistema');
  assert.ok(!login.text.includes('alteração'));
  assert.equal(describeAudit({ action: 'CUSTOMER_VIEWED', user_name: 'Alice' }).text, 'Alice abriu a ficha de uma cliente');
  assert.ok(describeAudit({ action: 'LOGIN_FAILED', user_email: 'x@y.com' }).text.includes('x@y.com'));
  const forn = describeAudit({ action: 'ROTA_PUT_SUPPLIERS', user_name: 'Victor', detail: JSON.stringify({
    metodo: 'PUT', rota: '/suppliers/{supplier_id}', nome: 'Loja B', antes: { name: 'Loja A' }, depois: { name: 'Loja B' } }) });
  assert.ok(forn.text.startsWith('Victor alterou o fornecedor “Loja B”') && forn.text.includes('Loja A'), forn.text);
  assert.equal(describeAudit({ action: 'ROTA_DELETE_PRODUCTS', user_name: 'Alice', detail: JSON.stringify({ metodo: 'DELETE', rota: '/products/{product_id}', nome: 'Top Alfa' }) }).text,
    'Alice apagou o produto “Top Alfa”');
  assert.equal(describeAudit({ action: 'ROTA_POST_PRODUCTS_ADJUST_QUANTITY', user_name: 'Alice', detail: JSON.stringify({ metodo: 'POST', rota: '/products/{product_id}/adjust-quantity' }) }).text,
    'Alice ajustou a quantidade de um produto');
  assert.equal(describeAudit({ action: 'ROTA_PATCH_TEAM_ROLE', user_name: 'Victor', detail: JSON.stringify({ metodo: 'PATCH', rota: '/team/{user_id}/role' }) }).text,
    'Victor mudou o papel de uma pessoa');
  assert.equal(describeAudit({ action: 'ROTA_POST_RETURNS', user_name: 'Alice', detail: JSON.stringify({ metodo: 'POST', rota: '/returns/{sale_id}' }) }).text,
    'Alice registrou uma devolução');
  assert.ok(describeAudit({ action: 'COISA_NOVA', user_name: 'Alice' }).text.includes('fez uma ação no sistema'));
  console.log('ok regra geral e acessos');
}
