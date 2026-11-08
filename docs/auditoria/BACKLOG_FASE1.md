# Backlog Fase 1: dinheiro 100% confiável (08/11/2026)

Fontes: `docs/auditoria/{vendas,devolucoes,caixa_fiado,financeiro,consistencia}.md` e testes em `backend/tests/audit/`. O relatório `papeis.md` NÃO existia na consolidação (há testes em `tests/audit/papeis/`, sem relatório): quando sair, entra como Fase 1b.
Confirmação: li os relatórios e conferi o código citado (linhas abaixo vistas em 08/11/2026). Não rodei a suíte.

Total: 25 itens. CRÍTICO 3 | ALTO 5 | MÉDIO 12 | BAIXO 5.

Comando de teste (sempre banco próprio por dev, trocar o nome do .db):
`cd backend; TEST_DATABASE_URL=sqlite+aiosqlite:///./test_<dev>.db SECRET_KEY=abcdefghijklmnopqrstuvwxyz0123456789 DATABASE_URL=sqlite:///./test_<dev>.db ENVIRONMENT=test ./venv/Scripts/python.exe -m pytest <alvo> -q --no-cov -p no:cacheprovider -W ignore`

---

## ÁREA A: devoluções, estorno e troca

Arquivos que o dev A pode editar: `backend/app/services/return_service.py`, `backend/app/api/v1/endpoints/returns.py`, `backend/app/schemas/return*.py`, o modelo/migração de `sale_sources`/`ReturnItem` SÓ para o item B-05 (migração aditiva), `backend/tests/audit/devolucoes/`.
Ordem: B-02, B-01, B-03, B-05, B-04. (B-01 e B-03 mexem no mesmo cálculo: fazer juntos depois de B-02.)

### B-01 Estorno ignora o desconto dado no item. CRÍTICO
- Onde: `return_service.py:163-187` (elegibilidade) e `:304-340` (process_return): usa `quantidade x unit_price` e só aplica o desconto da VENDA (percentual), nunca `SaleItem.discount_amount`.
- Reproduzir: vender 2 peças de R$ 100 com `discount_amount` 40 no item (cliente paga R$ 160); devolver as 2.
- Esperado: estorno R$ 160,00. Obtido: R$ 200,00 (com desconto no item e na venda: R$ 350,48 para item pago R$ 262,86); receita líquida da venda fica negativa.
- Aceite: passam `tests/audit/consistencia/...::test_devolucao_de_item_com_desconto_no_item_nao_devolve_mais_do_que_foi_pago` e `::test_devolucao_com_desconto_no_item_e_na_venda`. Regra nova: valor pago da linha = `(qtd x preço - desconto do item) x (1 - desconto da venda %)`; estorno = proporção da quantidade devolvida sobre esse valor; `max_refund_amount` da elegibilidade usa a mesma conta. Soma de estornos de uma linha nunca passa do pago da linha. Exemplo: 2 x 100 com 40 de desconto, devolver 1 = 80,00 e depois 1 = 80,00.
- Risco: muda valores de elegibilidade que o app mostra; devoluções antigas já gravadas não mudam; conferir `money_ledger` (receita líquida) e pontos de fidelidade proporcionais.

### B-02 Mesmo item repetido no corpo da devolução devolve mais que o vendido. CRÍTICO
- Onde: `return_service.py:321-325`: cada linha é validada contra `available` sem somar as linhas anteriores do mesmo `sale_item_id`.
- Reproduzir: venda de 5 x R$ 100; `POST /returns/{id}` com `[{X, qtd 3, restock false}, {X, qtd 3, restock false}]`.
- Esperado: 400 "excede o disponível (6 > 5)". Obtido: 201, reembolso R$ 600 numa venda de R$ 500; receita do mês -R$ 100, status `refunded`.
- Aceite: passa `tests/audit/devolucoes/test_devolucoes_audit.py::test_item_repetido_com_defeito_nao_pode_passar_do_vendido`; o teste do caso com restock continua passando e agora a mensagem é a de "excede o disponível" (não "fontes esgotadas"). Pode somar por `sale_item_id` antes de validar (ou recusar item duplicado).
- Risco: baixo; app não envia duplicado.

### B-03 Centavo do estorno com desconto: soma das devoluções passa do pago. MÉDIO (DECISÃO D-01)
- Onde: `return_service.py:186` e `:335` (`quantize` do desconto de cada peça sem compensação).
- Reproduzir: 3 x R$ 100 com R$ 10 de desconto na venda (pago R$ 290,00); devolver 1 peça, 3 vezes.
- Esperado: soma dos estornos = 290,00. Obtido: 290,01 (96,67 x 3).
- Aceite: `test_devolucao_arredondamento_com_desconto_nunca_passa_do_que_foi_pago`. Regra (se D-01 for a recomendada): a ÚLTIMA devolução de uma linha estorna `pago da linha - já estornado da linha`; o resto arredonda normal. Exemplo: 96,67 + 96,67 + 96,66 = 290,00.
- Risco: baixo; depende de B-01 (mesma conta).

### B-04 Mensagens técnicas e erro 500 com `str(e)` em devolução. BAIXO
- Onde: `process_return` e `check_eligibility` (`except Exception` devolve 500 com texto técnico); `[Inventory Sync]` falha só vai para `print` (`rebuild_product_from_fifo` depois do commit); `max_refund_amount`/`total_refund` misturam float e string no JSON.
- Esperado: só ValueError vira 400 com frase; falha de sync grava em `error_logs` (nível erro); números como string `"0.00"` em todas as rotas de returns.
- Aceite: teste novo em `tests/audit/devolucoes/` que força exceção interna e confere frase amigável sem texto de SQL; `tests/test_erros_amigaveis.py` e `tests/test_estorno_correcao.py` seguem verdes.
- Risco: o app lê `max_refund_amount` como número; ao padronizar, conferir `mobile` (front fora do escopo: manter float onde já é float, só unificar entre rotas).

### B-05 Peça devolvida com defeito não é marcada nas fontes FIFO. MÉDIO (CRUZA A e D; dev A faz a parte de dados)
- Onde: `return_service.py` (restock=false não marca `quantity_returned` nem nada nas `sale_sources`).
- Efeito: Saúde do Estoque diz 36 vendidas + 1 "outra saída"; rastreio do lote diz 37 vendidas + 0; margem 63,4 x 62,2 do Início.
- Aceite (parte A): ao devolver com `restock=false`, gravar `quantity_defective` na fonte FIFO (campo novo, nulo/0 por padrão, migração aditiva testada upgrade/downgrade/upgrade) e NÃO mexer em `quantity_returned`/estoque (peça não volta); custo da peça continua como prejuízo no `money_ledger`. Teste novo `test_defeito_marca_fonte` em `tests/audit/devolucoes/`. A parte de leitura (rastreio, Lucro por lote, Saúde do Estoque) é do dev D no item B-25, que começa DEPOIS deste.
- Risco: médio (modelo + migração); vendas e dinheiro não podem mudar: rodar `tests/test_estresse_dinheiro.py`.

---

## ÁREA B: vendas e validações de entrada

Arquivos que o dev B pode editar: `backend/app/services/sale_service.py`, `backend/app/schemas/sale.py`, `backend/app/repositories/sale_repository.py` (filtros de listagem), `backend/app/api/v1/endpoints/sales.py` SÓ nas funções de criar, listar, obter, cancelar e recibo (linhas ~50-330 e o cancel); NÃO mexer em `/reports/period` (linha ~686) nem `/reports/top-products` (~1006), que são do dev D. Testes: `backend/tests/audit/vendas/`.
Ordem: B-06, B-07, B-10, B-09, B-08, B-11. Conflito de arquivo: `sales.py` é compartilhado com D. Regra: B termina e commita primeiro; D só troca o CORPO das duas rotas de relatório, em outro commit; se precisarem de paralelo, D move a lógica para um serviço novo (`services/sales_period_report_service.py`) e deixa em `sales.py` uma linha de delegação.

### B-06 Venda sem nenhum item é aceita e gravada. ALTO
- Onde: `schemas/sale.py:49-50` (`items`, `payments` sem `min_length=1`); `sale_service.create_sale` não confere.
- Reproduzir: `POST /sales/` com `items: []` e um pagamento de R$ 100 em dinheiro.
- Esperado: 422/400 "venda sem itens". Obtido: 201, venda `completed` com total 0 (R$ 100 viram troco); entra na contagem de vendas e no ticket médio.
- Aceite: `tests/audit/vendas/test_auditoria_vendas.py::test_corpos_invalidos_dao_4xx_e_nao_gravam_nada` passa (caso "sem itens"). Também recusa pagamentos vazios com total > 0. Nada gravado, estoque e livro intactos.
- Risco: baixo. Conferir que o fluxo de condicional que chama `create_sale` por dentro não manda lista vazia.

### B-07 Sem limite máximo em preço, quantidade, descontos e pagamento (500 com 1e30). MÉDIO
- Onde: `schemas/sale.py` (`SaleItemCreate`, `PaymentCreate`, `SaleCreate`: só `gt=0`/`ge=0`); mesmo corte falta no Postgres (`Numeric`).
- Reproduzir: item com `unit_price "1e30"` e pagamento 1.
- Esperado: 422 com frase "valor alto demais". Obtido: 500 genérico.
- Aceite: caso "preço gigante" do mesmo teste passa. Tetos: preço, desconto, imposto e pagamento <= R$ 1.000.000,00; quantidade <= 10.000 por linha (igual aos tetos das telas); linhas por venda <= 200. Exemplo: preço 1.000.000,01 = 422; 1.000.000,00 = 201.
- Risco: baixo; conferir `tests/test_estresse_*` que usam valores grandes (preço R$ 112.499,10 dos testes de layout cabe).

### B-08 Cancelar venda inexistente responde 400 (e mensagens sem acento). BAIXO
- Onde: `sale_service.py:404-419` (`"Venda ... no encontrada"` sem o "ã"), endpoint decide 404 procurando o texto "nao encontrada".
- Esperado: `POST /sales/99999999/cancel?reason=x` = 404 "Venda 99999999 não encontrada". Obtido: 400.
- Aceite: `test_cancelar_devolve_estoque_zera_receita_e_nao_cancela_duas_vezes` passa; criar `NotFoundError` e não decidir por texto; corrigir os acentos perdidos nas mensagens de `sale_service.py` (create_sale, cancel_sale).
- Risco: baixo; o app trata 404.

### B-09 Listagem de vendas: filtros não se combinam e ignoram paginação. BAIXO
- Onde: `endpoints/sales.py:204-219` (cadeia `if/elif`: período, depois cliente, depois vendedor); `customer_id` e `seller_id` ignoram `skip/limit`.
- Reproduzir: `GET /sales/?customer_id=<c>&seller_id=<inexistente>`.
- Esperado: lista vazia. Obtido: a venda da cliente.
- Aceite: `test_listagem_paginacao_e_filtros` passa; filtros período + cliente + vendedor + status combináveis (E) e `limit/skip` valem em todos. Exemplo: cliente A + vendedor B = só vendas de A feitas por B.
- Risco: médio-baixo (tela de vendas e ficha da cliente usam). Conferir ordenação (mais recente primeiro) e `sale_number` (linha 204).

### B-10 `start_date` ou `end_date` sozinhos são ignorados em silêncio. MÉDIO
- Onde: `endpoints/sales.py:204-210` (só vale quando vêm os dois).
- Reproduzir: `GET /sales/?start_date=<hoje + 5 dias>`.
- Esperado: lista vazia (ou 422 se decidir exigir os dois). Obtido: vendas de hoje.
- Aceite: `test_start_date_sozinho_nao_pode_ser_ignorado` passa; `start_date` sozinho = de lá até hoje; `end_date` sozinho = tudo até ela; início maior que fim = 422. Dias pelo fuso do Brasil (mesma regra do `money_ledger`).
- Risco: baixo.

### B-11 Duplo clique/retentativa cria duas vendas (sem idempotência). MÉDIO
- Onde: `endpoints/sales.py` `POST /sales/`; teste que documenta: duas vendas com o mesmo corpo.
- Esperado: header opcional `Idempotency-Key` (ou campo `client_request_id`); mesma chave em 24 h devolve a venda já criada (200/201 com o mesmo id), sem baixar estoque duas vezes. Obtido: duas vendas.
- Aceite: teste novo em `tests/audit/vendas/`: duas chamadas com a mesma chave = 1 venda, 1 baixa de estoque, mesmo `sale_number`; sem chave o comportamento atual continua. Chave guardada na venda (coluna única por loja, migração aditiva; ou tabela própria).
- Risco: médio (migração, concorrência: chave única resolve a corrida). Front passa a mandar a chave (fora do escopo desta fase; o servidor aceita sem ela).

---

## ÁREA C: financeiro, fiado, caixa e despesas

Arquivos que o dev C pode editar: `backend/app/services/finance_service.py`, `backend/app/api/v1/endpoints/finance.py`, `backend/app/services/receivable_service.py`, `backend/app/api/v1/endpoints/receivables.py`, `backend/app/services/cash_register_service.py`, `backend/app/api/v1/endpoints/cash.py`, `backend/app/services/expense_service.py`, `backend/app/api/v1/endpoints/expenses.py`, `backend/tests/audit/financeiro/` e `backend/tests/audit/caixa_fiado/`.
Ordem: B-12, B-13, B-14 (um helper só, `as_int`/`money`, resolve os três), B-15, B-16; B-17 e B-18 só depois da decisão do Victor.

### B-12 `POST /receivables/receive` dá 500 com id não numérico. MÉDIO
- Onde: `receivable_service.py:218-222` (`int(data["receivable_id"])`, `int(data["customer_id"])` sem try).
- Reproduzir: `{"customer_id":"abc","amount":"5","payment_method":"cash"}`; idem `receivable_id:"abc"` e `customer_id:[1]`.
- Esperado: 400 "Escolha a cliente/parcela". Obtido: 500.
- Aceite: `tests/audit/caixa_fiado/test_audit_fiado.py::test_erros_de_recebimento_sem_500` passa. Ideal: modelo Pydantic no lugar de `Dict`.
- Risco: baixo.

### B-13 500 com id de conta não numérico (transferência, repasse, pagar conta). MÉDIO
- Onde: `finance_service.py` em `transfer` (576), `settle_card` (408), `pay_payable` (645): `int(...)` sem try (`create_entry` já trata).
- Reproduzir: `POST /finance/transfers` com `from_account_id:"abc"`; `POST /finance/card-settlement` com `to_account_id:"abc"`; `POST /finance/payables/{id}/pay` com `account_id:"abc"`.
- Esperado: 400 "Escolha a conta". Obtido: 500.
- Aceite: `tests/audit/financeiro/test_audit_financeiro.py::test_erros_nunca_500` passa (partes de ids). Helper único `as_int(valor, "conta")`.
- Risco: baixo.

### B-14 500 em `POST /finance/setup` com `cash_balance:"NaN"` ou `banks:[1]`. BAIXO
- Onde: `finance_service.py:82` (`money()` compara `v < 0` fora do try, `InvalidOperation`) e `:449` (`b.get` em item que não é objeto).
- Esperado: 400 com frase. Obtido: 500.
- Aceite: mesmo `test_erros_nunca_500` passa por inteiro (3 entradas: NaN, Infinity/1e30, `banks:[1]`).
- Risco: baixo.

### B-15 Despesa com conta é aceita e editável em mês já fechado. ALTO
- Onde: `expense_service.py:218` (`create_expense`) e `:242` (`update_expense`) (e delete): não chamam `FinanceService.ensure_open_month` (`finance_service.py:715`), que as demais operações já usam.
- Reproduzir: implantar com corte no mês passado, fechar o mês passado, `POST /expenses` com `expense_date` nesse mês e `account_id` da gaveta; depois `PUT` valor 500.
- Esperado: 409 "já foi fechado" na criação, edição e exclusão (também quando a edição MUDA a data para dentro de mês fechado ou tira de lá). Obtido: 201 e 200; saldo do mês fechado muda por fora da fotografia.
- Aceite: `test_mes_fechado_e_datas` e `test_despesa_com_conta_em_mes_fechado_nao_pode_ser_editada_nem_apagada` passam (incluir o DELETE no teste, que hoje para no PUT). Despesa SEM conta em mês fechado: decisão do dev = manter permitida (não mexe no saldo), mas só se aparecer em `changed_since_close`; documentar no teste.
- Risco: médio. Despesas de lote/viagem e as geradas por conta a pagar (`payable_id`) passam pelo mesmo serviço: rodar `tests/test_financeiro.py` e `tests/test_lot_costs.py`.

### B-16 Fiado de valor pequeno em muitas parcelas gera parcelas de R$ 0,00. BAIXO (DECISÃO D-03)
- Onde: `receivable_service.py:59` (`split_amount`).
- Reproduzir: venda de R$ 0,05 no fiado em 12 parcelas: 11 parcelas de 0,00 e a última 0,05.
- Esperado (recomendado): reduzir o número de parcelas até a menor ser >= R$ 0,01, ou recusar com frase. Aceite: `test_audit_fiado.py::test_parcelas_somam_o_total_e_sobra_na_ultima[0.05]` passa; as demais somas (100,00 / 99,99 / 1.234,57 em 1, 2, 3, 5, 7, 12) continuam exatas.
- Risco: baixo; a prévia do app (`utils/fiadoPlan.ts`) usa a mesma conta: avisar o dev de front fora desta fase.

### B-17 Transferência entre contas pode deixar o saldo negativo. MÉDIO (DECISÃO D-02)
- Onde: `finance_service.py:576` (`transfer`); só o repasse da maquininha recusa excesso. Hoje documentado como "saldo pode ficar negativo" (`xfail` no teste de financeiro).
- Reproduzir: gaveta com R$ 150, transferir R$ 99.999,00 para o banco.
- Aceite depende da decisão. Se "recusar": 400 "A conta Gaveta só tem R$ 150,00" e o `xfail` vira teste verde.

### B-18 Dinheiro do fiado: Caixa conta pela hora do lançamento e Financeiro pela data do recebimento. MÉDIO (DECISÃO D-04)
- Onde: `cash_register_service.py:105` (`Payment.created_at`/recebimento por `created_at`) x `finance_service` (`received_on`).
- Reproduzir: receber no sábado um fiado com `received_on` de sexta e caixa aberto: gaveta mostra a entrada em um turno/dia e o Financeiro em outro.
- Aceite depende da decisão; em qualquer caso deve haver um teste novo em `tests/audit/caixa_fiado/` que receba com `received_on` retroativo e confira que Caixa esperado e saldo da Gaveta do Financeiro dão o MESMO valor.

---

## ÁREA D: relatórios, lotes, viagem e saúde do estoque

Arquivos que o dev D pode editar: `backend/app/services/report_service.py`, `backend/app/services/monthly_report_service.py`, `backend/app/services/trip_service.py`, `backend/app/services/stock_entry_service.py` (SÓ `get_entry_analytics`, lucro por lote), `backend/app/services/stock_flow_service.py`, `backend/app/services/money_ledger.py` (só ADICIONAR funções, ex.: `period_by_product`), `backend/app/api/v1/endpoints/dashboard.py` (fifo-performance/Saúde do Estoque), `backend/app/api/v1/endpoints/sales.py` SÓ as rotas `/reports/period` e `/reports/top-products` (ver conflito na área B), `backend/tests/audit/consistencia/`.
Ordem: B-19, B-20, B-23 (usam `money_ledger`), B-21, B-22, B-24; B-25 por último (espera B-05 do dev A).

### B-19 "Vendas por período" soma venda cancelada e não abate devolução. CRÍTICO
- Onde: `endpoints/sales.py:686-750` (`/sales/reports/period`, tela `sales-period.tsx`): conta própria.
- Reproduzir: venda de R$ 1.000 com devolução de R$ 400 e venda de R$ 160 cancelada, mesmo período.
- Esperado: R$ 600,00 (igual ao Início) e ticket médio pela conta única. Obtido: R$ 1.160,00.
- Aceite: `test_relatorio_por_periodo_igual_a_conta_unica_com_cancelada_e_devolucao` passa. Usar `money_ledger.period_totals` (venda válida = concluída, parcial ou devolvida; devolução abate no dia em que aconteceu; cancelada fora).
- Risco: médio (muda números de uma tela); conferir `by-period` e `daily-total`, que já batem.

### B-20 "Produtos mais vendidos" some com toda venda parcial ou totalmente devolvida. ALTO
- Onde: `endpoints/sales.py:1006` e `:1089` (`Sale.status == 'COMPLETED'` sem `PARTIALLY_REFUNDED`/`REFUNDED`; não abate devolução).
- Reproduzir: vender 10 de A (R$ 1.000), devolver 4.
- Esperado: 6 peças e R$ 600 (igual ao Resultado do Mês por produto). Obtido: 0 peças e R$ 0.
- Aceite: `test_venda_com_devolucao_parcial_continua_nos_produtos_mais_vendidos_pelo_valor_liquido` passa; usar `money_ledger.period_by_product`; venda devolvida por inteiro continua zerando.
- Risco: baixo-médio. Verificar também `dashboard.py:867` (`/dashboard/top-products`), que tem o mesmo nome e pode ter a mesma falha (não confirmado pelo QA).

### B-21 Retorno da viagem: receita sempre R$ 0 e ROI errado. ALTO
- Onde: `trip_service.py:213-222` (`json.loads(sale_sources)` sobre valor que já é dict: `TypeError` engolido; filtro só `COMPLETED`).
- Reproduzir: viagem com a entrada 4; vender 5 de B (R$ 600).
- Esperado: `trip_revenue` 600,00 (igual ao Lucro por lote); com devolução, líquida. Obtido: 0,0.
- Aceite: `test_retorno_da_viagem_receita_de_venda_simples` e `test_retorno_da_viagem_bate_com_o_lucro_do_lote` passam; vale para vendas parcialmente devolvidas e usa o valor pago (com desconto da venda e do item). ROI recalculado com essa receita.
- Risco: médio; engolir exceção em `except` sem log foi o que escondeu o bug: logar.

### B-22 Retorno da viagem conta peça baixada como vendida. MÉDIO
- Onde: `trip_service.py:180` (`quantity_received - quantity_remaining`).
- Reproduzir: vendeu 2 e baixou 7 pela Conferência.
- Esperado: 2 vendidas e taxa de venda 3,3%. Obtido: 9 vendidas e 15%.
- Aceite: `test_retorno_da_viagem_nao_conta_peca_baixada_como_vendida` passa; usar a mesma fonte do rastreio do lote (`stock_flow_service`).
- Risco: baixo.

### B-23 Mais vendidos do Relatório de vendas e do Relatório mensal usam preço cheio. ALTO
- Onde: `report_service.py:160` e `:251` (`sum(quantity * unit_price)` sem desconto do item nem da venda; depois abate devolução, que já é líquida).
- Reproduzir: 10 peças a R$ 100 com R$ 100 de desconto na venda.
- Esperado: total e mais vendidos R$ 900,00. Obtido: total R$ 900, mais vendidos R$ 1.000 (semente: R$ 7.486 contra R$ 7.019 certos).
- Aceite: `test_mais_vendidos_do_relatorio_usam_o_valor_pago_com_desconto_da_venda` e `..._com_desconto_no_item` e o cenário aleatório passam; PDF e `monthly_report_service` herdam.
- Risco: médio; conferir `tests/test_relatorio_vendas_pdf.py` e `tests/test_relatorio_mensal.py`.

### B-24 Lucro por lote atribui a devolução ao lote errado. MÉDIO
- Onde: `stock_entry_service.get_entry_analytics` (~linha 582): percorre as fontes FIFO na ordem inversa à da devolução.
- Reproduzir: vender 12 de A (10 do lote 1 + 2 do lote 2), devolver 2 (voltam ao lote 2).
- Esperado: lote 1 com 10 vendidas, lote 2 com 0. Obtido: 8 e 2; receita e custo por lote trocados quando os custos diferem (semente 11: lote e1 receita 845 contra 935).
- Aceite: `test_lucro_por_lote_atribui_a_devolucao_ao_lote_que_recebeu_a_peca` e o aleatório passam; ler `quantity_returned` das `sale_sources` como faz `stock_flow_service`.
- Risco: médio; conferir `tests/test_lot_costs.py` e a tela Lucro por Lote.

### B-25 Peça com defeito: Lucro por lote, Saúde do Estoque e rastreio discordam. MÉDIO (CRUZA A e D; dev D faz depois de B-05)
- Onde: `get_entry_analytics` (abate o custo da peça defeituosa: R$ 120 em vez de R$ 200; soma das entradas fica R$ 35 abaixo do custo da loja); `dashboard.py` (Saúde: 36 vendidas + 1 outra saída x rastreio 37 + 0; margem 63,4 contra 62,2 do Início).
- Aceite: `test_peca_com_defeito_mesma_conta_em_todas_as_telas` (e a variante `[com_defeito]`) passam. Regra única (do Victor): peça com defeito CONTA como vendida no rastreio e na Saúde, o custo dela fica como prejuízo (não abate) e a margem da Saúde = margem do Início.
- Risco: médio; depende do campo `quantity_defective` (B-05).

---

## Itens que cruzam áreas (quem faz)
- B-05 (A) e B-25 (D): A cria o campo e grava; D lê e acerta as telas. Ordem: A antes de D.
- B-01 (A) e B-23/B-24 (D): o erro de "receita menor que a do livro" nas sementes com desconto no item some quando A corrige o estorno; D só confere os testes aleatórios depois do B-01.
- `sales.py` (B e D): ver regra na área B. B primeiro.
- B-15 (C) toca `expense_service`; D não edita esse arquivo (Resultado do Mês usa só leitura).
- B-18 (C) e `money_ledger` (D): C não altera `money_ledger`; se a decisão D-04 pedir mudança lá, o dev D adiciona função nova a pedido de C.

## DECISÕES PARA O VICTOR

**D-01. O centavo que sobra no estorno com desconto (B-03).**
Pergunta: se a cliente comprou 3 peças com R$ 10 de desconto e paga R$ 290,00, e devolve uma peça por vez, quanto a loja devolve a cada vez?
Exemplo: cada peça "vale" R$ 96,666... Hoje a loja devolve 96,67 três vezes = R$ 290,01 (1 centavo a mais do que recebeu).
Opções: (a) a última devolução ajusta e devolve 96,66 (soma exata R$ 290,00); (b) a primeira leva o centavo a mais (96,67; 96,67; 96,66 já dá o mesmo total, só muda quem leva); (c) manter e aceitar até 1 centavo por peça de diferença.
Recomendo (a): o total devolvido nunca passa do que a cliente pagou e a conta fecha com o livro.

**D-02. Transferência entre contas pode deixar saldo negativo? (B-17)**
Pergunta: se a gaveta tem R$ 150 e alguém lança "levei R$ 500 para o banco", o app deve recusar?
Exemplo: gaveta R$ 150,00, transferência de R$ 500,00 = gaveta -R$ 350,00.
Opções: (a) recusar sempre ("a Gaveta só tem R$ 150,00"); (b) recusar só para Gaveta e Maquininha (dinheiro físico não fica negativo) e permitir banco negativo (cheque especial, esqueceu de lançar um PIX); (c) permitir tudo e só avisar.
Recomendo (b): gaveta e maquininha são dinheiro de verdade e não podem ser negativas; banco pode, com aviso em vermelho, porque às vezes o lançamento da entrada vem depois.

**D-03. Fiado de valor pequeno em muitas parcelas (B-16).**
Pergunta: uma venda de R$ 0,05 em 12 vezes: recusar ou reduzir parcelas?
Exemplo: R$ 5,00 em 12 parcelas = 11 de R$ 0,41 e a última de R$ 0,49.
Opções: (a) recusar com frase ("valor pequeno demais para 12 parcelas"); (b) reduzir sozinho o número de parcelas para a menor ficar >= R$ 0,01 (R$ 0,05 vira 5 de R$ 0,01); (c) definir parcela mínima por loja (ex.: R$ 10,00).
Recomendo (a) com parcela mínima de R$ 1,00 fixa (sem tela de configuração agora): nunca existe parcela de centavos nem de R$ 0,00, e a lojista decide o que fazer.

**D-04. Dinheiro de fiado: conta pela hora do lançamento ou pela data do recebimento? (B-18)**
Pergunta: se a cliente paga o fiado na sexta mas a dona só lança no sábado, em que dia o dinheiro entrou?
Exemplo: R$ 100 recebidos na sexta (data informada), lançados sábado às 09:00 com o caixa de sábado aberto.
Opções: (a) data do recebimento informada (sexta) em tudo; o Caixa do sábado NÃO soma esse dinheiro (ele entrou antes da gaveta de sábado abrir); (b) hora do lançamento (sábado) em tudo: Caixa e Financeiro somam no sábado; (c) como hoje: cada tela com uma regra (hoje o app mostra números diferentes).
Recomendo (b) para o CAIXA (a gaveta física é o que está dentro dela quando a pessoa lança) e (a) para o Financeiro/relatórios; o que não pode é um valor diferente na mesma conta: o saldo da Gaveta no Financeiro tem que igualar o esperado do Caixa. Alternativa mais simples e que eu aprovo: proibir data de recebimento retroativa quando houver caixa aberto naquela conta.

**D-05. Idempotência da venda (B-11): vale fazer já?**
Pergunta: se a internet falha e a vendedora toca em "Finalizar" duas vezes, o app cria uma venda só?
Exemplo: duas vendas iguais de R$ 120 em 3 segundos, estoque baixa 2 vezes.
Opções: (a) fazer agora no servidor (o app antigo continua funcionando, o novo manda uma chave); (b) deixar para Fase 2.
Recomendo (a): é dinheiro duplicado e o servidor aceita sem mudar o app.

**D-06. Despesa SEM conta em mês fechado (B-15).**
Pergunta: uma despesa de aluguel esquecida do mês fechado pode ser lançada com a data daquele mês?
Opções: (a) recusar sempre; (b) permitir (não mexe em saldo de conta) mas mostrar "mudou depois do fechamento"; (c) pedir que reabra o mês (só admin).
Recomendo (b), porque despesa sem conta não altera dinheiro das contas, e o Resultado do Mês de mês fechado mostra o aviso que já existe.

## FORA DO ESCOPO / FASE 2 (os QAs não cobriram)
- Postgres real: todos os testes rodaram em SQLite. Falta: overflow de `Numeric`, empate de ordem, arredondamento, `GROUP BY` (já deu erro só no Postgres antes), concorrência (duas vendas pela última peça, duas devoluções da mesma venda, dois recebimentos do mesmo fiado). Existem `tests/pg/`, mas não foram rodados nesta auditoria.
- Fuso horário: venda perto da meia-noite UTC x Brasil no filtro e no fechamento; devolução em dia diferente da venda (parcialmente coberta em `test_estresse_dinheiro`); feriado na previsão do cartão (a regra ignora feriado).
- Entradas e custo: editar o desconto do fornecedor depois das vendas, frete/viagem, excluir item de entrada vendida, devolução ao fornecedor, condicional (peças com a cliente) no livro do estoque, ajustes pós-venda de custo.
- Pagamento: venda por maquininha/PIX integrado (`pdv/*`, `keep_pending`; hoje desligado no app), desconto automático por forma de pagamento (`PaymentDiscountService` engole erro com `print`), pagar a venda inteira só com pontos, imposto (`tax_amount`) no estorno e no livro.
- Devolução: venda de troca devolvida de novo, estorno com pagamento misto (PIX + dinheiro) e `refund_method` (`cash`, `store_credit`) no caixa/Financeiro, `POST /returns/reconcile-status` (inalcançável).
- Financeiro: venda/devolução com data retroativa na sequência aleatória, troca e fiado recebido no livro, fechamento do mês com quebra e `changed_since_close` além de `test_fechamento_mes`, fiado no fechamento do mês, receber com `received_on` retroativo em mês fechado.
- Papéis e várias lojas: `papeis.md` ainda não existe; os testes de `tests/audit/papeis/` precisam de relatório e triagem (Fase 1b).
- Front-end: nenhuma tela foi conferida; ajustes de tela das mudanças (mensagens novas, `max_refund_amount`, chave de idempotência, parcelas do fiado) ficam para a Fase 2.
- Fuzz global de todas as rotas de dinheiro (corpos aleatórios) e PDFs (comprovante, relatório de vendas, relatório mensal) com valores extremos.
- Entradas sem item de venda: `sale_sources` vazio em vendas antigas (bloqueia devolução antiga só no fim da transação).
