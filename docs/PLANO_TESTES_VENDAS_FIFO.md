# Plano de testes: vendas, FIFO, devolução, troca e condicional

Premissa: **nenhuma peça pode sumir nem aparecer do nada, e nenhum valor pode ser inventado.** Este documento é a fila de trabalho
para quem continuar (inclusive sessões na nuvem). Atualizado em 2026-10-27.

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
| 13 | Aleatório: vender, devolver, trocar, cancelar, repor, vender demais (sementes 11, 23, 37 com 70 operações: OK; sementes 101 a 106 com 300 operações cada, 1.800 no total: OK em 8 min 36 s) | OK |

## Fila para a nuvem (cada item é independente; não mexem nos mesmos arquivos)
**A. Condicional + FIFO (arquivo novo `tests/test_estresse_condicional.py`).** Envio condicional reserva estoque (sai ao enviar), volta se
devolvido, vira venda se mantido, perda/danificada vira despesa. Estender o oráculo: camada = vendas ativas + reservas abertas de
condicional + perdas. Fuzz com envios, devoluções parciais, vencimento (OVERDUE), cancelamento, mesma peça vendida no balcão enquanto
está em condicional (tem que recusar), e 2 envios disputando a mesma peça. Consertar o que quebrar em `app/services/conditional_shipment.py`.

**B. Concorrência no Postgres (arquivos novos em `tests/pg/`).** Dois pedidos simultâneos para a última peça (um só vence, o outro 400,
estoque nunca negativo), duas devoluções simultâneas do mesmo item (a soma nunca passa do vendido), venda cancelada enquanto devolve,
reposição durante a venda. Usar `TEST_PG_URL=postgresql+asyncpg://postgres@127.0.0.1:55432/postgres` (Postgres descartável).
Suspeita: `FIFOService.process_sale` e `ReturnService.process_return` leem e gravam `quantity_remaining` sem `SELECT ... FOR UPDATE`.
Consertar com bloqueio por linha ou por loja (já existe `sku_service.lock_catalog` como modelo).

**C. Dinheiro e relatórios (arquivo novo `tests/test_estresse_dinheiro.py`).** Depois de sequências aleatórias, conferir: soma dos pagamentos
confirmados = receita da venda; reembolso + diferença da troca; receita líquida do dashboard = vendas ativas - devoluções + trocas;
lucro = receita - custo FIFO das peças que ficaram vendidas; pontos de fidelidade (ganhos - estornados nunca negativos, cliente com
total gasto coerente); relatórios `/sales/reports/*` e PDF batem com o livro. Pontos já suspeitos: custo da peça devolvida no lucro
("devolução parcial NÃO abate o lucro", ver CLAUDE.md) e `supplier_insights` contando como vendida a peça devolvida
(`sale_sources` agora tem `quantity_returned`).

**D. Tela de devolução/troca no navegador (Playwright, backend local descartável).** Fluxo completo no app (lista de vendas, devolver,
trocar, diferença a pagar), erros do servidor legíveis, resumo e estoque conferidos. Nada disso foi clicado ainda.

## Regras para quem for continuar
- Teste novo de venda/FIFO usa os helpers de `tests/test_estresse_vendas_fifo.py` (`_cenario_30`, `_vender`, `_devolver`) e a fixture
  `_limpa_vendas` (os ids se repetem entre testes e contaminam o oráculo).
- Achou bug: escrever o teste que falha primeiro, consertar, e conferir que o teste volta a falhar se a correção for desfeita.
- Nunca rodar carga contra a loja 2 (loja real) nem em produção sem a guarda (`deploy/guarda_publicacao.py --status`).
