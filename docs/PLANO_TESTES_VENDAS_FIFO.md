# Plano de testes: vendas, FIFO, devolução, troca e condicional

Premissa: **nenhuma peça pode sumir nem aparecer do nada, e nenhum valor pode ser inventado.** Este documento é a fila de trabalho
para quem continuar (inclusive sessões na nuvem). Atualizado em 2026-10-28.

## Como rodar
```bash
cd backend
# bateria padrão (rápida, SQLite em memória)
venv/Scripts/python.exe -m pytest tests/test_estresse_vendas_fifo.py tests/test_estresse_cenarios.py tests/test_estresse_aleatorio.py -q --no-cov -p no:warnings
# carga pesada reproduzível (sementes fixas)
ESTRESSE_OPS=2000 ESTRESSE_SEEDS=1,2,3,4,5,6,7,8,9,10 venv/Scripts/python.exe -m pytest tests/test_estresse_aleatorio.py -q --no-cov -p no:warnings
```
Comparar sempre com a linha de base da suíte: 104 falhas antigas que não são deste trabalho (`pytest tests --ignore=tests/e2e`). Falha nova = problema novo.

## O oráculo (o que "certo" significa)
`tests/test_estresse_cenarios.py::confere_conservacao`: para cada camada FIFO (`entry_items`), `recebido - restante` tem que ser
igual ao que as vendas NÃO canceladas ainda seguram dela (`sale_sources[].quantity_taken - quantity_returned`).
Se diferir, uma peça sumiu ou foi inventada. Mais: um livro de estoque independente por variação (`test_estresse_aleatorio.py`),
"recusou = não mexeu em nada" (tudo ou nada) e nenhuma resposta 5xx.

## Achados e correções (esta rodada)
1. **Bug grave corrigido: 2ª devolução da mesma venda.** `ReturnService.process_return` devolvia ao estoque sempre a partir da
   PRIMEIRA fonte FIFO da venda, sem lembrar o que já tinha voltado. Vender 30, devolver 5 e depois trocar 6 dava erro 400
   ("Cannot increase quantity beyond received amount"); quando a camada tinha folga, a peça voltava para a camada errada. Agora
   cada fonte guarda `quantity_returned` e a devolução vai da ÚLTIMA fonte para a primeira (o estoque fica como se a venda tivesse
   sido menor: vender 30 e devolver 5 = vender 25). Venda antiga sem fontes FIFO agora recusa a devolução (antes a peça sumia do
   estoque em silêncio). `FIFOService.reverse_sale` (cancelamento) agora desconta o que já voltou.
2. Sem a correção, 8 dos 16 testes desta bateria falham (conferido); com ela passam todos.
3. **Corrida grave corrigida (Postgres, 2 workers).** `process_sale`, `process_return`, `cancel_sale` e o condicional liam o saldo da camada, decidiam e gravavam
   sem nenhuma trava. Provado com pedidos HTTP em paralelo: dois pedidos pela ÚLTIMA peça passavam os dois (venda dupla), 14 vendas de 2 contra 10 peças passavam
   todas, duas devoluções de 8 de uma venda de 10 passavam as duas. Correção: `app/services/stock_lock.py` (`pg_advisory_xact_lock` por venda, envio e variação,
   sempre na mesma ordem, liberada no commit/rollback; reentrante; no SQLite não faz nada), chamada ANTES de ler saldo em `SaleService.create_sale/cancel_sale`,
   `ReturnService.process_return` e `ConditionalShipmentService.create_shipment/process_return/cancel_shipment`. Sem a trava 13 dos 15 testes de
   `tests/pg/test_concorrencia_vendas_postgres.py` falham (conferido desligando a trava); com ela passam 15, 5 rodadas seguidas, sem deadlock (vendas de 2 itens em ordem oposta).
4. **Custo errado no condicional corrigido.** A venda gerada ao processar o envio usava o custo MÉDIO de todas as peças enviadas, e perda/danificada também; agora usa o custo FIFO
   das peças que ficaram (venda) e das que sumiram (despesa). Ex.: 25 enviadas (10@40, 10@45, 5@50), 7 voltam, 8 ficam: custo da venda 345 (antes 352); perdidas 6 = 275, danificadas 4 = 200.
5. Limitação conhecida: `sale_items.unit_cost` guarda só centavos (43,125 vira 43,12); o valor exato continua em `sale_sources`.

## Matriz de cenários
| # | Cenário | Estado |
|---|---|---|
| 1 | Vender 30 (3 camadas de custo), devolver 5, trocar 6 da mesma venda, tentar passar do limite, devolver o resto | OK |
| 2 | 30 devoluções de 1 peça cada voltam exatamente às camadas de origem | OK |
| 3 | Cancelar venda depois de devolução parcial não repõe duas vezes | OK |
| 4 | Peça com defeito (`restock=false`) nunca volta ao estoque, nem no cancelamento | OK |
| 5 | Venda acima do estoque recusada sem mexer em nada; vender exatamente tudo | OK |
| 6 | Venda de 2 itens com falta no 2º: tudo ou nada | OK |
| 7 | Troca de vários itens para variações diferentes na mesma devolução | OK |
| 8 | Troca por peça mais barata (loja devolve a diferença) | OK |
| 9 | Peça nova da troca atravessa duas camadas de custo | OK |
| 10 | Desconto da venda reduz o valor devolvido proporcionalmente (R$ 900 / 10 peças: devolver 5 = R$ 450) | OK |
| 11 | Devolução fora do prazo; item de outra venda | OK |
| 12 | Custo da venda = soma das camadas (R$ 1.325 para 30 peças) | OK |
| 14 | Condicional: reserva atravessa camadas, devolve pela frente das fontes; ficou/devolveu/perdeu/danificou no mesmo envio com custo certo | OK |
| 15 | Venda nascida de condicional pode ser devolvida, trocada e cancelada (oráculo fecha) | OK |
| 16 | Balcão não vende peça reservada em condicional; dois envios disputando a mesma peça; envio nunca enviado; atrasado; reprocessar/cancelar finalizado; recusa não mexe em nada | OK |
| 17 | Aleatório com condicional (criar, enviar, processar, cancelar envio, vender, devolver, trocar, cancelar venda, repor, pedidos acima do estoque) | OK |
| 18 | Postgres, pedidos em paralelo: última peça, N vendas acima do estoque, devoluções simultâneas, cancelar enquanto devolve, reposição durante vendas, trocas para a mesma peça, condicional x condicional, condicional x balcão, processar x cancelar o mesmo envio | OK (15 testes) |
| 13 | Aleatório: vender, devolver, trocar, cancelar, repor, vender demais (sementes 11, 23, 37 com 70 operações: OK; sementes 101 a 106 com 300 operações cada, 1.800 no total: OK em 8 min 36 s) | OK |

## Fila para a nuvem (cada item é independente; não mexem nos mesmos arquivos)
**A. Condicional + FIFO: FEITA** (`tests/test_estresse_condicional.py`, 14 testes + aleatório; achado 4).
**B. Concorrência no Postgres: FEITA** (`tests/pg/test_concorrencia_vendas_postgres.py`, 15 testes; achado 3). Como rodar: Postgres descartável em 55432
(`initdb -D <dir> -U postgres --auth=trust` e `pg_ctl -o "-p 55432" start`), `TEST_PG_URL=postgresql+asyncpg://postgres@127.0.0.1:55432/postgres pytest tests/pg -p no:cacheprovider --no-cov`.
Ainda sem trava (fora do alcance desta rodada): exclusão/edição de entrada de estoque e ajuste manual de inventário durante vendas.

**C. Dinheiro e relatórios: FEITA** (nuvem, 28/10/2026; `tests/test_estresse_dinheiro.py`, 4 cenários fechados + aleatório com livro independente +
ranking de fornecedor; com o código antigo os 8 falham). Regras decididas pelo Victor: receita LÍQUIDA em todas as telas, devolução abate no dia em que
aconteceu, peça com defeito continua no custo, total gasto do cliente líquido. Conta única em `app/services/money_ledger.py`. Achados (todos corrigidos):
5. Cada tela tinha uma regra: o total geral do início zerava venda parcialmente devolvida (R$100 vendido - R$50 devolvido dava 0); o "este mês" e o
   ano a ano somavam venda CANCELADA; o relatório de vendas não descontava devolução e contava a troca duas vezes (vendeu 100, trocou por 120 = 220);
   o Resultado do Mês tirava inteira a venda com uma peça devolvida. Agora todas usam `money_ledger.period_totals`.
6. Cancelar venda pela API dava erro 500 SEMPRE desde a trava de estoque (`from sqlalchemy import select` local na função). Os testes de estresse não
   viam porque mandavam o motivo no corpo (a rota lê `?reason=`) e tomavam 422 tratado como "recusado". Corrigidos os testes (cancelamento agora é
   exercitado de verdade, inclusive no Postgres em paralelo com devoluções).
7. Venda que já teve devolução/troca agora NÃO pode ser cancelada (400 com orientação): o cancelamento apagava das contas o crédito que pagou a peça
   da troca. O resto da venda volta pela Devolução.
8. Cliente: devolução não descontava do total gasto; a troca não somava; cancelar depois de devolução estornava os pontos de novo.
9. Troco em dinheiro era gravado como pagamento (app manda o valor recebido). Agora o pagamento gravado é o que ficou; cartão/PIX acima do total é recusado.
10. Custo da peça devolvida gravado era o médio da venda; agora é o das camadas para onde ela voltou (exato).
11. Ranking de fornecedor atribuía a devolução proporcionalmente (fornecedor errado quando as camadas são de fornecedores diferentes); reposição
    contava peça devolvida como demanda.
12. Cache do início só era limpo ao criar venda; agora também em devolução, troca, cancelamento e venda do condicional.
Não feito: recalcular o total gasto de clientes ANTIGOS de produção (devoluções antigas não descontaram); `ReturnItem.unit_cost` antigos seguem com
o custo médio. Limitação mantida: custo por peça gravado em centavos.

**D. Tela de devolução/troca no navegador (Playwright, backend local descartável). EM ANDAMENTO (nuvem, 28/10).** Fluxo completo no app (lista de vendas, devolver,
trocar, diferença a pagar), erros do servidor legíveis, resumo e estoque conferidos. Nada disso foi clicado ainda.

## Regras para quem for continuar
- Teste novo de venda/FIFO usa os helpers de `tests/test_estresse_vendas_fifo.py` (`_cenario_30`, `_vender`, `_devolver`) e a fixture
  `_limpa_vendas` (os ids se repetem entre testes e contaminam o oráculo).
- Achou bug: escrever o teste que falha primeiro, consertar, e conferir que o teste volta a falhar se a correção for desfeita.
- Nunca rodar carga contra a loja 2 (loja real) nem em produção sem a guarda (`deploy/guarda_publicacao.py --status`).
