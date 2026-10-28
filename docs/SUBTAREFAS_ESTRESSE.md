# Subtarefas de estresse (para a nuvem ou para o celular)

Como comandar: abra uma sessão (nuvem ou Remote Control no celular) neste repositório e mande, por exemplo:
**"Execute a subtarefa A de docs/SUBTAREFAS_ESTRESSE.md"**. Cada subtarefa é independente das outras (arquivos de teste novos e
separados), então podem rodar ao mesmo tempo.

Contexto comum (leia antes): `docs/PLANO_TESTES_VENDAS_FIFO.md` (oráculo, matriz de cenários, achados) e `CLAUDE.md`.
A bateria base está em `backend/tests/test_estresse_vendas_fifo.py`, `test_estresse_cenarios.py` e `test_estresse_aleatorio.py`
(helpers `_cenario_30`, `_vender`, `_devolver`, `confere_conservacao`, `foto`, fixtures `_limpa_loja_1` e `_limpa_vendas`).

Regras de todas: bug achado = escrever primeiro o teste que falha, consertar, e confirmar que o teste volta a falhar sem a correção.
Rodar a suíte completa (`venv/Scripts/python.exe -m pytest tests -q --no-cov -p no:warnings --ignore=tests/e2e`) e comparar com a
linha de base de 104 falhas antigas: nenhuma falha nova. Pronto = testes e fuzz verdes (6 sementes x 300 operações), achados na tabela
de `PLANO_TESTES_VENDAS_FIFO.md`, commit em português e push. Nunca rodar carga contra a loja 2 nem em produção (guarda:
`deploy/guarda_publicacao.py --status`).

---

## A. Estresse do condicional com FIFO
Arquivo novo: `backend/tests/test_estresse_condicional.py`. Serviço: `backend/app/services/conditional_shipment.py`.
Estender o oráculo: `recebido - restante` por camada = vendas ativas + reservas abertas de condicional + perdas/danificadas.
Cenários: criar e enviar (a peça sai ao enviar); devolução parcial e total; itens mantidos viram venda (custo FIFO certo, pontos e
total gasto da cliente); perdida/danificada vira despesa pelo custo real; envio atrasado (OVERDUE); cancelamento; mesma peça vendida
no balcão enquanto reservada em condicional (tem que recusar, nunca estoque negativo); dois envios disputando a mesma peça;
condicional nunca enviado; devolver ou trocar uma venda que nasceu de condicional. Depois fuzz com sementes fixas (`ESTRESSE_OPS`,
`ESTRESSE_SEEDS`, como em `test_estresse_aleatorio.py`) misturando condicional, vendas, devoluções, trocas e reposições, conferindo
oráculo, livro de estoque, tudo-ou-nada e nenhum 5xx.

## B. Concorrência de vendas e devoluções no Postgres
Arquivos novos em `backend/tests/pg/` (ex.: `test_concorrencia_vendas_postgres.py`), com Postgres descartável
(`TEST_PG_URL=postgresql+asyncpg://postgres@127.0.0.1:55432/postgres`; copiar como `tests/pg/test_rls_postgres.py` sobe e limpa).
Pedidos de verdade em paralelo (`asyncio.gather`, várias sessões): (1) dois pedidos para a ÚLTIMA peça (um vence, o outro 400, estoque
nunca negativo); (2) N vendas simultâneas somando mais que o estoque; (3) duas devoluções simultâneas do mesmo item (soma nunca passa
do vendido); (4) cancelar enquanto devolve; (5) reposição durante vendas; (6) troca simultânea para a mesma peça nova com estoque curto.
Suspeita principal: `FIFOService.process_sale` (`app/services/fifo_service.py`) e `ReturnService.process_return`
(`app/services/return_service.py`) leem e gravam `quantity_remaining` sem `SELECT ... FOR UPDATE` nem trava por loja. Provada a corrida,
consertar com bloqueio por linha ou por loja/variação (modelo: `sku_service.lock_catalog`, `pg_advisory_xact_lock`), ordem fixa de
bloqueio (sem deadlock) e sem bloqueio global longo. Rodar 5 vezes seguidas para provar estabilidade. O deploy do backend é automático
ao dar push (guarda de publicação): avisar no commit que muda trava de estoque.

## C. Dinheiro, lucro e relatórios
Arquivo novo: `backend/tests/test_estresse_dinheiro.py`. Livro-caixa independente no teste (receita, reembolsos, diferença paga na
troca, custo FIFO das peças que ficaram vendidas) conferido a cada operação e no fim:
1. soma dos `Payment` confirmados = total da venda; troca: reembolso + diferença (net), peça nova mais cara e mais barata, desconto
geral e por item;
2. receita líquida do dashboard e dos relatórios (`/api/v1/dashboard/*`, `/api/v1/sales/reports/*`, `/api/v1/reports/sales`) = vendas
ativas - devoluções + vendas de troca; cancelada e devolvida por inteiro fora da conta;
3. lucro = receita - custo FIFO das peças que ficaram vendidas (CLAUDE.md diz "devolução parcial NÃO abate o lucro": decidir se é bug
e corrigir; peça com defeito `restock=false`: a perda aparece em algum lugar coerente);
4. pontos de fidelidade e total gasto da cliente: ganhos - estornados nunca negativos; devolver tudo zera; a venda de troca dá pontos só
sobre o valor dela;
5. `SupplierInsightsService` não pode contar como vendida a peça devolvida (as fontes FIFO agora têm `quantity_returned` em
`sale_sources[]`, ver `return_service.py`);
6. PDF/relatório de vendas e resumo por período batem com o livro. Depois fuzz com sementes fixas conferindo tudo a cada passo.

## D. Tela de devolução e troca no navegador (opcional, depois)
Playwright com backend local descartável (ver `CLAUDE.md`, seção de QA e `backend/scripts/qa_*.py`): lista de vendas, devolver, trocar,
diferença a pagar, erros legíveis, resumo e estoque conferidos. Nada disso foi clicado ainda.
