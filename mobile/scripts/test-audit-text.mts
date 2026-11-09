// node scripts/test-audit-text.mts
import assert from 'node:assert/strict';
import { auditDetails, describeAudit, money } from '../utils/auditText.ts';

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

// ── ações específicas que caíam em "fez uma ação no sistema (...)" (print de 09/11/2026) ──
{
  const e = describeAudit({ action: 'STOCK_ENTRY_DELETED', user_name: 'Wanessa Santos Cardoso', entity_id: 12 });
  assert.equal(e.text, 'Wanessa Santos Cardoso apagou uma entrada de estoque (número 12)');
  assert.equal(describeAudit({ action: 'STOCK_ADJUSTMENT', user_name: 'Alice', detail: JSON.stringify({ quantity_diff: -2, reason: 'avaria' }) }).text,
    'Alice ajustou o estoque de uma peça (-2 peças): avaria');
  assert.equal(describeAudit({ action: 'USER_ROLE_CHANGED', user_name: 'Victor', detail: JSON.stringify({ target_email: 'a@b.com', old_role: 'cashier', new_role: 'manager' }) }).text,
    'Victor mudou o papel de a@b.com (de caixa para gerente)');
  for (const a of ['ENTRY_ITEM_DELETED','LOYALTY_ADJUSTED','PASSWORD_RESET','CONDITIONAL_SENT','CONDITIONAL_CANCELLED','CONDITIONAL_RETURN_PROCESSED','PDV_SALE_CONFIRMED','PDV_SALE_CANCELLED','PDV_SALE_REFUNDED','PIX_EXPIRED','CIELO_PIX_CONFIRMED'])
    assert.ok(!describeAudit({ action: a, user_name: 'X' }).text.includes('fez uma ação'), a);
  console.log('ok ações específicas com frase própria');
}

t('lançamento no financeiro identifica tipo e valor', () => {
  const item = { action: 'ROTA_POST_FINANCE_ENTRIES', user_name: 'Victor',
    detail: J({ rota: '/finance/entries', metodo: 'POST', corpo: {
      kind: 'owner_withdrawal', amount: 300, account_id: 7, person: 'Maria', occurred_on: '2026-11-08',
    } }) };
  assert.equal(describeAudit(item).text, 'Victor registrou retirada de sócio de R$ 300,00');
  const details = auditDetails(item);
  assert.ok(details.some((d) => d.label === 'Dados informados · Pessoa' && d.value === 'Maria'));
  assert.ok(details.some((d) => d.label === 'Dados informados · Código da conta' && d.value === '7'));
  assert.ok(details.some((d) => d.label === 'Dados informados · Data do lançamento' && d.value === '08/11/2026'));
});
t('fiado antigo soma parcelas e não inventa valor ausente', () => {
  const item = { action: 'RECEIVABLE_OPENING_CREATED', user_name: 'Victor',
    detail: J({ corpo: { customer_id: 2, installments: [
      { amount: '100.10', due_date: '2026-11-08' }, { amount: '200.20', due_date: '2026-12-08' },
    ] } }) };
  assert.equal(describeAudit(item).text, 'Victor lançou um fiado antigo de R$ 300,30');
  assert.ok(auditDetails(item).some((d) => d.label === 'Dados informados · Parcelas · 2 · Valor' && d.value === 'R$ 200,20'));
  assert.equal(describeAudit({ action: 'RECEIVABLE_OPENING_CREATED', user_name: 'Victor' }).text, 'Victor lançou um fiado antigo');
});
t('detalhes incluem todos os campos registrados e protegem segredos', () => {
  const details = auditDetails({ action: 'PRODUCT_UPDATED', detail: J({
    antes: { amount: 10, outro_campo: 'original' }, depois: { amount: 20, outro_campo: 'novo' },
    corpo: { password: 'oculto', nested: { token: 'oculto', quantity: 0 }, ativo: false },
  }) });
  assert.ok(details.some((d) => d.label === 'Antes · outro campo' && d.value === 'original'));
  assert.ok(details.some((d) => d.label === 'Depois · Valor' && d.value === 'R$ 20,00'));
  assert.ok(details.some((d) => d.label === 'Dados informados · nested · Quantidade' && d.value === '0'));
  assert.ok(details.some((d) => d.label === 'Dados informados · ativo' && d.value === 'não'));
  assert.ok(!JSON.stringify(details).includes('oculto'));
  assert.deepEqual(auditDetails({ action: 'LOGIN_SUCCESS' }), []);
});

// ── repasse automático da maquininha: tudo no histórico ──
{
  const lig = describeAudit({ action: 'FINANCE_CARD_AUTO_CHANGED', user_name: 'Alice', detail: JSON.stringify({ enabled: true, banco: 'Nubank' }) });
  assert.equal(lig.text, 'Alice ligou o repasse automático da maquininha (banco Nubank)');
  assert.equal(describeAudit({ action: 'FINANCE_CARD_AUTO_CHANGED', user_name: 'Alice', detail: JSON.stringify({ enabled: false }) }).text,
    'Alice desligou o repasse automático da maquininha');
  const t1 = describeAudit({ action: 'FINANCE_CARD_AUTO_TRANSFER', detail: JSON.stringify({ valor: 100, para: 'Nubank', dia_do_cartao: '2026-11-05' }) });
  assert.equal(t1.text, 'O sistema lançou, sozinho, o repasse de R$ 100,00 da maquininha para Nubank (cartão de 05/11)');
  assert.ok(describeAudit({ action: 'FINANCE_CARD_AUTO_SETTLED', detail: JSON.stringify({ repasses: 2, total: 150, banco: 'Nubank', pulados: 0 }) }).text
    .startsWith('O sistema repassou R$ 150,00 da maquininha para Nubank em 2 lançamentos'));
  assert.ok(describeAudit({ action: 'FINANCE_CARD_AUTO_FAILED', detail: JSON.stringify({ erro: 'banco fora do ar' }) }).text.includes('banco fora do ar'));
  console.log('ok repasse automático da maquininha no histórico');
}
