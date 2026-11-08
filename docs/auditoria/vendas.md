# Auditoria independente: vendas e pagamentos (08/11/2026)

Testes: `backend/tests/audit/vendas/test_auditoria_vendas.py` (31 casos; 27 passam, 4 falham por bugs reais do app).
Rodado em SQLite de teste, loja 1. Cenario base: produto R$ 100,00, custo FIFO R$ 40,00, 10 pecas por variacao.
O esperado e calculado no proprio teste (livro simples) e comparado com `/sales`, `money_ledger.period_totals`,
`/dashboard/sales/monthly`, `/sales/reports/top-products`, `/receivables`.

## (a) Cenarios cobertos

| Area | Cenario | Resultado |
|---|---|---|
| Criar/ler/listar | Venda em dinheiro: total, estoque -3, custo 120, lucro 180, livro, GET por id, listas por periodo e por numero | OK |
| Desconto | Desconto no item + na venda + imposto (175,00); receita do livro = total | OK |
| Arredondamento | 3 x 33,333 = 100,00 | OK |
| Formas | cash, pix, debit_card, credit_card, bank_transfer: pagamento gravado | OK |
| Parcelas | credito 6x gravado; 0, 13 e -1 dao 422 | OK |
| Misto | dinheiro + pix + credito parcelado, soma e cada parte gravada | OK |
| Troco | so em dinheiro; gravado = o que ficou; cartao/pix acima do total 400; misto | OK |
| Pagamento insuficiente | 400, nada gravado, estoque e livro intactos | OK |
| Fiado | sem cliente 400; passa do total 400; dinheiro + fiado 3x vira 3 parcelas; cliente inexistente 400 | OK |
| Pontos | sem cliente 400; saldo zerado 400; venda gera pontos; cancelar devolve pontos, total gasto e compras | OK |
| Cancelar | estoque volta, livro zera, segunda vez 400, so admin (vendedora 403), fiado cancela parcelas, motivo obrigatorio 422 | OK (menos 404, ver bug 2) |
| Validacao | 19 corpos invalidos (qtd 0/negativa, preco 0/negativo/texto, descontos e imposto negativos, pagamento 0/negativo, forma invalida, sem itens, sem pagamentos, produto/variacao/cliente inexistente, variacao de outro produto, quantidade 10^12, preco 1e30) | 3 falhas, ver bugs 1 e 3 |
| Desconto maior que a venda | total negativo e recusado (venda e item) | OK |
| Estoque | maior que o saldo 400; ultima peca vende e a seguinte nao; mesma peca em duas linhas (6+6 de 10) recusada sem mexer no estoque | OK |
| Duplicidade | mesmo corpo duas vezes = duas vendas com numeros distintos (documentado, sem idempotencia) | OK |
| Autenticacao | sem login 401/403 | OK |
| Listagem | filtro por cliente, limit 1, limit 0/101 e skip negativo 422, data invalida 422, cancelada aparece como cancelled | OK |
| Listagem | cliente + vendedor juntos | FALHA (bug 4) |
| Listagem | start_date ou end_date sozinhos | FALHA (bug 5) |
| Relatorios | 2 vendas validas + 1 cancelada: monthly, top-products, reports/period, by-period, daily-total batem com o livro (340 / custo 160 / lucro 180) | OK |
| Isolamento | loja B nao le, nao pega recibo, nao cancela, nao lista, nao vende produto nem usa cliente da loja A | OK |
| Valores extremos | precos ate 9.99e15, observacao de 20 mil letras, referencia de 5 mil letras: sem 500 (em SQLite) | OK |

## (b) Bugs confirmados

### 1. Venda sem nenhum item e aceita e gravada (media/alta)
- Passos: `POST /api/v1/sales/` com `items: []` e `payments: [{amount: 100, payment_method: cash}]`.
- Esperado: 400 ("venda sem itens"). Obtido: 201, venda `completed` com subtotal e total 0,00 (o pagamento de 100 vira troco inteiro).
- Efeito: suja a listagem, o numero de vendas e o ticket medio (venda de R$ 0 conta em `count`), e `total_spent`/pontos do cliente se houver.
- Causa: `SaleCreate.items` e `SaleCreate.payments` sem `min_length=1`; o servico nao confere. Sem pagamentos com total 0 tambem passaria.
- Prova: `test_corpos_invalidos_dao_4xx_e_nao_gravam_nada` (caso "sem itens").

### 2. Cancelar venda inexistente (ou de outra loja) responde 400 em vez de 404, com texto sem acento (baixa)
- Passos: `POST /sales/99999999/cancel?reason=x`.
- Esperado: 404 "Venda ... nao encontrada". Obtido: 400 `{"detail":"Venda 99999999 no encontrada"}` (faltam o "a" e o til na mensagem: texto gravado com o caractere perdido em `sale_service.cancel_sale`, e o endpoint decide 404 procurando "nao encontrada", entao nunca casa).
- Efeito: o app nao distingue "nao existe" de "regra de negocio"; mensagem feia para a lojista. Nao ha vazamento entre lojas (continua recusando).
- Prova: `test_cancelar_devolve_estoque_zera_receita_e_nao_cancela_duas_vezes`. Outras mensagens do mesmo arquivo (`create_sale`, `cancel_sale`: "Venda ja esta cancelada", "Estorno") tambem perderam acentos.

### 3. Preco absurdo (1e30) da erro 500 (baixa/media)
- Passos: item com `unit_price: "1e30"` (e pagamento 1). Obtido 500 com a frase generica "Nao conseguimos concluir agora". Esperado 4xx ("valor alto demais").
- `unit_price`, `amount`, descontos e imposto nao tem limite maximo no schema (`Field(gt=0)` apenas). No Postgres, valores acima do `Numeric` da coluna tambem devem estourar; nao deu para testar (so SQLite), mas o mesmo corte falta.
- Prova: caso "preco gigante" do mesmo teste. Obs.: o endpoint tem `except Exception -> 500 ... str(e)`, mas o handler global troca a mensagem.

### 4. Filtro de vendedor ignorado quando vem junto com cliente (baixa)
- Passos: `GET /sales/?customer_id=<c>&seller_id=<vendedor inexistente>`. Esperado: lista vazia. Obtido: a venda da cliente (so vale o primeiro filtro da cadeia if/elif).
- O proprio docstring admite "prioridade". Tambem `customer_id`/`seller_id` ignoram `skip` e `limit` (devolvem tudo).
- Prova: `test_listagem_paginacao_e_filtros`.

### 5. `start_date` ou `end_date` sozinhos sao ignorados em silencio (baixa/media)
- Passos: `GET /sales/?start_date=<daqui a 5 dias>`. Esperado: lista vazia (ou 422). Obtido: devolve as vendas de hoje, como se nao houvesse filtro. Quem filtra "a partir de" no app ve vendas fora do periodo.
- Prova: `test_start_date_sozinho_nao_pode_ser_ignorado`.

## (c) Melhorias sugeridas
- `min_length=1` em itens e pagamentos; maximos (`le`) em preco, quantidade, desconto, imposto, pagamento (as telas ja tem teto de 1.000.000 em outros pontos).
- Chave de idempotencia (header `Idempotency-Key` ou `client_request_id`) para impedir duas vendas no duplo clique/retentativa do app (hoje o GET repete, o POST nao, mas rede ruim + usuario clicando de novo cria 2 vendas).
- Trocar o `except Exception -> 500 detail=str(e)` por log + mensagem amigavel (o handler global ja protege hoje, mas o codigo ainda monta `str(e)`).
- Unificar a listagem de vendas num unico filtro combinavel (periodo, cliente, vendedor, status, forma de pagamento) com paginacao em todos.
- Corrigir as mensagens sem acento em `sale_service.py` e criar `NotFoundError` em vez de procurar texto na mensagem para decidir o 404.
- Vender com `on_account` e primeiro vencimento no passado e aceito (fiado antigo); avaliar se o PDV deve permitir.

## (d) O que nao deu para cobrir
- Postgres (concorrencia real de duas vendas pela ultima peca, overflow de `Numeric`): ja ha `tests/pg/test_concorrencia_vendas_postgres.py`; nao rodei Postgres aqui.
- Venda por maquininha/PIX integrado (`pdv/*`, keep_pending) e desconto automatico por forma de pagamento (`PaymentDiscountService`; o erro dele e engolido por `except Exception: print`).
- Pagar a venda inteira so com pontos, programa de fidelidade desligado, mínimo de resgate e validade (cobertos em `test_fidelidade.py`).
- Devolucao e troca (area de outro auditor) e comprovante/PDF.
- Fuso: venda perto da meia-noite UTC vs Brasil no filtro `start_date/end_date`.
- Venda feita por papel caixa/vendedor alem do teste de cancelamento; limites de taxa (rate limit) nas vendas.
