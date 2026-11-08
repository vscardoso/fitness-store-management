# Auditoria do Financeiro (08/11/2026)

Testes: `backend/tests/audit/financeiro/test_audit_financeiro.py` (9 testes + 3 sementes do livro). Rodados em SQLite próprio, só esta pasta. Resultado final: 7 passam, 2 falham por BUG do app (abaixo), 1 xfail (decisão de produto).

## (a) Cenários cobertos

- **Livro independente** (sementes 7, 2026, 31415; 38 operações aleatórias cada): vendas em dinheiro, PIX, crédito e débito, devolução total pela forma original, transferências entre as 4 contas, despesa com conta, conta a pagar (criar, pagar por qualquer conta, desfazer), retirada de sócio e fatura do cartão, empréstimo dado e "recebi de volta" (nome com caixa diferente), repasse da maquininha com taxa (0, 2 e 3 por cento), apagar transferência (inclusive repasse: a taxa volta junto), apagar lançamento. Depois de CADA passo compara com `GET /finance/accounts` o saldo de Gaveta, Maquininha, Nubank (PIX), Itaú, o total, e confere `card_schedule` (anterior + dias = saldo da maquininha). Resultado: bate em todos os passos, sem divergência.
- **Erros sem 500** (cerca de 90 entradas ruins): antes de implantar, setup com lixo (data, NaN, Infinity, 1e30, bancos repetidos, contas a pagar ruins), transferência (valor 0, negativo, texto, data futura, antes do corte, mesma conta, conta inexistente), repasse (maior que as vendas, maior que o saldo, banco errado), conta a pagar (valor, data, fornecedor e categoria inexistentes), pagar/desfazer/cancelar em estados errados, lançamentos com tipo inválido, empréstimo acima do aberto, mês/ano absurdos no fechamento.
- **Isolamento entre lojas** (duas lojas reais, sem override de tenant): B não vê, não paga, não cancela, não desfaz, não transfere de/para, não apaga transferência, não troca PIX, não lança entrada nem repassa para contas de A; A segue intacta.
- **Mês fechado**: pagar, desfazer pagamento, repassar recusam com 409 "já foi fechado"; antes do corte recusa; reabrir libera.
- **Suposição do fiado** (`projection`): fórmulas conferem; venda no fiado entra na suposição e não no saldo. Papéis: caixa não acessa; gerente não reabre mês.

## (b) BUGS confirmados

1. **Despesa com conta é aceita (e editável) em mês já fechado** (gravidade média). Passos: implantar com corte no mês passado, fechar o mês passado, `POST /expenses` com `expense_date` dentro dele e `account_id` da gaveta. Esperado: 409 "já foi fechado" (como transferência, pagamento e entradas). Obtido: 201, e `PUT /expenses/{id}` com valor 500 também 200; o saldo do mês fechado muda por fora da fotografia. Testes: `test_mes_fechado_e_datas` e `test_despesa_com_conta_em_mes_fechado_nao_pode_ser_editada_nem_apagada` (o DELETE não foi verificado porque o PUT já falhou antes).
2. **500 com id de conta que não é número** (gravidade média-baixa). `POST /finance/transfers` com `from_account_id:"abc"`, `POST /finance/card-settlement` com `to_account_id:"abc"` e `POST /finance/payables/{id}/pay` com `account_id:"abc"` dão `ValueError` não tratado (`int(...)` sem try, em `transfer`, `settle_card` e `pay_payable`; `create_entry` já trata). Esperado: 400 "Escolha a conta". Teste: `test_erros_nunca_500`.
3. **500 em `POST /finance/setup`** (baixa). `cash_balance:"NaN"` estoura `InvalidOperation` (a comparação `v < 0` em `money()` fica fora do try); `banks:[1]` estoura `AttributeError` (`b.get` em item que não é objeto). Esperado: 400 com frase. Teste: `test_erros_nunca_500`.

## (c) Melhorias / decisões

- Transferência comum aceita valor acima do saldo (gaveta com R$ 150 transfere R$ 99.999 e fica negativa); só o repasse da maquininha recusa. Está documentado como "saldo pode ficar negativo", então virou `xfail`: decidir se transferência da gaveta deveria pedir confirmação ou recusar.
- Validação de corpo é por `Dict[str, Any]` sem schema: cada campo novo repete a chance de 500; um helper `as_int(value, "conta")` em `finance_service.py` resolveria o item 2 de uma vez.
- Venda ou devolução lançada com data em mês fechado só aparece como `changed_since_close` (por desenho, conferido em `test_fechamento_mes`).

## (d) Não coberto

- Venda e devolução com data retroativa na sequência aleatória (só pagamentos de hoje); devolução parcial e troca (`exchange_sale_id`) no livro; fiado recebido (`receivables_received`) no livro.
- Fechamento do mês no livro (quebra, ajuste, `changed_since_close`) além do que `test_fechamento_mes` já cobre.
- Concorrência (só Postgres, fora do escopo SQLite); feriado na previsão do cartão (a regra não considera feriado); previsão do cartão por dia com devoluções antigas.
- Delete de despesa em mês fechado (o teste para no PUT).
