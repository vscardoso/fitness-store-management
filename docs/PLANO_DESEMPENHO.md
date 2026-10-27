# Plano de desempenho e consultas (premissa do app)

Regra: **nenhuma rota pode ficar mais lenta nem fazer mais consultas só porque a loja cresceu.** Consulta eficiente e
verificada por teste automático, não por boa vontade. Atualizado em 2026-10-27, com números medidos na loja de teste
(loja 1: 2.614 produtos, 28.800 variações, 189 entradas, 93 fornecedores).

## Metas (o que "bom" significa)
| Medida | Meta |
|---|---|
| Leitura comum (lista, detalhe, dashboard) | mediana < 150 ms, p95 < 400 ms, medido no servidor (`/perf`) |
| Gravação (venda, entrada, produto) | p95 < 1,5 s |
| Consultas ao banco por pedido | no máximo 15 em rota de lista e 25 em rota de gravação, **sem crescer com o número de linhas** |
| Disponibilidade sob carga | 0 erro até 50 usuários simultâneos; nenhum timeout (nginx corta em 60 s) |

## Onde estamos (medido)
| Rota | Hoje | Problema |
|---|---|---|
| `GET /products` (50 itens) | 246 ms; 1000 itens = 5,3 s; ~3 consultas por produto | N+1 em `build_product_response` |
| `GET /products/{id}/suppliers` | 6,3 s, 771 consultas (corrigido em dcca57d) | recalculava preço pago da loja inteira |
| `GET /products?search=` | 19,5 s com 2.600 produtos (corrigido: agora pagina) | devolvia todos os resultados |
| `GET /suppliers` | 540 ms | consultas por fornecedor |
| `GET /products?has_stock=true` | 680 ms | monta resposta completa para IDs do FIFO |
| `POST /stock-entries/with-new-product...` | 2,6 s por produto | trava de catálogo por loja + muitas consultas por variação |
| Custo fixo de TODA rota | era 250 ms, hoje 15 a 35 ms | `NullPool` (conexão nova por sessão): resolvido com pool 10+10 |

## Fase 1: guardrails automáticos (fazer ANTES de otimizar, para a melhora não regredir)
1. **Orçamento de consultas em teste**: fixture que conta consultas por requisição (mesmo evento do `perf_trace`) e testes
   parametrizados por rota: roda com 5 e com 40 produtos e **falha se a contagem crescer com N** (detector genérico de N+1).
   Rotas cobertas de início: lista de produtos, busca, fornecedores, detalhe, dashboards, entradas, vendas, condicional.
2. **Rodar no CI** (`backend-tests.yml`): o teste de orçamento bloqueia o merge.
3. **Vigia em produção**: tarefa diária lê `/perf` (já existe) e grava aviso no registro de erros (nível warning,
   tipo `rota_lenta`) quando alguma rota passa de 500 ms de média ou de 40 consultas. Aparece no painel de erros.
4. **Regra de revisão**: toda rota nova nasce com seu teste de orçamento. Entra no `CLAUDE.md` do projeto.

## Fase 2: eliminar N+1 conhecidos (ordem pelo ganho)
1. `build_product_response` em lote: uma consulta de variações (`selectinload`), uma agregação de estoque FIFO
   (`GROUP BY product_id`), uma de fornecedor/última compra. Alvo: lista de 50 em < 120 ms e de 1000 em < 1 s.
2. `GET /suppliers` e insights de fornecedor: agregação única em vez de uma consulta por fornecedor.
3. `has_stock`, `low-stock`, busca: reaproveitar o mesmo montador em lote.
4. Entradas com vários itens (`POST /stock-entries`, 187 consultas para 6 itens): inserir em lote, rateio de custo em
   memória, uma atualização de inventário por produto (não por item).
5. Condicional, vendas, relatórios e dashboards: auditoria com o orçamento de consultas (Fase 1) e correção do que estourar.

## Fase 3: banco (índices e plano de execução)
1. `EXPLAIN (ANALYZE, BUFFERS)` das 10 consultas mais pesadas do `/perf` com a base cheia.
2. Índices compostos por loja: `(tenant_id, is_active, name)` em produtos, `(tenant_id, product_id)` em variações e itens
   de entrada, `(tenant_id, entry_date)` em entradas. Migração Alembic.
3. Busca por nome/marca/SKU com `pg_trgm` (índice GIN): o `ILIKE '%x%'` atual lê a tabela inteira.
4. Paginação por cursor (keyset) nas listas grandes, para o 20º mil produto ser tão rápido quanto o 1º.

## Fase 4: cache e menos tráfego
1. Cache de 30 a 60 s por loja nos dashboards, invalidado em toda gravação de venda/entrada.
2. `ETag` / `If-None-Match` nas listas: o app recebe 304 quando nada mudou.
3. App: `staleTime` e prefetch do detalhe na lista; não recarregar a lista inteira depois de salvar um item.

## Fase 5: infraestrutura (VPS: 2 CPUs, 3,8 GB)
Hoje: 1 processo do backend (um único event loop), limite do container 1 GB, uso real ~215 MB. **Memória não é o gargalo;
o processo único é.** Mudança proposta:
- `uvicorn --workers 2` (um por CPU) e pool 10+10 por worker (40 no total, o Postgres aceita 60).
- Limite do container de 1 GB para 1,5 GB (sobram 1,5 GB para Postgres, n8n e WAHA).
- **Pré-requisito**: o agendador (`APScheduler`) não pode rodar nos dois workers (jobs em dobro). Deixar só no worker 1 ou
  trocar por trava no banco antes de subir o segundo worker.
- Guardar o `/perf` por worker (hoje é por processo) ou agregar no banco.

## Fase 6: teste de carga recorrente
`backend/scripts/carga_degraus.py` (5, 10, 25, 50, 100, 200 usuários, pela URL pública, da máquina do Victor). Rodar antes
de release grande e depois de qualquer mudança de infraestrutura. Registrar o ponto de quebra e comparar com o anterior.
Regras: só na loja 1, nunca com deploy em andamento (conferir `git log origin/main` e a guarda).

## Ordem recomendada
1. Fase 1 (guardrails) + Fase 2 itens 1 e 2 (lista de produtos e fornecedores): maior ganho e protege o resto.
2. Fase 3 (índices e trigram): ganho grande com risco baixo.
3. Fase 5 (2 workers), depois de resolver o agendador.
4. Fase 2 itens 4 e 5, Fase 4 e Fase 6 em rotina.
