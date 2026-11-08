# Auditoria de consistência entre telas e números (08/11/2026)

Testes novos em `backend/tests/audit/consistencia/` (`mundo.py` = livro FIFO independente em Python; `test_consistencia.py` = cenários aleatórios com semente fixa; `test_cenarios_fixos.py` = casos conferidos à mão). O app não foi alterado.

Rodar: `cd backend; TEST_DATABASE_URL=sqlite+aiosqlite:///./test_audit_cons.db SECRET_KEY=abcdefghijklmnopqrstuvwxyz0123456789 DATABASE_URL=sqlite:///./test_audit_cons.db ENVIRONMENT=test ./venv/Scripts/python.exe -m pytest tests/audit/consistencia -q --no-cov -p no:cacheprovider -W ignore`
Resultado em 08/11/2026: 14 falhas (todas bugs reais de app, abaixo) e 6 passes.

## (a) Cenários cobertos

Mundo de teste: 2 produtos, 3 variações, 5 lotes (A em 3 camadas FIFO; B em viagem com frete de R$ 300; C e A com desconto do fornecedor na entrada). O livro lê só o custo posto de cada lote e simula tudo o mais.

- Aleatório (sementes 11, 23, 37; 45 operações): venda com 1 ou 2 linhas, desconto na venda inteira (0, 5, 10%), desconto no item, devolução parcial, devolução com defeito (não volta ao estoque), troca, cancelamento (inclui recusa de cancelar venda com devolução). Depois conferidos contra o livro: Início (`/dashboard/stats`, `/sales/monthly`, `/sales/daily`), Relatório de vendas, Resultado do Mês e por produto, Relatório mensal, Produtos mais vendidos, Lucro por lote, rastreio do lote, lista de entradas, Saúde do Estoque, `reconcile()` e o saldo de cada camada FIFO (banco x livro).
- Fixos: estorno de item com desconto no item e na venda; venda parcial e totalmente devolvida nos Mais vendidos; devolução que cruza dois lotes; peça com defeito; retorno da viagem (simples, com desconto e devolução, com baixa); desconto da venda e do item nos Mais vendidos (Relatório de vendas, Relatório mensal); "Vendas por período" e Ano a Ano com venda cancelada e devolução; baixa pela Conferência e exclusão de variação com baixa (lote fecha, `reconcile` ok, dinheiro não muda, `other_out` correto, taxa de venda da lista); excluir item e entrada sem venda; excluir entrada com venda (recusa ou segue coerente, sem erro 500); produto zerado só conta como sem estoque se já vendeu (contador do início e caixa de alertas).

O que bateu (sem divergência em nenhuma semente): receita, custo, lucro e quantidade de vendas no Início (hoje, total, mês, gráfico diário), Relatório de vendas (total, por dia, por vendedor), Resultado do Mês (total e por produto), Relatório mensal (resultado, devoluções, peças líquidas), rastreio do lote (conta fecha e vendidas certas sem defeito), lista de entradas, `reconcile()` sempre ok, camadas FIFO banco = livro, nenhum 500, baixa e exclusão não mexem em dinheiro, produto zerado e alerta "sem estoque" só para quem vendeu.

## (b) Bugs confirmados

**1. Estorno ignora o desconto dado no item (gravidade alta, dinheiro).**
Passos: vender 2 peças de R$ 100 com `discount_amount` 40 no item (cliente paga R$ 160) e devolver as 2.
Esperado: estorno de até R$ 160. Obtido: R$ 200 (`return_service.py` usa `quantity * unit_price` e só aplica o desconto da venda). Com desconto na venda e no item juntos: estorno de R$ 350,48 para um item pago R$ 262,86. A receita líquida de uma venda 100% devolvida fica negativa. Como a conta única usa o estorno, todas as telas mostram o erro de forma consistente, mas o dinheiro devolvido sai errado. Efeito colateral nas sementes com desconto no item: receita por lote menor que a do livro e margem da Saúde do Estoque 62,2 contra 61,8.
Testes: `test_devolucao_de_item_com_desconto_no_item_nao_devolve_mais_do_que_foi_pago`, `test_devolucao_com_desconto_no_item_e_na_venda`.

**2. Produtos mais vendidos (`/sales/reports/top-products`) some com toda venda parcial ou totalmente devolvida (alta).**
Passos: vender 10 de A (R$ 1.000) e devolver 4. Esperado: 6 peças e R$ 600 (igual ao Resultado do Mês por produto). Obtido: 0 peças e R$ 0. Causa: filtro `Sale.status == 'COMPLETED'` (sem `PARTIALLY_REFUNDED`/`REFUNDED`) e a conta não abate devolução. Na semente 11, produto 1 mostra R$ 5.269 contra R$ 7.019 certos. Testes: `test_venda_com_devolucao_parcial_continua_nos_produtos_mais_vendidos_pelo_valor_liquido`, `test_venda_devolvida_por_inteiro...` (este passa porque tudo zera).

**3. Retorno da viagem: receita sempre R$ 0 e ROI errado (alta).**
`trip_service.get_trip_analytics` faz `json.loads(sale_sources)`, mas `sale_sources` já é dict: levanta `TypeError`, o `except` engole e `trip_revenue` fica 0. Passos: viagem com a entrada 4, vender 5 de B (R$ 600). Esperado `trip_revenue` 600; obtido 0.0. Além disso só considera `Sale.status == COMPLETED` (sumiria depois de devolução). Testes: `test_retorno_da_viagem_receita_de_venda_simples`, `test_retorno_da_viagem_bate_com_o_lucro_do_lote`.

**4. Retorno da viagem conta peça baixada como vendida (média).**
`total_quantity_sold = quantity_received - quantity_remaining`: vendeu 2 e baixou 7 (Conferência), a tela diz 9 vendidas (taxa de venda 15% em vez de 3,3%). É o mesmo erro corrigido no lote, que a viagem não recebeu. Teste: `test_retorno_da_viagem_nao_conta_peca_baixada_como_vendida`.

**5. Mais vendidos do Relatório de vendas e do Relatório mensal usam preço cheio, sem desconto (média/alta).**
`report_service.get_sales_report` soma `quantity * unit_price` (sem desconto do item nem da venda) e só depois abate devolução (que já vem líquida de desconto). 10 peças a R$ 100 com R$ 100 de desconto na venda: total do relatório R$ 900, mais vendidos R$ 1.000. Com devolução mistura bruto com líquido. Nas sementes: R$ 7.486 contra R$ 7.019 certos. Testes: `test_mais_vendidos_do_relatorio_usam_o_valor_pago_com_desconto_da_venda`, `..._com_desconto_no_item`, e o cenário aleatório.

**6. "Vendas por período" (`/sales/reports/period`, tela `sales-period.tsx`) soma venda cancelada e não abate devolução (alta).**
Cenário: venda de R$ 1.000 (devolve R$ 400) e venda de R$ 160 cancelada. Esperado R$ 600 (igual ao Início); obtido R$ 1.160. O ticket médio dessa tela também usa conta própria. Teste: `test_relatorio_por_periodo_igual_a_conta_unica_com_cancelada_e_devolucao`.

**7. Lucro por lote atribui a devolução ao lote errado (média).**
Venda de 12 de A pega 10 do lote 1 e 2 do lote 2; devolver 2 volta ao lote 2 (último), como o rastreio e o estoque mostram. `StockEntryService` percorre as fontes na ordem inversa da devolução: mostra lote 1 com 8 vendidas e lote 2 com 2 (certo: 10 e 0). Receita e custo por lote saem trocados; a soma das entradas continua igual à da loja quando o custo é o mesmo, mas aparece diferença quando os custos dos lotes diferem (semente 11: e1 receita 845 contra 935, custo 360 contra 400). Testes: `test_lucro_por_lote_atribui_a_devolucao_ao_lote_que_recebeu_a_peca` e aleatório.

**8. Peça devolvida com defeito: telas discordam (média).**
a) Lucro por lote abate da conta o custo da peça defeituosa (custo R$ 120 em vez de R$ 200; a regra do Victor é que o prejuízo fica) e a soma das entradas fica R$ 35 abaixo do custo da loja (semente 37). b) Saúde do Estoque diz 36 vendidas e 1 "outra saída", enquanto o rastreio do lote diz 37 vendidas e 0 sem venda (defeito não marca `quantity_returned` nas fontes). c) Margem da Saúde do Estoque 63,4 contra 62,2 do Início. Testes: `test_peca_com_defeito_mesma_conta_em_todas_as_telas` e `[com_defeito]`.

## (c) Melhorias sugeridas

- Calcular o estorno com o mesmo valor pago pela linha: `(qtd * preço - desconto do item proporcional) * (1 - %desconto da venda)`; travar com `refund <= pago - já devolvido`.
- Trocar as 4 contas paralelas (top-products, relatório de vendas, viagem, `/sales/reports/period`) por chamadas a `money_ledger` (`period_by_product` já existe e bate com o Resultado do Mês).
- Para defeito, gravar nas fontes FIFO um campo `quantity_defective` para que rastreio, Lucro por lote e Saúde do Estoque usem a mesma classificação (vendida x saída sem venda).
- A atribuição de devolução por lote do `get_entry_analytics` deveria ler `quantity_returned` das `sale_sources` (como `stock_flow_service`) em vez de refazer a distribuição.
- Teste de CI: manter `tests/audit/consistencia` como regressão (hoje falha de propósito até as correções).

## (d) Não coberto

- Banco SQLite apenas (sem Postgres): arredondamento e ordem de empate podem variar.
- Custo extra de frete e desconto do fornecedor entram só como custo posto das camadas; não fiz cenários aleatórios editando o desconto depois das vendas, nem excluir item de entrada já vendida (a API recusa).
- Venda com fiado, pontos de fidelidade, pagamento múltiplo e imposto (`tax_amount`) não entram no livro (o estorno também não considera imposto).
- Fuso: todas as operações são do mesmo dia; devolução em dia diferente da venda (abate no dia da devolução) já é coberta por `test_estresse_dinheiro.py`.
- Condicional (peças com a cliente) e devolução ao fornecedor no livro do estoque; Relatório mensal depois da implantação do Financeiro (dinheiro das contas); PDF do relatório.
- Concorrência (duas operações ao mesmo tempo) é papel dos testes `tests/pg`.
