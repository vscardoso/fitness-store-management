# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Stack
FastAPI (Python 3.11) + React Native/Expo + Next.js (landing page). Para mudanças multi-camada ver AGENT_ORCHESTRATION.md (comando `🔄 FULL-STACK`).

## Backend: 3 camadas
`API → Service → Repository`. Nunca acessar DB na API, nunca lógica de negócio no Repository.
- Tudo async/await com AsyncSession
- Soft delete OBRIGATÓRIO: `is_active=False`, NUNCA hard delete
- Modelos extendem `BaseModel` (id, created_at, updated_at, is_active, **tenant_id**) — `backend/app/models/base.py`
- **Multi-tenancy**: todo modelo tem `tenant_id` (FK para `stores.id`). Endpoints filtram por tenant via `X-Tenant-Id` header.
- BaseRepository já tem: get, get_multi, create, update, delete, count, exists, get_by_field
- Auth deps: `get_current_user`, `require_role()` — `backend/app/api/deps.py`
- Enums centralizados: `backend/app/models/enums.py`

## Estoque: todo produto vinculado a StockEntry
`initial_stock > 0` cria entrada INITIAL_INVENTORY automaticamente. Fluxo: StockEntry → EntryItem (FIFO) → Inventory.quantity. EntryType: TRIP, ONLINE, LOCAL, INITIAL_INVENTORY, ADJUSTMENT, RETURN, DONATION.

## Mobile
- Expo Router file-based, React Query para server state, Zustand para client state
- Após mutations: `queryClient.invalidateQueries()` SEMPRE
- API URL: `mobile/constants/Config.ts` (único lugar)
- **Loading automático**: todas as requests mostram loading overlay via `loadingManager`. Para controlar:
  - `{ headers: { 'X-Skip-Loading': 'true' } }` — desabilita loading
  - `{ headers: { 'X-Loading-Message': 'Salvando...' } }` — mensagem customizada
- **Token refresh automático**: interceptor em `mobile/services/api.ts` tenta refresh silencioso em 401 antes de forçar logout
- UI: sem Dividers, usar margin/gap. `headerShown: false` em telas com header custom.
- Componentes UI reutilizáveis em `mobile/components/ui/`: PageHeader, BottomSheet, ConfirmDialog, EmptyState, StatCard, Badge, DateTimeInput, etc.

## Web (Landing Page)
Landing page em `web/` focada em conversão para download do app mobile.

- **Framework:** Next.js 14+ (App Router)
- **Styling:** Tailwind CSS + shadcn/ui
- **Animações:** Framer Motion
- **Icons:** Lucide React
- **Deploy:** Vercel (planejado)

**Público-alvo:** Lojistas de fitness/suplementos que precisam de um sistema de gestão.

**Seções planejadas:** Hero → Problema/Solução → Funcionalidades → Screenshots → Depoimentos → CTA Final

**Padrões de UI:**
- Mobile-first (375px baseline)
- Sem emojis como ícones (usar Lucide React)
- Contraste mínimo 4.5:1
- Animações 150–300ms
- Tokens semânticos (nunca hex hardcoded nos componentes)

**Skill de design disponível:** `ui-ux-pro-max` em `.agents/skills/ui-ux-pro-max/`
```bash
python3 ../.agents/skills/ui-ux-pro-max/scripts/search.py "fitness store ecommerce landing" --design-system --persist -p "FitnessStore"
```

## Comandos
```powershell
# Backend
cd backend && .\venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
python migrate.py "descrição"   # migration: gera + aplica

# Mobile
cd mobile && .\expo-dev.ps1
.\expo-dev.ps1 -Tunnel          # device físico
.\kill-all.ps1                  # se travar

# Web
cd web && npm run dev
```

## Mudanças backend: Model → Schema → `python migrate.py` → Service → Endpoint
## Mudanças mobile: Type → Service → Component → Screen → invalidateQueries

## Modelos chave
- **Product**: name, sku, barcode, cost_price, sale_price → category, inventory, variants, media (galeria)
- **Customer**: loyalty_points, total_spent, customer_type (REGULAR/VIP/PREMIUM) — auto-upgrade R$10k/R$25k
- **Inventory**: quantity = sum(EntryItem.quantity_remaining) — nunca atualizar diretamente
- **Sale**: customer_id, total_amount, payment_method, status
- **ConditionalShipment**: envio condicional (try before you buy) — ConditionalShipmentItem com status PENDING/KEPT/RETURNED/LOST
- **Supplier / SupplierProduct**: fornecedores vinculados a produtos com preço e frequência
- **Trip**: viagem de compras com StockEntries associadas
- **Expense**: despesas operacionais (P&L)
- **Look**: combinações de produtos (outfit)

## Auth
`POST /api/v1/auth/login` → access_token + refresh_token. 401 → refresh silencioso → se falhar, limpa AsyncStorage + invalida React Query cache → redirect via _layout.tsx.

## Pitfalls
- SQL raw: usar `= true/false`, nunca `= 1/0` para BOOLEAN (PostgreSQL)
- Não mutar cache React Query manualmente
- Não criar produto com estoque sem StockEntry
- Não esquecer `tenant_id` ao criar registros manualmente (BaseRepository já cuida em operações normais)
- Botões com `position: absolute` devem ser evitados — usar scroll ou sticky footer adequado


## Slash commands do projeto (`.claude/commands/`)

- `/backend` — Modo backend expert: arquitetura 3 camadas, FIFO, multi-tenant, migrations
- `/mobile` — Modo mobile expert: Expo Router, React Query, Zustand, UI conventions
- `/web` — Modo web expert: Next.js 14, Tailwind, endpoints públicos, carrinho WhatsApp
- `/pdv` — Especialista PDV: TEF, Stone/Cielo, PIX, terminals, fluxo de checkout
- `/billing` — Especialista faturamento: assinaturas, Mercado Pago, MRR, DRE, churn
- `/fullstack` — Orquestração multi-camada: ADD-FIELD, NEW-FEATURE, MODIFY-FLOW, FIX, REFACTOR
- `/quick-reference` — Referência rápida: tipos, prompts UI-UPGRADE prontos, tokens, checklist


## Permissões bash

Os seguintes padrões de comando são seguros e podem ser aprovados automaticamente:
- cd para diretórios do projeto + py_compile
- cd para diretórios do projeto + pytest
- cd para diretórios do projeto + alembic

## Log de sessão (2026-10-20): grade tamanho x cor

Feito: normalização de tamanho/cor (`backend/app/utils/variant_grid.py`), ordem natural dos tamanhos, totais na grade, matriz de estoque no app (`mobile/components/products/VariantStockMatrix.tsx`), correção do 500 em `POST /product-variants/bulk` (lazy-load de `entry_items`), tooltip do tutorial reativo ao tamanho da janela (`useWindowDimensions`) e botão "?" da home ligado ao tutorial `dashboard`.

Problemas conhecidos, não corrigidos:
- `mobile/app/(auth)/onboarding.tsx`: crash no web quando `SCREEN_WIDTH` vale 0 (`inputRange must be monotonically non-decreasing 0,28,0`). Contorno em teste: `localStorage.setItem('@fitness_store:onboarding_completed','true')`.
- Backend: 110 testes antigos falham (e-mails duplicados, testes desatualizados) e `tests/e2e/test_catalog.py` importa `get_async_session`, que não existe.
- `Config.ts` usa IP fixo de fallback (192.168.0.70:8000) no app web; para testar local o backend precisa escutar em `0.0.0.0`.
- Metro em `CI=1` não relê arquivos alterados: reiniciar o Metro a cada mudança ao validar no navegador.

## Carregamento (lupa) e categorias (2026-10-21)

- Todo indicador de carregamento do app é a lupa animada `mobile/components/ui/MagnifierLoader.tsx`. Ela exporta `ActivityIndicator` com a mesma interface (`size`, `color`, `animating`, `style`): em código novo, importe `ActivityIndicator` de `@/components/ui/MagnifierLoader`, nunca de `react-native` nem de `react-native-paper`.
- `LoadingOverlay` (carregamento global via `loadingManager`) agora é um cartão claro com a lupa sobre um véu branco translúcido (rgba 255,255,255,0.62: esbranquiça a tela mas deixa ver o que está por baixo), que também bloqueia toques durante o carregamento. Lupa grande (>= 36 px) de tela some enquanto o carregamento global aparece (`MagnifierLoader` assina o `loadingManager`; só o overlay usa `alwaysShow`), para não ficarem duas lupas uma sobre a outra. Spinners internos de `Button loading` do react-native-paper e `ProgressBar` não foram trocados.
- `CategoryPickerModal` aceita `allowCreate` e cria a categoria dentro do seletor (nome duplicado seleciona a existente). Ligado em `WizardStep1`, `WizardStep2` e `products/edit/[id]`. O backend só permite criar categoria para ADMIN e MANAGER (`require_role`); vendedor recebe mensagem de permissão (403 ainda não testado com usuário vendedor).
- `onboarding.tsx` usa `useWindowDimensions` (corrigido o crash com largura 0 no web).

## Fornecedores, Fase 1 (2026-10-21)

- Entrada tem fornecedor padrão (`stock_entries.supplier_id`); cada item pode ter o seu (`entry_items.supplier_id`, padrão: o da entrada). O servidor aceita `supplier_id` ou `supplier_name` (acha por nome sem acento/caixa ou CNPJ, ou cria o cadastro).
- `supplier_products` é atualizado sozinho por entrada (1 compra por fornecedor x produto, custo médio ponderado). Alimenta o card "Fornecedores" do produto e o selo "mais barato / mais frequente" (só quando há diferença real).
- `StockEntryService.create_entry` valida tudo (fornecedor, custo, variação) ANTES de criar a entrada, porque `StockEntryRepository.create` faz commit: erro depois dele deixaria entrada vazia gravada.
- Colunas novas: migração Alembic `20261021_entry_supplier` e, no SQLite dev, `_ensure_sqlite_columns` em `app/core/database.py` (create_all não altera tabela existente).
- `backend/scripts/backfill_suppliers.py` (idempotente; sem `--apply` só simula) migra os fornecedores antigos escritos como texto. Aplicado na base de demonstração em 21/10/2026 com backup `fitness_store_demo.db.bak-antes-fornecedores-20261021`. Entradas de estoque inicial do sistema são ignoradas.
- Armadilha: shell do Bash tool quebra com scripts Python muito longos em heredoc; gravar o script em arquivo e rodar.

## Fornecedores, Fase 2 (2026-10-21)

- Serviço `backend/app/services/supplier_insights_service.py` + endpoints `GET /suppliers/ranking|cost-comparison|restock-list` (registrados ANTES de `suppliers.router` para `/ranking` não cair em `/{id}`). Vendas ligadas ao fornecedor via `SaleItem.sale_sources` (FIFO).
- Nota do ranking = 60% giro + 40% margem; fornecedor com menos de 5 un vendidas fica "poucos dados". Reposição: variação vendida no período com estoque <= 2; sugestão cobre 30 dias; grupo "Sem fornecedor definido" quando não há vínculo.
- App: `app/suppliers/ranking.tsx`, `costs.tsx`, `restock.tsx`, abas em `components/suppliers/SuppliersTabs.tsx`; WhatsApp via `wa.me` (sem expo-clipboard, no web copia com `navigator.clipboard`).
- Documento do fornecedor (`cnpj`) é opcional e aceita CPF ou CNPJ (`validate_cpf_cnpj`, `documentMask`, `documentLabel`); muitos fornecedores de feira (Brás) são pessoa física ou sem documento.
- Testes: `backend/tests/test_supplier_insights.py`. QA ponta a ponta foi feito com script em backend de teste separado (porta 8766).

## Persistência tudo-ou-nada (2026-10-21)

Regra do Victor: nada fica gravado até a operação terminar com sucesso; falha ou abandono = rollback (ou volta ao último estado bom). Produto sem estoque não é criado "antes".
- Service faz UM commit no fim (`flush` no meio) e `rollback` em qualquer erro. Repositórios com `commit` próprio (`StockEntryRepository.create`, `ConditionalShipmentRepository.create_with_items/update_status`) recebem `commit=False` quando chamados dentro de uma operação maior; validar tudo ANTES de chamar um repo que commita.
- Produto novo + entrada existente: `POST /stock-entries/{id}/with-new-product` (produto, variações e itens numa transação). O app não cria produto antes de escolher a entrada (`pendingProductImage` guarda a foto até o sucesso).
- Itens de entrada: `variant_id` tem que pertencer ao produto; produto com várias variações exige `variant_id`; custo obrigatório (zero só em doação), inclusive ao vincular a entrada existente.
- Envio condicional: criar e processar devolução são atômicos (envio sem reserva e devolução sem venda não existem mais).
- `GET /inventory/product/{id}` devolve estoque 0 para produto sem linha de estoque (404 só se o produto não existe).
- Auditoria repetível (servidor de teste na 8766 com banco próprio, ver cabeçalho de cada script): `backend/scripts/qa_atomicidade.py`, `qa_envio_condicional.py`, `qa_devolucao_cancelamento.py`, `qa_cadastros.py`.
- Typecheck do mobile deve ficar em 0 erros (`npx tsc --noEmit`).

## Resumo da sessão de 2026-10-21 e próximos passos

Feito: fornecedores Fase 1 e 2 (ranking, custos, reposição), CPF/CNPJ opcional, grade/produto sem estoque ("Dar entrada", escolher variações a usar), entrada a partir do catálogo com uma linha por variação, produto novo + entrada existente numa transação, auditoria tudo-ou-nada (vendas, entradas, envio condicional, devolução, cadastros) com scripts em `backend/scripts/qa_*.py`, typecheck do mobile em 0.

Subir o ambiente: backend `cd backend; .\venv\Scripts\python -m uvicorn app.main:app --host 0.0.0.0 --port 8000` e app `cd mobile; npx expo start --port 8081` (sem `--web`, para não abrir aba).

Pendente / não testado no navegador: modal "Vou usar só algumas variações", expansão de variações na nova entrada, banner de produto sem estoque.
Próximos passos sugeridos: (1) testar o fluxo completo no app; (2) Fase 3 de fornecedores (contas a pagar, devolução ao fornecedor, XML de NF-e); (3) `.gitignore` para DEBUG_LOG.txt, coverage.xml e backups .bak.

## Notificações (2026-10-22)

- Caixa de alertas da loja: tabela `app_notifications` (migração `20261022_app_notifications`), serviço `backend/app/services/app_notification_service.py`, rotas `GET /notifications/inbox`, `GET /notifications/inbox/unread-count`, `POST /notifications/inbox/{id}/read` e `/inbox/read-all`.
- Alertas gerados sozinhos ao consultar (idempotente): `low_stock` (estoque total <= soma dos `min_stock`, só quando `min_stock` > 0) e `out_of_stock` (estoque 0 de produto que já teve entrada). Alerta some quando o estoque se recupera e volta a alertar numa nova queda. Caixa compartilhada pelo tenant (leitura não é por usuário).
- App: `app/notifications.tsx` (Central), `hooks/useNotificationInbox.ts`, selo no menu Mais. Push real (expo-notifications) NÃO ligado a esses alertas ainda; no web a permissão de notificação fica bloqueada.
- Teste: `backend/scripts/qa_alertas.py` (servidor de teste na 8766 com `qa_alert.db`), 15 verificações, TUDO OK.
- Pendente: preferências por tipo de alerta, alerta de produto parado, despesa recorrente do dia, push real.

## Decisões de produto e infra (2026-10-22)

- **Produto**: nome candidato **Provador**, domínio `provadorfit.com.br` (Victor vai registrar no Registro.br; falta busca de marca no INPI e checar Play Store). Subdomínios: `api.`, `app.` e e-mails (`admin@`, `suporte@`) nele. O `wamodafitness.com.br` continua sendo o site da W.A. O endereço da API fica gravado no APK: definir o domínio ANTES de gerar o APK. Identificador do pacote Android (ex.: `br.com.provadorfit.app`) é permanente depois de publicado.
- **Multi-loja**: todas as lojas usam o mesmo endereço; cada uma só precisa de login (tenant). Domínio próprio da loja só para catálogo online (opcional, futuro).
- **Meta comercial**: 100 lojas a R$ 94/mês. Preço dos concorrentes NÃO verificado (ver `PLANO_PRODUTO.md`); piloto com 3 a 5 lojas antes de cravar.
- **Hospedagem**: sair do Render (Starter, Docker) e do Neon (cota estourou em 21/10/2026, login em produção dá 500, deploys falham em ~30 s no `db_init`). Vai para o VPS Hetzner 204.168.144.151 (Ubuntu 22.04, 2 vCPU, 3,7 GB RAM, disco 38 GB com 85% usado: `/var/log` 4,2 GB, `/root` 11 GB). Já roda n8n (5678) e nginx (80/443, site wamodafitness.com.br com certbot). Sem Postgres local, `ufw` desligado, portas 631 (cups) e 5678 abertas. Plano: containers de backend + Postgres, nginx existente como proxy, certbot, backup diário do `pg_dump` fora do VPS, banco novo e vazio.
- **Distribuição do app**: app web (PWA) em `app.` + APK direto para Android (build EAS ou local). Push usa o serviço do Expo. Loja de apps só depois.
- **E-mail**: caixas da equipe no Zoho (grátis, conferir limites) ou Google Workspace; e-mails automáticos do app via Resend (SPF/DKIM no DNS do Registro.br).

## Dev pendente / fase 2 (anotado em 2026-10-22)

- **PDV**: não há conector universal de maquininha. Padrão = confirmação manual (qualquer marca): débito/crédito/PIX registrados pela lojista, NSU opcional. Hoje o checkout manda débito/crédito para a Cielo ("sempre via Cielo") e `PIX_PROVIDER` padrão é `mock` (SEMPRE aprova): bloquear `mock` em produção e fazer cartão/PIX caírem em manual quando não há terminal. Integrações (Cielo LIO, Stone, Mercado Pago Point) viram plugins opcionais por demanda (estrutura por provider/factory já existe). Nada disso foi testado com maquininha real.
- **Taxa da maquininha por loja** (débito, crédito, parcelas) para calcular margem real.
- **Etiquetas**: impressão incompleta.
- **Notificações**: preferências por tipo de alerta, produto parado, despesa recorrente do dia; push só testado com Expo falso (`qa_push_alertas.py`).
- **Despesa recorrente** não gera o lançamento do mês seguinte (só guarda `is_recurring`/`recurrence_day`).
- **Renomear** app/pacote/textos "Fitness Store Management" para Provador depois da decisão do nome.
- **Menus de fase 2** visíveis no app e não prontos (Lookbook, Wishlist e outros): esconder antes de liberar para lojas.
- Fase 3 de fornecedores (contas a pagar, devolução ao fornecedor, XML de NF-e); `.gitignore` para `DEBUG_LOG.txt`, `coverage.xml`, `*.bak-*`.
- **Registro de erros** (2026-10-23): tabela `error_logs` (migração `20261024_error_logs`), gravada por `app/services/error_log_service.py` em sessão própria e sem nunca derrubar a requisição; senha/token/chave/CPF viram `***`; guarda 30 dias. Grava: todo 5xx, e 4xx de rotas de gravação (POST/PUT/PATCH/DELETE) exceto 401 (ver `should_log`); erros do app chegam por `POST /api/v1/client-logs`; ajuste automático de SKU entra como `error_type='sku_ajustado'` (nível info). Ler no VPS: `ssh -i ~/.ssh/provador_deploy root@204.168.144.151` e `cd /opt/provador; docker exec provador-db psql -U $(grep ^POSTGRES_USER .env.prod|cut -d= -f2) -d $(grep ^POSTGRES_DB .env.prod|cut -d= -f2) -c "select id, created_at, status_code, method, path, left(message,120) msg from error_logs order by id desc limit 30"`; o admin lê `GET /api/v1/error-logs?limit=50&min_status=400`. Corrida de SKU: criação de produto/variação/entrada é serializada por loja com `pg_advisory_xact_lock` (`_lock_catalog`) e SKU repetido vira o próximo número (`_resolve_free_skus`) em vez de erro; teste real em `tests/pg` (sem o bloqueio gera SKU repetido, com ele não). `POST /stock-entries/{id}/variants` lança outra variação (cor/tamanho) de produto já cadastrado numa entrada existente, criando a variação se faltar.
- **Custo por lote** (2026-10-23, PUBLICADO na main em ab779c9; migração `20261023_lot_costs` aplicada em produção, 22 itens existentes ficaram com custo extra 0): `entry_items.extra_unit_cost` guarda o rateio por peça do custo do lote; custo posto = `unit_cost + extra_unit_cost` (propriedade `landed_unit_cost`) e é o que o FIFO grava na venda (`SaleItem.unit_cost`), o CMV e o valor do estoque usam. Rateio em `app/services/lot_cost_service.py`: custo da viagem (custos de viagem + despesas com `trip_id`) dividido entre os lotes da viagem proporcional ao custo de mercadoria; despesas com `stock_entry_id` vão só para aquele lote; dentro do lote, proporcional ao custo de cada item. Despesa geral (sem lote/viagem) continua só no resultado do mês; despesa de lote/viagem NÃO entra em `sum_by_period` (já está no CMV) e `trip_costs` do P&L passou a 0. Recalcula em: despesa criada/editada/apagada, viagem editada (o total agora acompanha os componentes), entrada criada/editada/apagada, item adicionado/editado/corrigido. Peças já vendidas mantêm o custo da venda; custo lançado depois só afeta o saldo (ajuste pós-venda ainda NÃO existe). API: `GET /stock-entries/{id}/analytics` (receita real das fontes FIFO, lucro, margem, % recuperado, projeção), `/{id}/costs`, `/profit-ranking`; `expenses` aceitam `stock_entry_id` ou `trip_id`. App: cartão "Quanto rendeu esta entrada" na entrada, escolha "De onde vem este gasto?" na despesa, tela Lucro por Lote, Resultado do Mês em linguagem simples. Regra de texto: nada de CMV/ROI/margem bruta na tela, o cliente quer entender o dinheiro. Data da entrada agora é editável (retroativa; futuro recusado). Migração `20261023_lot_costs` (aditiva; testada no Postgres: upgrade, downgrade, upgrade). Testes: `tests/test_lot_costs.py`.
- **Limite de usuários por plano** (2026-10-23): `backend/app/core/plans.py` (trial 3, free 1, pro 5, enterprise ilimitado), checado em `POST /team`, `PATCH /team/{id}/activate` e `POST /auth/register` por `app/services/team_limit.py` (conta só usuários ATIVOS; 403 com mensagem). Testes: `tests/test_team_limit.py`. Duas lojas de produção não passam de 1 usuário hoje. Concorrência: duas criações simultâneas no limite podem passar (sem trava de linha).
- **Permissões por papel** (2026-10-23): matriz única em `backend/app/core/permissions.py` (caixa < vendedor < gerente < admin; vale em adição aos `require_role` das rotas; rota autenticada sem regra cai em gerente). Testes: `tests/test_permissions.py` (toda rota tem regra; matriz nunca mais frouxa que o guard; 56 chamadas por papel). Rota nova de API exige regra em `RULES`. App: início e menu "Mais" escondem painel, despesas, relatórios e fornecedores para caixa/vendedor. Pendente: campos de custo ainda aparecem nas respostas de produtos para caixa/vendedor (sem máscara por campo); `POST /returns/reconcile-status` é inalcançável (a rota `/returns/{sale_id}` casa antes); limite de usuários por plano (`max_users`) nunca aplicado.
- **RLS por loja no Postgres** (2026-10-23): código pronto e DORMENTE (`RLS_ENABLED=false`), commit local `16ff277`, NÃO publicado nem aplicado em produção. Para ligar: (1) criar papel sem superusuário e rodar `backend/scripts/rls_apply.py --dry-run` e depois sem `--dry-run` (manual; o alembic roda no startup, por isso não é migração), (2) apontar `DATABASE_URL` para o papel `provador_app`, (3) `RLS_ENABLED=true`. Rollback: `rls_apply.py --rollback`. Testes: `TEST_PG_URL=postgresql+asyncpg://postgres@127.0.0.1:55432/postgres pytest tests/pg --no-cov` (Postgres local descartável).
- **CI Backend Tests vermelho** (desde antes de 2026-10-23, commits `418c507`, `a5df64c`, `8442337` e seguintes): medido localmente em 23/10/2026, 100 testes falhando e 21 com erro de 247 (`pytest tests --ignore=tests/e2e`), por fixtures e suítes antigas. `tests/e2e/test_catalog.py` nem importa (`get_async_session` não existe em `app.core.database`). Consertar ou remover os testes mortos para o CI voltar a ser sinal confiável; os testes novos de segurança (`tests/test_auth_hardening.py`) passam.

## Servidor de produção no VPS (2026-10-22)

- Backend + Postgres rodando em `/opt/provador` no VPS (compose `docker-compose.prod.yml`, `.env.prod` com segredos só no servidor, modo 600). Backend em `127.0.0.1:8000`, nginx site `provador-api` na porta 80 para `api.provadorfit.com.br`; Postgres sem porta publicada; `DATABASE_SSL=disable` (sem isso o código exige SSL por causa do Neon/Render).
- Testado por IP com `deploy/smoke_test.py` (cadastro, login, produto com entrada, venda, estoque, alerta, recusas): TUDO OK. Falta HTTPS (certbot) quando o DNS `api.` propagar; depois, apontar o app para `https://api.provadorfit.com.br/api/v1`.
- Backup: `backup_pg.sh` no cron às 03:15, com restauração testada (dump restaurado em banco temporário, contagens iguais). AINDA SEM cópia fora do VPS (`REMOTE` do rclone não definido): obrigatório antes de uso real.
- O banco de produção ainda tem lojas de TESTE (smoke): recriar vazio (`docker compose ... down -v` e `up -d`) antes de cadastrar a loja real.
- Bug achado pelo smoke test: `RefreshToken` não estava importado em `app/models/__init__.py`; banco novo (create_all + stamp) ficava sem `refresh_tokens` e o login dava 500. Corrigido (e3837f4).
- Incidente: em 22/10/2026 a Hetzner bloqueou o IP do servidor por fatura em aberto (e-mail "Final Payment Warning"), derrubando também o site da W.A. Resolvido pagando e pedindo o desbloqueio no Robot. Manter cartão reserva e e-mail de cobrança secundário.
- VPS: ufw ativo (22, 80, 443, 5678). Container `moneyprinterturbo-api` em loop de reinício (projeto rejeitado): decidir se remove.

### Atualização (2026-10-22, tarde): produção no ar com HTTPS

- `https://api.provadorfit.com.br` (nginx + certbot, renovação automática, expira 2027-01-20) e `https://app.provadorfit.com.br` (app web estático em `/var/www/provador-app`, site nginx `provador-app`, rota SPA com `try_files`). DNS no Registro.br (zona com `api` e `app` apontando para o VPS). CORS só aceita `app.provadorfit.com.br` e `provadorfit.com.br`.
- Publicar nova versão do app web: `cd mobile && EXPO_PUBLIC_API_URL=https://api.provadorfit.com.br/api/v1 CI=1 node node_modules/expo/bin/cli export --platform web`, depois `scp -r dist/* root@204.168.144.151:/var/www/provador-app/`. `Config.ts` agora usa a API nova como padrão de produção (não aponta mais para o Render).
- Banco de produção recriado VAZIO em 22/10/2026 (0 lojas, 39 tabelas); a primeira loja real será a store_id 1. Smoke test: `backend/venv/Scripts/python deploy/smoke_test.py https://api.provadorfit.com.br/api/v1 ""` (cria loja de teste: NÃO rodar depois que houver dados reais sem apagar a loja de teste).
- Ainda pendente: cópia do backup fora do VPS (REMOTE/rclone), APK Android, título da aba "Fitness Store" e textos para "Provador", desligar Render/Neon, e-mail (Zoho/Resend), trocar senha de root e desativar SSH por senha.
- Backup fora do VPS FEITO (22/10/2026): `rclone` com destino `gdrive` (Google Drive, escopo `drive.file`, só enxerga o que ele cria), pasta `provador-backups`, `REMOTE=gdrive:provador-backups` no `.env.prod` do servidor. O script confere o tamanho no destino e guarda 30 dias. Token em `/root/.config/rclone/rclone.conf` (600). Para reautorizar: `rclone authorize drive --drive-scope drive.file --auth-no-open-browser` no VPS + túnel `ssh -L 53682:127.0.0.1:53682`.

### App instalável (PWA, 2026-10-22)

- `mobile/public/` (manifest.json, sw.js, icon-192/512, apple-touch-icon) vai para o `dist` no export. O modo `single` do Expo ignora `app/+html.tsx`, então `node scripts/pwa-postbuild.js` injeta as tags no `dist/index.html` (rodar entre o export e o scp). Service worker mínimo, sem cache (sempre dados e versão atuais).
- Publicar: export, `node scripts/pwa-postbuild.js`, `scp -r dist/* root@204.168.144.151:/var/www/provador-app/`. Instalar: Chrome Android (menu > Instalar app), iPhone (Safari > Compartilhar > Adicionar à Tela de Início), Windows (Chrome/Edge > Instalar).
- Ícone atual é o `assets/icon.png` antigo e cor do tema provisória (#7C3AED); trocar quando houver a marca Provador.


## Segurança do VPS e backups criptografados (2026-10-22, noite)

- **SSH endurecido** (`/etc/ssh/sshd_config.d/99-hardening.conf`): só chave pública, sem senha, `PermitRootLogin prohibit-password`, `MaxAuthTries 3`, X11 desligado. Testado: chave entra, senha recusada. Antes havia 8.175 tentativas de força bruta em 24 h. **fail2ban** ativo (sshd: 3 falhas em 10 min = banido 1 dia). Porta 631 (cups via snap) desligada. Sessão root esquecida no console encerrada. Se perder a chave `provador_deploy`: recuperar pelo console da Hetzner (Rescue / Reset root password), a senha de SSH não funciona mais.
- **Backups criptografados com age**: `deploy/backup_pg.sh` gera `provador-*.sql.gz.age` usando a chave pública `/opt/provador/backup_recipient.pub`. A chave PRIVADA fica só neste PC em `~/.ssh/provador_backup` (nunca no VPS). **Guardar uma cópia dela no gerenciador de senhas: sem ela os backups não abrem.** Abrir: `age -d -i ~/.ssh/provador_backup arquivo.sql.gz.age | gunzip` (ou pyrage). Testado: cifrado sem texto legível, abre com a chave certa (39 tabelas), recusa chave errada. Dumps antigos sem criptografia apagados do VPS e do Drive.
- **Ainda aberto**: porta 5678 do n8n pública (Docker publica por cima do ufw; não mexi por regra); WAHA: ver a seção própria abaixo (a sessão caiu em 22/10/2026 com `device_removed` e não será reconectada).

### WAHA (WhatsApp da loja): CAIU, não reconectar (2026-10-22)

- **Estado atual:** às 18:23 de 22/10/2026 o WhatsApp mandou `device_removed` e a sessão `default` ficou `FAILED`. Causa desconhecida (volume de leituras, marcação de etiqueta ou outra coisa; não foi apurada). A conta principal da loja NÃO foi banida. **Decisão do Victor: não reconectar o WAHA nem a Evolution.** O WAHA e o proxy `waha-guard` seguem instalados no VPS, parados em `FAILED`, só leitura (envio bloqueado com 403). Se alguém religar, trocar antes a chave de API e a senha do painel (apareceram em conversa).
- **O que o WAHA mostrou antes de cair:** os leads dos anúncios chegam como `@lid` (identificador novo do WhatsApp, sem telefone): 0 de 283 resolveram telefone. Etiquetas só existem no app da loja (o canal oficial não sincroniza).
- **Caminho decidido:** WhatsApp oficial pela Cloud API da Meta, direto, no telefone fixo da loja, sem provedor pago. Plano e variáveis em `docs/whatsapp-cloud-plano.md`; quem constrói está em `docs/COORDENACAO.md`.
- O texto abaixo descreve como o WAHA estava ANTES da queda (histórico):

#### WAHA conectado, somente leitura (histórico, antes da queda)

- WAHA Core em `/opt/waha` (compose e proxy em `deploy/waha/`), motor NOWEB, sessão `default` conectada ao WhatsApp Business da loja (QR escaneado). Store ligado, `fullSync` desligado, `markOnline` falso (celular continua recebendo notificação), `ignore` de status, grupos, canais e broadcast = true (confirmado na API: 0 grupos entre 674 chats).
- **Só o proxy `waha-guard` escuta**, em `127.0.0.1:3001`: permite GET de etiquetas, chats e contatos e PUT só para marcar etiqueta; QUALQUER envio, logout, apagar sessão e o painel dão 403 (testado). O WAHA não publica porta. A chave de API fica só no `.env` do servidor (600) e é injetada pelo proxy. Painel desligado. Se cair a sessão: religar o painel (`WAHA_DASHBOARD_ENABLED`), reiniciar a sessão e escanear o QR (reconexão por reinício do container foi testada sem QR).
- Dado real: etiqueta "Novo cliente" tem 283 chats; etiquetas de produto quase vazias (interesse virá de anúncio, formulário e mensagens). 15 etiquetas visíveis (12 dele + 3 do WhatsApp).
- Regra: só tratar como lead chat com etiqueta de funil ou origem em anúncio; nunca gravar chat de contato pessoal.

## E-mail do domínio (2026-10-22, noite)

- **Zoho Mail, plano Correio Lite**: 1 usuário, R$ 60/ano (5 GB), contratado por ele. Caixa `admin@provadorfit.com.br` (titular Victor) e `suporte@provadorfit.com.br` como ALIAS da mesma caixa (nome de exibição "Provador Fit"). O plano grátis do Zoho não é mais oferecido. Painel de admin: `mailadmin.zoho.com`.
- **DNS no Registro.br** (zona do domínio): 3 MX (mx.zoho.com 10, mx2.zoho.com 20, mx3.zoho.com 50), SPF `v=spf1 include:zohomail.com ~all`, DKIM `zmail._domainkey` (conferido caractere a caractere contra o painel), DMARC `_dmarc` com `p=none` e relatórios para `admin@`, mais o TXT de verificação do Zoho. No Registro.br o nome em branco = domínio principal (digitar `@` cria um host chamado "@", erro já cometido e corrigido).
- Teste real: e-mail do Gmail para `suporte@` chegou na caixa (19:54). Falta provar SPF e DKIM PASS no envio.
- **Para o e-mail automático do app (Resend)**: só pode existir UM registro SPF, então juntar `include:` dos dois provedores. Registros de ZeptoMail que o Zoho sugere (bounce-zem, 22154326._domainkey) não são usados.

## WhatsApp oficial, Cloud API da Meta (2026-10-23)

- Plano, variáveis (só nomes) e estado em `docs/whatsapp-cloud-plano.md`; divisão de trabalho entre as sessões em `docs/COORDENACAO.md`.
- Webhook `GET/POST /webhooks/whatsapp-cloud` (`app/webhooks/whatsapp_cloud.py` + `app/services/whatsapp_cloud_service.py`), tabelas `whatsapp_cloud_numbers`, `whatsapp_conversations`, `whatsapp_messages` (migração `20261023_whatsapp_cloud`). A loja vem do `phone_number_id` do evento: vincular com `backend/scripts/wa_cloud_vincular_numero.py`. O webhook antigo `/webhooks/whatsapp` (bot Baileys) é outro.
- Testes: `tests/test_whatsapp_cloud.py` (SQLite) e `tests/pg/test_whatsapp_cloud_postgres.py` (Postgres local, `TEST_PG_URL`).
- Variável nova de ambiente em produção precisa ser listada em `deploy/docker-compose.prod.yml` (`environment:`); só gravar no `.env.prod` não basta.
- Testes num ambiente limpo: `SECRET_KEY=<qualquer, 32+ caracteres> DATABASE_URL=sqlite:///./test.db ENVIRONMENT=test pytest ...` (com `sqlite+aiosqlite://` o engine de teste quebra).
- **Desconto do fornecedor na entrada** (2026-10-23): `stock_entries.discount_amount` (migração aditiva `20261025_entry_discount`, default 0). Entra no rateio como custo negativo: `extra = viagem + despesas do lote - desconto` (limitado à mercadoria; custo posto nunca negativo), então `extra_unit_cost` pode ser negativo e `total_investment` já vem abatido. Aceito em `POST /stock-entries/`, nos dois `with-new-product*` e em `PUT /stock-entries/{id}` (recalcula). `/analytics` e `/costs` devolvem `discount_amount`. App: campo na seção Pagamento da Nova Entrada e botão "Informar desconto do fornecedor" no cartão da entrada. Peças já vendidas mantêm o custo da venda (sem ajuste retroativo). Testes: fim de `tests/test_lot_costs.py`.
- **Troca, prazo e devolução ao fornecedor** (2026-10-23): `stores.return_window_days` (padrão 7, 0 a 90) e `stores.allow_money_refund` (false = a loja só troca peça), editáveis por admin em `GET/PUT /store/return-settings` (app: Mais > Prazo de troca e devolução). Troca = devolução com `replacement_variant_id` por item em `POST /returns/{sale_id}`: na mesma transação a peça devolvida volta ao estoque (ou não, com `restock=false` para defeito), a peça nova sai por FIFO numa venda nova ("Troca da venda X", ligada em `sale_returns.exchange_sale_id`) e a DIFERENÇA é paga na hora (`settlement_method`: cash, pix, debit_card, credit_card) como Payment confirmado dessa venda. Loja sem reembolso: devolução sem peça nova e peça nova mais barata são recusadas. Receita fica líquida porque a venda nova soma e `SaleReturn.total_refund` subtrai (dashboard). Pontos de fidelidade: estorna proporcional na devolução e dá pontos sobre o valor da venda de troca. Devolução ao fornecedor: tabela `supplier_returns` (migração `20261027_supplier_returns`), `POST /supplier-returns/` (peça com defeito via `return_item_id` ou peça em estoque via `entry_item_id`, ex.: condicional), `POST /supplier-returns/{id}/resolve` (exchanged: entra peça nova pelo mesmo custo numa entrada tipo devolução; credited: vira desconto na entrada de origem; rejected: peça de estoque volta). Teste: `tests/test_troca.py`; migrações testadas em Postgres local (upgrade, downgrade, upgrade). Não testado: tela do app clicada no navegador; PIX da diferença é só registro manual.

## Marca Provador (2026-10-24)

- Logo: a letra P pendurada num gancho de cabide. Fontes em `mobile/assets/brand/*.svg`; componente `components/branding/ProvadorLogo.tsx` (`variant` icon|mark, `withName`; abaixo de 56 px o traço engrossa). `FitFlowLogo` virou apelido dele (imports antigos).
- Cores da marca em `mobile/constants/Brand.ts`: violeta `#7C3AED`, magenta `#DB2777`, tinta `#160F28`. Usadas antes do login (abertura, apresentação, login) e como padrão do app (`Colors.light.primary/secondary`) e do servidor (cor de loja nova em `signup_service.py`, `store.py`). Depois do login vale a cor de cada loja. Lojas já existentes mantêm a cor gravada.
- Ícones gerados do mesmo SVG: `assets/icon.png`, `adaptive-icon.png` + `adaptive-icon-background.png`, `favicon.png`, `notification-icon.png`, `public/icon-192|512.png`, `apple-touch-icon.png`. Nome visível do app: "Provador" (`app.config.js`). `slug`, `scheme` e o pacote `com.fitnessstore.mobile` NÃO foram trocados (quebra EAS/OTA; o pacote fica permanente ao publicar o APK): decidir antes do primeiro APK.
- Apresentação (`app/(auth)/onboarding.tsx`): abertura da marca, 3 passos e login. O passo é estado da tela (o `scrollToIndex` da lista antiga não fazia nada no navegador); deslizar usa `onTouchStart/onTouchEnd` e `touchAction: 'pan-y'` no web (sem isso, deslizar para a direita voltava a página). Teste ponta a ponta: 28 verificações em 390 e 1280 px.
- **Termos de Uso e Política de Privacidade** (2026-10-25): textos em `mobile/constants/legal.ts` (RASCUNHO para revisão jurídica; dados da empresa em branco em `LEGAL_COMPANY`: [RAZÃO SOCIAL], [CNPJ], [ENDEREÇO], foro, encarregado), páginas públicas `/termos` e `/privacidade` (abrem sem login). Versão em `backend/app/core/legal.py` e `mobile/constants/legal.ts` (`tests/test_legal.py` exige iguais); mudou o texto, troque a versão nos dois: todo usuário aceita de novo. Aceite gravado em `legal_acceptances` (usuário, versão, data, canal signup/login, IP do `X-Real-IP`, navegador; migração `20261030_legal_acceptances`). `POST /auth/signup` exige `accept_terms=true` e `terms_version` atual (sem isso 400, nada criado; aceite na mesma transação). `GET /legal/current` (pública), `GET /legal/status` e `POST /legal/accept` (qualquer papel; versão velha = 409). App: caixa no fim do cadastro da loja; `components/legal/LegalGate.tsx` leva quem não aceitou para `/aceite-termos` e não deixa sair dela; o modal de boas-vindas do tutorial não abre nessas telas. Teste no navegador: 21 verificações. Falta do item 2.1: exportar e anonimizar cliente, registro de acesso. **Natureza do produto (decisão do Victor, 26/10/2026):** o Provador é SaaS de gestão e CRM para a loja; os clientes da loja não usam o app, não têm conta e não recebem nada do Provador (o texto diz isso; versão 2026-10-26). A loja continua sendo controladora dos dados que cadastra no CRM e o Provador o operador.
- **Cadastro no navegador** (2026-10-25): o primeiro clique em "Continuar Cadastro" se perdia (o campo, ao perder o foco, mostrava "Senhas coincidem" e empurrava o botão no meio do clique); campos agora ficam "tocados" ao digitar. A tela de cadastro buscava as cores da loja padrão sem login (mostrava as cores da W.A a quem ia criar loja): removido.
- **Desconto por fornecedor na entrada** (2026-10-24): entrada com vários fornecedores (cada item tem o seu em `entry_items.supplier_id`; sem ele vale o da entrada). `stock_entries.discount_amount` continua sendo o desconto GERAL (todos os itens); `entry_supplier_discounts` (migração `20261028_entry_supplier_discounts`, única por entrada x fornecedor) guarda o desconto de UM fornecedor, rateado só nos itens dele proporcional ao custo (nunca passa da mercadoria dele). `PUT /stock-entries/{id}` aceita `supplier_discounts: [{supplier_id, amount}]` (0 remove; fornecedor sem item ou valor acima da mercadoria dá 400 `InvalidEntryData`). `/costs` devolve `discount_amount` (total), `general_discount` e `suppliers[{supplier_id,name,merchandise,discount}]`. Crédito do fornecedor em devolução vai para o desconto daquele fornecedor. Integridade do FIFO: recalcular desconto só mexe em `extra_unit_cost`; quantidades, fontes FIFO e `SaleItem.unit_cost` de peças já vendidas não mudam (testes em `tests/test_desconto_fornecedor.py`, que confere `restante = recebido - vendido pelas fontes`).
- **Logo da loja** (2026-10-24): `brandingStore.fetchFromServer` agora segue o servidor: loja sem logo mostra o logo do app (Provador) e não herda o logo da loja anterior guardado no aparelho.
- **Cache do app ao trocar de loja** (2026-10-24): o React Query (`staleTime` 5 min) não era limpo no login, cadastro e saída, então listas da loja anterior (fornecedores, produtos...) apareciam na loja nova no mesmo aparelho. `utils/queryCache.ts` registra o QueryClient e `authStore` chama `clearQueryCache()` em login, signup, logout e forceLogout. O servidor sempre filtrou por loja (teste de isolamento em `tests/test_isolamento_fornecedores.py`, que remove o override de tenant do conftest; sem isso o teste enxerga tudo como loja 1). Produção conferida em 24/10/2026: nenhum vínculo de fornecedor entre lojas diferentes.
- **Conta do lote fiel e fornecedor em entrada existente** (2026-10-24): `lot_cost_service.recompute_entries` agora separa por peça frete/viagem e desconto (`extra = frete - desconto`, exato) e aceita `dry_run=True` (só calcula; usado por `/analytics` e `/costs`, que mostram `freight_unit_cost`, `discount_unit_cost` e o desconto APLICADO, nunca só o pedido). O desconto geral e o de um fornecedor juntos nunca passam do custo das peças daquele fornecedor (o do fornecedor só vai até o que sobrou depois da parte do geral; `PUT` acima disso dá 400). Achado pelo teste de propriedade (`tests/test_conta_fiel.py`, 40 cenários aleatórios): antes os dois descontos somados podiam deixar custo negativo. Item avulso (`POST /{id}/items`, antes IGNORAVA o fornecedor e gravava NULL) e produto novo (`POST /{id}/with-new-product`) em entrada existente agora aceitam `supplier_id`/`supplier_name` (padrão: o da entrada), validam a loja e criam o vínculo fornecedor x produto. App: ao vincular produto a uma entrada existente (lista de Entradas) pergunta o fornecedor do produto antes de confirmar.
- Pendente conhecido: `GET /suppliers/cost-comparison` compara o preço de tabela (custo da mercadoria na compra), sem o desconto negociado; precisa de decisão para virar "preço pago".
- **Desconto por item, preço pago nos relatórios e "Adicionar produto" na entrada** (2026-10-24): `entry_items.list_unit_cost` (migração `20261029_item_list_price`, nulo, id de revisão com no máximo 32 caracteres: testar migração SEMPRE com o alembic de verdade, que grava em `alembic_version.version_num`, e não carregando o arquivo) guarda o preço de TABELA por peça (opcional); `unit_cost` continua sendo o PAGO, então o desconto do item (tabela - pago) só é mostrado e nunca abatido de novo (`/analytics` item: `list_unit_cost`, `item_discount_unit`; `/costs`: `item_discounts_total`). Tabela menor que o pago é recusada; igual ao pago vira "sem desconto". Relatórios de fornecedor usam o preço PAGO (tabela da compra menos o desconto geral e o do fornecedor, calculado por `lot_cost_service.recompute_entries(dry_run=True)` em `SupplierInsightsService._discount_units`): comparação de custo, reposição, card Fornecedores do produto e compras/estoque do ranking. Frete e viagem NÃO entram nesse preço (não são do fornecedor). App: campo "Preço de tabela" na Nova Entrada e no editar item; botões "Produto já cadastrado" (`AddProductToEntryModal`, com fornecedor) e "Produto novo" (guarda a entrada em `utils/presetEntry.ts`; a lista de Entradas, no modo vincular, escolhe essa entrada sozinha e pergunta o fornecedor).
- **Limpeza do DEBUG_LOG.txt** (2026-10-24): `backend/scripts/limpar_debug_log.py` agrupa os erros do trace do app (arquivo local, só em desenvolvimento) por assinatura e confere com `scripts/debug_log_resolvidos.json`. Um erro só é "sanado" se tiver `prova_teste` (pytest que reproduz o problema e PASSA agora; as provas ficam em `tests/test_rotas_do_debug_log.py`) ou `resolvido_manual` com a nota de como foi corrigido. `limpar` tira do arquivo o que está sanado, guarda cópia inteira em `backend/logs/debug_log_arquivado/` (fora do git) e mantém só os erros abertos ou novos; `--auto` (roda sozinho no start do backend em development) não executa testes e só confia em prova que passou nas últimas 24 h; `resolver "<trecho>" --nota "..." [--prova tests/x.py::test_y]` registra uma correção; `--tudo` esvazia à força. Erro que ninguém analisou nunca é apagado. Hoje abertos: PDV com Mercado Pago/Cielo (credenciais recusadas) e o erro de greenlet em `/pdv/terminal/start`. Testes: `tests/test_limpar_debug_log.py`. Ao corrigir um erro do trace, registre a prova e rode a limpeza.
- **Bug do "entrada undefined" ao vincular produto** (2026-10-24): o `SupplierPickerSheet` chama `onSelect` e DEPOIS `onClose`; o `onClose` da lista de Entradas apagava a entrada escolhida logo após a escolha do fornecedor, e o diálogo dizia "à entrada undefined" (e o vínculo não tinha entrada). Corrigido com `supplierPickedRef` (só cancela se fechou sem escolher). Caminho testado de ponta a ponta no navegador com backend local descartável: entrada > Produto novo > assistente > Entrada Existente > fornecedor B > Vincular; produto já cadastrado com preço de tabela e fornecedor; desconto por fornecedor e lixeira; fechar a escolha sem escolher não vincula nada. Padrão visual dos formulários novos: `BottomSheet` do app (não `Modal` simples).
- **Produto novo a partir da entrada** (2026-10-25): o botão "Produto novo" da entrada guarda a entrada em `utils/presetEntry.ts` (10 min, lida sem consumir por `peekPresetEntry`). O passo 3 do assistente (`WizardStep3`) então NÃO pergunta nova entrada x entrada existente: mostra "Lançar na entrada TESTE-001" (com o fornecedor da entrada) e um link "Usar outra entrada ou criar uma entrada nova" que limpa a pré-escolha. Depois da quantidade, a lista de Entradas (`takePresetEntry`) abre direto o seletor de fornecedor do produto e a confirmação. Testado de ponta a ponta no navegador (entrada > Produto novo > assistente > passo 3 > quantidade > fornecedor B > Vincular; item gravado com o fornecedor B).
- **Achado, não corrigido**: abrir direto `/login` no app web com a sessão já salva derruba a tela com "Attempted to navigate before mounting the Root Layout component" (o `(auth)/_layout` faz `router.replace` no primeiro render). Em produção afeta quem salvou `/login` nos favoritos e já está logado.

## Código curto e etiqueta do verso da tag (2026-10-26)

- **Código curto** (`product_variants.short_code`, migração `20261031_short_codes`): número por loja (`#0123`; o QR leva `PV#0123`), único por `(tenant_id, short_code)`, nunca reaproveitado. Contador em `catalog_counters` (uma linha por loja) reservado com `UPDATE ... RETURNING`: a trava da linha impede repetir e rollback devolve o número (sem buraco). Atribuído sozinho no `before_flush` (`app/services/short_code_service.py`) a toda variação COM SKU (peça de catálogo sem SKU fica sem número), na ordem da grade (cor, tamanho natural). Busca: `GET /product-variants/short-code/{code}` (aceita `PV#0123`, `#0123`, `123`; no app usar `encodeURIComponent` por causa do `#`). Variações antigas: `scripts/short_codes_backfill.py` (simula; `--apply` grava; `--loja N`), por ordem de criação. Testes: `tests/test_short_codes.py`, `tests/pg/test_short_codes_postgres.py`.
- **PDF do adesivo 50x60** (`app/services/label_pdf_service.py`, reportlab): 4 faixas (nome; COR + TAM no quadrado; preço; QR + CÓDIGO #0123). Só o que a cliente pode ver: nada de custo, SKU, fornecedor, entrada ou data. `POST /labels/pdf` (`items [{variant_id, quantity}]`, `layout` `a4` 12 por folha com marcas de corte e `start_position` 1 a 12 para folha já usada, ou `roll` uma por página para térmica) e `POST /labels/pdf/entry/{id}` (uma por peça recebida). Máximo 600 por vez; vendedor para cima. O número novo só é gravado depois do PDF pronto.
- App: cartão "Adesivo do verso da tag (50×60)" em Gerar Etiquetas (`app/products/label/[id].tsx`, usa as quantidades da lista), `services/labelService.ts` (web abre o PDF em outra aba; celular grava e abre o compartilhar, NÃO testado em aparelho), `utils/shortCode.ts`; o código aparece na lista de variações da etiqueta e no cartão de variação do produto. Teste no navegador com backend local: 21/21 (PDF A4 começando na posição 5, rolo 50x60, QR lido do PDF, erro do servidor legível).
- Pendente: numerar produção (backfill), botão na entrada (`entries/[id].tsx`, área do PC), ZPL, impressão em papel conferida com régua, furo do pino na tag (perguntado ao Victor).


## Conferência de estoque (2026-10-26)

- Relatório para conferir o estoque físico enquanto a etiqueta não está impressa: `GET /reports/stock-check` (`app/services/stock_check_service.py`; gerente/admin; sem custo nem preço; quantidade = soma de `quantity_remaining` das entradas ativas, por variação, com o código curto #0123). App: Mais > Relatórios > "Conferência de Estoque" (`app/reports/stock-check.tsx`). A contagem digitada fica só no aparelho (`@provador:conferencia:<loja>`) e a tela NÃO muda o estoque; mostra confere, falta e sobra na hora, filtros por categoria, só com estoque e só divergências, imprime a lista para contar e o resultado. Testes: `tests/test_stock_check.py`. Testado no navegador: digitar, confere, falta, persistir ao recarregar. NÃO testado: caso "sobra", filtros no navegador e HTML de impressão.

## Tamanhos compostos e edição de variação (2026-10-26)

- `normalize_size` aceita ÚNICO e tamanhos duplos (`P/M`, `M/G`, `G/GG`; "p / m", "m-g", "S/M" viram o padrão) e `size_sort_key` põe o duplo entre os dois tamanhos que junta (P < P/M < M). App: chips ÚNICO, P/M, M/G, G/GG no cadastro (`DEFAULT_SIZES`; "Selecionar todos" usa só a grade normal `GRID_SIZE_VALUES`) e SKU do app sem "/" nem acento (`P-M`, `UNICO`).
- Editar produto > cada variação tem campos Tamanho (com atalhos) e Cor; `PATCH /product-variants/{id}` já recusava duplicado (400). O id da variação não muda, então estoque, FIFO e código curto ficam. Limite: não dá para APAGAR o tamanho de uma variação (vazio é ignorado). Testes: `tests/test_editar_variacao.py`, `tests/variants/test_variant_grid.py`. NÃO testado no navegador.
- Scanner IA: `GEMINI_MODEL=gemini-3.5-flash`, lista `GEMINI_FALLBACK_MODELS` tentada em 429/503/404 (cota grátis é por modelo, 20/dia) e reserva GLM da Z.ai (`ZAI_API_KEY`, `glm-4.6v-flash`; fila no plano grátis, e errou a cor de uma imagem de teste: conferir cor sugerida). `docker-compose.prod.yml` do VPS é CÓPIA em `/opt/provador`: variável nova no compose do repo precisa ser aplicada lá à mão.

## Gênero em dois botões e resumo sem volta (2026-10-26)

- Gênero (cadastro e editar produto) agora é `components/ui/GenderToggle.tsx`: dois botões lado a lado, recolhem o teclado ao tocar, e produto novo já começa com Feminino (`INITIAL_STATE` e reset do `useProductWizard`). `SelectField` ficou sem uso.
- Resumo do assistente (`app/products/wizard.tsx`, passo `complete`): Voltar (botão do app, hardware, Voltar do navegador via `popstate`, gesto do iOS) NUNCA reabre o passo anterior; sai do assistente e vai para o início (`/(tabs)`). Os passos do indicador não são clicáveis no resumo. Os botões do resumo (Criar outro, Ver produto, Ver produtos, Estoque, Fotos) seguem como eram. Testado no navegador: gênero marcado por padrão, trocar para Masculino com o campo em foco recolhe o teclado, Voltar do navegador no resumo cai na início. NÃO testado: aparelho (hardware back Android, gesto iOS).
- **Tamanho em lista** (2026-10-26): `components/ui/SizePicker.tsx` (BottomSheet com ÚNICO, PP a XGG com P/M, M/G, G/GG, numeração 34 a 48, campo "Outro tamanho" e "Limpar"; recolhe o teclado). Usado no cadastro (`WizardStep2`, variante `paper`) e no editar produto (produto sem variações e cada variação, variante `plain`). Testado no navegador na edição (variação sem tamanho passou a P/M e gravou). NÃO clicado no navegador: o campo do assistente de cadastro (mesmo componente).

- **Variação zerada e lista da entrada** (2026-10-26): `create_entry_with_new_product_variants` e `add_new_product_to_entry` CRIAVAM a variação com quantidade 0 (sem item de entrada), que virava "ruptura" na grade sem nunca ter tido estoque (ex.: Lilás M da Regata Blusa Tule). Agora variação com quantidade 0 não é criada (e se todas forem 0, recusa). Teste: `tests/test_variacao_sem_quantidade.py` (falha sem a correção, passa com ela). Variações zeradas que JÁ existem em produção continuam lá: conferir com o Victor antes de desativar (consulta ao banco de produção foi bloqueada nesta sessão). Entrada (`entries/[id].tsx`): campo de pesquisa e modos Ordem de entrada, A a Z, Zerados e Agrupar por produto na lista de produtos. NÃO testado no navegador.
- **Excluir produto da entrada** (2026-10-26): `DELETE /stock-entries/entry-items/{id}` (gerente/admin), `StockEntryService.delete_entry_item`: só se `quantity_sold == 0` (nada vendido nem reservado); soft delete do item, refaz estoque pelo FIFO, total da entrada e rateio do lote; a variação que só existia por esse item é desativada (SKU `_del_<id>`) e o produto some se ficar sem variação e sem outra entrada; recusa o último produto da entrada (para isso existe excluir entrada). `StockEntryWithItems` agora só devolve itens ativos. App: botão Excluir no item da entrada (só sem venda e com mais de 1 produto). Testes: `tests/test_variacao_sem_quantidade.py`. Não aplicado em dados reais; NÃO testado no navegador.
- **Exportar relatório de vendas no app web** (2026-10-26): no iPhone (PWA) `expo-print`/`expo-sharing`/`FileSystem` não funcionam (erro "Não foi possível exportar"; só `printAsync` também não abria nada). PDF agora vem do servidor: `GET /reports/sales/pdf?period=` (`app/services/sales_report_pdf_service.py`, reportlab) e o app web usa `openSalesReportPdfWeb` (compartilhar do aparelho, senão abre/baixa); CSV na web baixa por Blob. Testes: `tests/test_relatorio_vendas_pdf.py`. NÃO testado no iPhone. Conferência de Estoque ainda usa `Print.printAsync` na web (mesmo risco no iPhone).
- **Relatório de vendas detalhado** (2026-10-26): `ReportService.get_sales_report` agora IGNORA venda cancelada, devolvida por inteiro e pendente (antes contava cancelada na receita) e devolve comparação com o período anterior (mesmo nº de dias), peças, descontos, clientes cadastrados, devoluções/trocas (informativo, não abatido da receita), canceladas, `daily`, `by_weekday`, `by_category`, `by_seller` e `variant_short_code` nos top produtos (15). Tela `reports/sales.tsx` e PDF do servidor (`sales_report_pdf_service.py`) mostram tudo. Lucro = receita das vendas válidas menos custo FIFO delas (devolução parcial NÃO abate o lucro). Dia usa `date(created_at)` do banco (fuso do servidor). Teste: `tests/test_relatorio_vendas_pdf.py`. Tela e PDF NÃO conferidos no navegador/iPhone. Código curto da loja real (loja 2) numerado em produção em 26/10/2026: 27 variações, #0165 a #0191 (loja de teste loja 1 ficou sem numerar). Ideia em aberto: número por PRODUTO além do da variação (o QR continua apontando a variação).
- **Código da etiqueta #produto-variação** (2026-10-26): `#101-1` = produto 101 da loja, variação 1 dele (`products.code_number`, `product_variants.product_code` + `variant_number`, `catalog_counters.next_product_code`; migração `20261101_product_codes`, testada no Postgres: upgrade, downgrade, upgrade). Produto numerado na 1ª variação com SKU; variações seguem 1, 2, 3 (grade) e nunca reaproveitam número. O `short_code` antigo (#0123) continua existindo e achando a peça (`PV#0123`); QR novo é `PV#101-1`; busca em `GET /product-variants/short-code/{code}` aceita os dois. `display_code` vem em todas as respostas de variação. `scripts/short_codes_backfill.py` numera as antigas (testado em Postgres: simula, grava, idempotente); impressão de etiqueta também numera sozinha o que faltar (`ensure_codes`). EM PRODUÇÃO ainda NÃO rodado o backfill do formato novo (loja real: #0165 a #0191 no formato antigo foram gravados). Tests: `tests/test_short_codes.py`.
- **Erros amigáveis** (2026-10-26): `app/core/friendly_errors.py` + handlers em `main.py`: erro técnico (SQL, driver) NUNCA vai na resposta (vira frase clara; original no error_logs); 422 devolve `message` com frase por campo. App: `utils/friendlyError.ts` aplicado em `services/api.ts` e `utils/apiError.ts`. Causa do print de 26/10: material gerado pela IA com mais de 100 letras (coluna `varchar(100)`): Scanner IA agora corta no limite (`_clip`) e as requisições de entrada validam `max_length`. Testes: `tests/test_erros_amigaveis.py` (atenção: `tests/test_troca.py` deixa vendas no banco de teste e pode quebrar `test_desconto_fornecedor` se rodar ANTES dele).
- **Desempenho do app web** (2026-10-26): servidor na Europa, ~300 ms de ida e volta e API em HTTP/1.1 sem compressão de JSON (nginx `provador-api`: falta `http2` no `listen` e `gzip_types application/json`; mudança no VPS NÃO aplicada, aguardando OK do Victor). App: `utils/queryPersist.ts` guarda consultas das telas principais no aparelho (24 h, por usuário, limpa ao trocar de conta), `utils/lastRoute.ts` volta à última tela depois de recarregar/reabrir, abertura não espera mais o servidor para as cores, atualização automática só com app parado (`canReloadNow`).
- **Guarda de publicação** (2026-10-26): `deploy/guarda_publicacao.py` (roda no VPS, lê o access.log do nginx) bloqueia o deploy do backend enquanto houver gravação (POST/PUT/PATCH/DELETE na API) nos últimos 120 s; ignora refresh de sessão, logs do app, curl e webhooks. Passo "Guarda de publicação" em `.github/workflows/deploy-vps.yml` espera até 25 min e, se não liberar, falha com a mensagem de adiado; `workflow_dispatch` com `forcar=sim` ignora. Antes de QUALQUER mudança em produção (VPS, banco, nginx, deploy), rodar o status: `cat deploy/guarda_publicacao.py | ssh -i ~/.ssh/provador_deploy root@204.168.144.151 'python3 - --status'` (0 livre, 10 ocupado). HTTP/2 e gzip de JSON ligados em `provador-api` e HTTP/2 em `provador-app` em 26/10/2026 (backup dos arquivos em /root/*.nginx.bak-20261026). Backfill #produto-variação aplicado na loja real: 209 variações de 65 produtos (todas as 215 com SKU numeradas, sem repetir).
- **Variação sem quantidade no cadastro** (2026-10-26): o servidor não cria variação com quantidade 0 (`create_entry_with_new_product_variants`, `add_new_product_to_entry`); o app (`WizardStep3`) agora pergunta antes (BottomSheet "Variações sem quantidade": "Voltar e preencher" ou "Não cadastrar essas") e o resumo (`entries/index.tsx`, `onlyLaunchedVariants`) lista só as que entraram. Caso real: Conjunto Alô Poliamida mostrava 5 variações para 3 unidades (a causa era o resumo, o banco tinha 3). NÃO testado no navegador.
- **Paleta de cores das variações** (2026-10-26): `COLOR_GROUPS` (`types/productVariant.ts`) foi de 52 para 101 cores (mesclas, grafite, rosados, neons, verdes, terrosos, uva/berinjela, rose gold e grupo Estampas: onça, zebra, floral, tie dye, listrado, xadrez, camuflado, preto e branco, colorido, degradê); cada bolinha ganhou o NOME embaixo; campo "Outra cor" no construtor de variações (`VariantBuilderInline`) aceita qualquer nome (o servidor padroniza maiúsculas); `utils/colorHex.ts` reconhece as palavras novas. NÃO testado no navegador.

- **Trilha de navegação** (2026-10-27): o trace de desenvolvimento (`services/debugLog.ts`) só roda em `__DEV__`; no app de produção nada era gravado sobre navegação. `mobile/utils/navTrail.ts` guarda as últimas 40 telas e gestos (rota, `popstate` do arrastar do iPhone, resumo exibido, cadastro concluído) e, quando uma trava de "cadastro concluído" age ou o voltar do resumo dispara, manda tudo para `POST /client-logs` (nível info, no máximo 1 por 10 s). Ler no VPS: `select created_at, path, message, detail from error_logs where error_type='client' and level='info' order by id desc limit 20` (a trilha vem em `detail.trilha`) ou `GET /api/v1/error-logs?source=app`. Teste: `tests/test_sku_e_registro_de_erros.py`.

## Aba Condicionais revisada (2026-10-27)

- Teste de ponta a ponta no navegador (backend local descartável, 40 verificações): criar pelo assistente, enviar, devolução parcial com peça danificada, devolver tudo, cancelar, atrasado, erro do servidor, loja sem cliente.
- Corrigido no servidor: envio atrasado sumia do filtro "Atrasados" e do contador (a listagem grava `OVERDUE` e `is_overdue`/filtros só reconheciam `SENT`); venda do condicional agora soma pontos, total gasto e nº de compras da cliente (igual ao PDV); "marcar como enviado" grava `carrier`/`tracking_code` nas colunas; `unit_cost` do item é o custo FIFO real (era o do cadastro, e o app caía no preço de venda); quantidade acima do enviado é recusada antes de mexer em qualquer coisa; `send-periodic` comparava papel com 'ADMIN' (o valor é 'admin'). Testes no fim de `tests/test_condicional.py`.
- Corrigido no app: `DateTimeInput` não abria nada no navegador (o seletor nativo não existe na web): agora um `<input type=datetime-local>` invisível cobre o campo (vale também para despesas). Datas do servidor lidas como UTC (`parseApiDate`) e prazo por dia de calendário ("Vence hoje às 18:30"; passou da hora = "Atrasado"). Passo 1 sem cliente: tela explicando + "Cadastrar cliente" (a cliente nova volta selecionada) e busca por nome/telefone. Máscaras: CEP, telefone, UF; valores em R$ 0,00; "cor · tamanho" igual ao resto do app; erro do servidor aparece com a mensagem dele (o interceptor entrega `error.message`, não `error.response`). Transportadora/rastreio/observação do "Marcar como enviado" se perdiam (estado lido antes de atualizar). Tela de prejuízo voltava para a Início (outra aba): agora volta ao envio; prevê despesa de danificada + perdida pelo custo real. Motivo do cancelamento (mín. 5 letras) validado dentro do formulário (o diálogo abria atrás dele). Depois de criar abre o detalhe do envio; ações invalidam todo o cache.
- Telas antigas sem uso `conditional/[id]_new.tsx` e `components/conditional/ItemStatusModal.tsx` apagadas em 27/10/2026 (ok do Victor). Não mexido: modo avulso da tela de prejuízo (data em AAAA-MM-DD e custo com ponto). Não testado em celular (só navegador).

## LGPD: direitos do titular e isolamento de clientes (2026-10-27)

- **Vazamento corrigido**: `GET /customers/{id}` e `DELETE /customers/{id}` buscavam o cliente SEM filtrar a loja; qualquer usuário logado lia nome, telefone, CPF e endereço de cliente de outra loja trocando o número (e podia desativá-lo). Teste: `tests/test_isolamento_clientes.py` (falha sem a correção). Achado na varredura e corrigido em 27/10/2026: `category_service.update_category/delete_category` e a categoria-mãe buscavam sem a loja (gerente de outra loja renomeava/apagava categoria); teste `tests/test_isolamento_categorias.py`. Rotas públicas `GET /categories/hierarchy` e `/{id}` seguem sem login (só nomes).
- `app/services/customer_privacy_service.py` + rotas em `endpoints/customers.py`: `GET /customers/{id}/export` (gerente/admin; JSON com cadastro, compras, devoluções, condicionais, lista de desejos, looks e conversas do WhatsApp oficial pelo telefone; SEM custo/FIFO), `POST /customers/{id}/anonymize` (só admin; corpo `{"confirmacao": "ANONIMIZAR"}`; recusa com envio condicional em aberto; apaga dados pessoais, endereço/notas dos condicionais, conversas e textos do WhatsApp daquele número, desativa lista de desejos, solta looks; vendas e estoque ficam), `GET /customers/{id}/access-log` (só admin). Coluna `customers.anonymized_at` (migração aditiva `20261102_customer_anonymized`, testada no Postgres: stamp, downgrade, upgrade). Registro de acesso em `audit_logs` (entity `customer`): CUSTOMER_VIEWED, UPDATED (só os NOMES dos campos), DELETED, EXPORTED, ANONYMIZED.
- App: cartão "Privacidade (LGPD)" na ficha do cliente (`components/customers/CustomerPrivacyCard.tsx`): exportar baixa o JSON (web) ou compartilha (celular, NÃO testado em aparelho); "Quem acessou" e "Anonimizar" (digitar ANONIMIZAR, erro dentro do formulário) só para admin. Teste no navegador: 15/15. Testes do servidor: `tests/test_lgpd_cliente.py`.
- Falta do item 2.1: revisão jurídica do texto e dados da empresa nos termos; contato do encarregado.

## Custo escondido para caixa e vendedor (item 2.2, 2026-10-27)

- `app/core/cost_mask.py` (`CostMaskMiddleware`, registrado em `main.py`): para papel caixa ou vendedor, toda chave de custo/lucro/margem (`cost`, `profit`, `margin`, `cmv`, `roi`, `markup`, `investment` como palavra inteira entre `_`, ex.: `cost_price`, `unit_cost`, `total_profit`, `margin_percent`, `average_unit_cost`) vira `null` em QUALQUER resposta JSON, em qualquer profundidade (inclui `sale_sources`/`fifo_sources`). Exceção: `installments_cost`. O papel vem de `request.state.user_role`, gravado pela matriz de permissões (`permissions.permission_matrix`). Campo novo com custo e outro nome precisa seguir o padrão do nome ou entrar na regex.
- App: o PDV só pede `/products/fifo-costs` (lucro do carrinho) para gerente/admin; detalhe da venda e produto já escondiam o bloco quando o valor vem nulo.
- Testes: `tests/test_custo_por_papel.py` (falha com o middleware desligado). Navegador: vendedora em produto, venda, condicional e PDV sem custo na tela nem na API; admin continua vendo (10/10).


## Desempenho e carga de teste (2026-10-27)
- **Medição de tempo**: `GET /api/v1/perf` (admin) mostra, por rota, chamadas, média, máximo, p95, tempo de banco e consultas por chamada, mais as 100 últimas lentas (>1 s). Só em memória (zera ao reiniciar), código em `backend/app/core/perf_trace.py`. Toda resposta traz `Server-Timing: app;dur=ms`. Slow request também vai para o log do servidor.
- **Causa do "tudo lento"**: o engine do Postgres local usava `NullPool` (conexão nova com autenticação a cada sessão, várias por pedido, ~250 ms fixos em TODA rota). Agora há pool 10+10 no ramo `DATABASE_SSL=disable` (`app/core/database.py`). Resultado em produção: categorias 229 para 26 ms, entradas 119 para 15 ms, dashboard 233 para 20 ms, reposição de 6 itens 2789 para 602 ms. O RLS usa `set_config` local da transação, por isso é seguro com conexão reaproveitada.
- **Busca de produtos** (`/products?search=` e `?category_id=`) devolvia tudo que combinava, sem respeitar limit/skip (19 s com 2.600 produtos). Agora corta a página.
- **Ainda lento com 2.600 produtos**: `GET /products` monta cada produto com ~3 consultas (N+1 em `build_product_response`): 50 itens = 250 ms, 1000 itens = 5,3 s. Próximo passo: carregar estoque/variações em lote.
- **Carga de teste** (`backend/scripts/estresse_loja_teste.py`): cria produtos de todos os tipos, entradas, fornecedores e reposições na LOJA 1 (conta teste, marca "Estresse Lab", entradas com nota "ESTRESSE"; a loja 2 é a real, nunca tocar). Rodar dentro do container: `docker exec -w /app -e PYTHONPATH=/app -e REUSE=1 -e BASE_URL=https://api.provadorfit.com.br/api/v1 provador-backend python -u /tmp/estresse_loja_teste.py N`. Usar a URL pública para a guarda de publicação enxergar as gravações; pelo localhost ela fica cega e outro deploy reinicia o backend no meio (aconteceu 3 vezes).
- **Bugs achados pela carga e corrigidos**: variação sem SKU deixava a lista de produtos da loja inteira em erro 500 (agora gera SKU e a lista pula produto defeituoso); entrada sem data/tipo dava 400 genérico (assume hoje/local); categoria repetida e valor grande demais davam 500 (agora 409 e 422).
- **Fallbacks**: IA com 14 s por modelo Gemini, Groq como reserva (`GROQ_API_KEY` só no `.env.prod` do VPS e no compose de lá), GET do app repete 1 vez em rede/502/503/504.

## Limite de tentativas (item 2.3, 2026-10-27)

- `app/core/rate_limit.py`: além do login (só falhas), `hit()`/`enforce()` contam TODA chamada numa janela, em memória do processo (um processo no VPS; se escalar, trocar por Redis). Estourou: 429, frase em português ("Muitas ... em pouco tempo. Tente de novo em X minutos.") e `Retry-After`.
- Limites: `POST /auth/signup` 5/h por IP; `POST /auth/forgot-password` 5 a cada 15 min por IP e 3/h por e-mail; `POST /auth/check-email` e `/check-slug` 30 a cada 10 min por IP (somados; o de e-mail revela se tem conta); `POST /ai/scan-product` 15 a cada 10 min por usuário e 60/dia por loja (cota da IA).
- `tests/conftest.py` zera os contadores a cada teste (`_zera_limites_de_tentativas`). Testes: `tests/test_limites_de_tentativas.py` (4 falham com o limite desligado). O app não repete 429 e mostra a frase do servidor.
- Verificado também (pedido do Victor): lucro do carrinho do PDV com itens aparece para gerente/admin ("Lucro estimado R$ 144,80 (69,0%)") e não aparece para vendedora, no navegador e em iPhone EMULADO (Playwright "iPhone 13"); aparelho físico NÃO testado.


## Proteção contra abuso e ataques (2026-10-27)
- **nginx** (arquivos em `deploy/protecao/`, aplicar com `aplicar.sh` no VPS; faz backup do original em `/root/nginx-backup-original`, testa com `nginx -t` e desfaz se falhar): limite por IP (API 25 req/s com rajada de 80; login/cadastro/esqueci a senha 6 por minuto; scanner de IA 12 por minuto; arquivos do app 40 req/s), máximo de conexões por IP, `429` ao estourar, timeouts contra conexão lenta, `server_tokens off`, caminhos de varredura (`.env`, `.git`, `.php`, `wp-*`, `phpmyadmin`...) fechados com `444`, `X-Forwarded-For` do cliente não é repassado (era forjável).
- **fail2ban**: jaulas `nginx-limit-req` (20 estouros em 60 s = 15 min de ban) e `provador-scan` (3 caminhos de varredura em 10 min = 1 h), além do `sshd`. `ignoreip` com os IPs do Victor (179.221.151.26 e .58); se o IP dele mudar e ele for bloqueado: `fail2ban-client unban <ip>`.
- **App**: login, cadastro, esqueci a senha, checagens de e-mail e scanner de IA já tinham limite em memória (`app/core/rate_limit.py`). É por processo: com 2 workers cada um conta separado (trocar por Redis ou tabela antes de subir o segundo worker).
- Testado em produção: 12 chamadas paralelas normais = 200; 12 logins seguidos = 5x401 e depois 429; 400 pedidos de uma vez = 46 a 62 passam e o resto leva 429, backend continua saudável.

## Imagens enviadas (item 2.4, 2026-10-28)

- `app/core/image_guard.py` (`sanitize_image`, `sanitize_or_400`, `base64_or_400`): toda foto enviada (produto, variação, galeria; arquivo e base64) é aberta pelo Pillow (HEIC via pillow-heif) e REGRAVADA: JPEG (PNG se tiver transparência), lado maior até 2560, sem EXIF (some o GPS), rotação da câmera aplicada. Tipo declarado, nome do arquivo e o `data:image/...` do base64 não decidem nada; a extensão vem daqui. Recusa (400, "O arquivo não é uma imagem válida...") o que não abre, formato fora da lista, mais de 15 MB e mais de 40 MP (bomba de pixels). GIF animado só continua animado na galeria (`keep_animation=True`, até 300 quadros); nos outros vira a primeira imagem. Logo da loja já era regravado (WebP).
- `/uploads` (`UploadsStaticFiles` em `main.py`): só entrega `.jpg .jpeg .png .webp .gif` (resto 404) com `nosniff` e CSP `sandbox`. A galeria gravava arquivo SEM extensão (`..._media`, o armazenamento local ignora `ext` quando recebe nome): os novos têm extensão e os antigos sem extensão só saem se os primeiros bytes forem de imagem (`sniff_image_type`), com o content-type certo.
- Testes: `tests/test_imagens_enviadas.py` (3 falham com o guarda desligado).

## Dependências e vulnerabilidades (item 2.5, 2026-10-28)

- `.github/workflows/security-audit.yml` (push que mexe em dependência, PR e toda segunda): backend com `pip-audit` (barra QUALQUER vulnerabilidade conhecida, o pip-audit não dá severidade), app e site com `npm audit --omit=dev` (barra alta e crítica). Regra em `.github/scripts/audit_gate.py`; exceção só em `.github/audit-allowlist.json` com motivo e data de revisão (hoje: pytest; postcss, image-size e ws do build do Expo 51; postcss do Next 15). Exceção que deixou de aparecer é avisada para sair da lista. Os `safety || true` e `npm audit || true` antigos saíram.
- `.github/dependabot.yml`: PRs semanais (pip `/backend`, npm `/mobile` e `/web`) e mensais (github-actions). Ignorados de propósito: FastAPI >= 0.137 (troca o `include_router` por `_IncludedRouter` e QUEBRA a matriz de permissões; testado), pytest/pytest-asyncio major, Expo/React Native minor e major (projeto à parte).
- Atualizado nesta data (antes: 40+ vulnerabilidades no backend, 22 altas/críticas no app): FastAPI 0.100.1 > 0.136.3, Starlette 0.27 > 1.10 (`starlette>=1.3.1` no requirements), python-multipart 0.0.6 > 0.0.32 (DoS no upload, que roda antes do login), uvicorn 0.38, python-dotenv 1.2.2, sqladmin 0.32, black 26. **python-jose trocado por PyJWT 2.15** (jose e o ecdsa dele têm falhas sem correção; tokens já emitidos continuam válidos, testado). App: `npm audit fix` (axios 1.21, zod 4.6, etc.; sem troca de versão maior). Site: Next 15.5.28.
- Verificado: mesmas falhas antigas da suíte do backend (nenhuma nova), `tests/pg` 21/21, servidor real (cadastro, login, foto, HTML recusado, token do jose aceito, admin), app web no navegador (produtos, clientes, condicionais, entradas, venda no PDV concluída, sem erro de JS nem 4xx/5xx), `tsc` 0, build do site.

## CSP do app web e cadastro contra robô (itens 2.6 e 2.7, 2026-10-28)

- **CSP** em `<meta>` no `dist/index.html`, gerada por `mobile/scripts/pwa-postbuild.js` (o deploy confere que está lá): script só do próprio site e o `jsQR` do leitor de QR do `expo-camera` (worker de `blob:` que importa `https://cdn.jsdelivr.net/npm/jsqr@1.2.0/dist/jsQR.min.js`); estilo inline liberado (react-native-web); imagem de qualquer https; conexão com a API (origem de `EXPO_PUBLIC_API_URL`, padrão `api.provadorfit.com.br`), ViaCEP, BrasilAPI, apicep e Sentry. Os `<script>` embutidos saíram para `/pwa-boot.<build>.js` (versão do build + service worker). Domínio externo novo no app (fetch, script, worker) precisa entrar na lista, senão o navegador bloqueia. `frame-ancestors` (anti-iframe) não funciona em meta: falta pôr no nginx do VPS.
- Testado no navegador com a CSP: cadastro completo pela tela, início, produtos, produto, clientes, cliente, condicionais, entradas, relatórios (vendas e conferência), notificações, PDV, PDF do servidor aberto em nova aba (`blob:`), service worker e fontes de ícone: 0 violações, 0 erro de JS.
- **Cadastro contra robô**: `POST /auth/signup` recusa (400, nada criado) quando o campo invisível `website` vem preenchido ou `form_ms` (tempo na tela da loja) < 1,5 s; app antigo sem os campos passa. Campo só no app web (`create-store.tsx`). Soma-se ao limite de 5 cadastros/h por IP e ao nginx. Robô que chama a API direto só é barrado pelo limite: Cloudflare Turnstile fica para perto do lançamento (conta Cloudflare do Victor; no app instalado precisa de WebView). Testes: `tests/test_cadastro_robo.py`.

## Estoque: trava contra corrida (2026-10-28)

- `app/services/stock_lock.py` (`lock_stock`): `pg_advisory_xact_lock` por venda, envio condicional e variação, SEMPRE nessa ordem (venda, envio, variações em id crescente), liberada no commit/rollback; no SQLite não faz nada.
  Chamar ANTES de ler saldo ou "quanto já voltou" em qualquer caminho novo que mexa em `entry_items.quantity_remaining` (venda, devolução, troca, cancelamento, condicional). Sem ela, dois pedidos simultâneos pela última peça passavam os dois.
- Testes: `tests/pg/test_concorrencia_vendas_postgres.py` (15, Postgres descartável, ver `docs/PLANO_TESTES_VENDAS_FIFO.md`) e `tests/test_estresse_condicional.py`. O condicional agora custeia a venda e as perdas pelas fontes FIFO das peças certas (não a média do envio).
- Também travados (28/10/2026, `lock_entry_items` em `stock_lock.py`: trava e RELÊ o saldo): editar, corrigir e excluir item da entrada, excluir entrada, ajuste manual de estoque (`adjust_product_quantity`), excluir produto e devolução ao fornecedor. Testes: `tests/pg/test_concorrencia_entradas_postgres.py` (`RODADAS=40`); sem a trava, excluir item/entrada vendia peça apagada e o ajuste para 2 terminava com 5.
## Preços e valores grandes (2026-10-28)

- `mobile/components/ui/PriceDisplay.tsx`: `Money` (R$ e centavos menores que os reais; encolhe só se não couber), `PriceRange` (faixa em duas linhas "de / até" com atalho "Ver N preços"; `inline` = menor preço grande e "até R$ X" pequeno embaixo, para listas) e `FitText` (texto de uma linha que encolhe). No web a medida é real (largura do conteúdo com fração via `Range`, contra a visível); no celular usa o `adjustsFontSizeToFit` nativo. **`adjustsFontSizeToFit` sozinho NÃO funciona no app web**: em código novo use `FitText`/`Money`.
- `components/products/VariantPricesSheet.tsx`: preços por variação agrupados (aberto pelo "Ver N preços" do detalhe do produto).
- Aplicado: detalhe do produto (cartão Preço; os dois cartões vão um embaixo do outro em tela estreita), lista de produtos (em < 360 px as etiquetas vão para baixo do nome), busca do PDV ("a partir de"), montador de looks, resumo e passo 3 do cadastro, 26 valores em fonte grande (checkout, venda, PIX, maquininha, início, vendas, relatórios, despesas, perdas, viagens, entradas, lote) e os 8 `adjustsFontSizeToFit` antigos. Rentabilidade da venda com título em linha própria.
- Conferido no navegador em 390 e 320 px com venda de R$ 112.499,10 e variação de R$ 12.499,90: nada cortado nem quebrado no meio do número, sem erro de JS. NÃO testado em aparelho.

## Etiqueta: tela única, 6x5 e gráfica (2026-10-28)

- Decisão do Victor: a tag vem pré-impressa com a logo WA e o sistema imprime só o **adesivo do verso**; por ora a impressão é **na gráfica** (ainda sem impressora). Ele tem a etiqueta **6x5**; medida CONFIRMADA pela foto da tag (28/10/2026): **65 mm de largura x 55 mm de altura** (6,5 x 5,5 cm), padrão deitada; também 55x65 em pé. A tag da foto não mostra furo.
- Servidor: `label_pdf_service.build_pdf(width_mm, height_mm)` (30 a 100), `a4_grid` (65x55 = 8 por folha, 55x65 = 12), `layout=roll` = uma etiqueta por página com o tamanho exato (arquivo para a gráfica), `GET /labels/sizes`.
- App: `components/labels/StickerStudio.tsx` + `StickerPreview.tsx` (prévia em escala com o mesmo desenho do PDF). `products/label/[id].tsx` e `products/label/index.tsx` (Estúdio) usam o componente; `products/qrcode/[id].tsx` redireciona; `ElginPrintSheet` foi removida. Impressoras e Fila (`app/labels`, `app/settings/printers`) continuam no código, sem uso até haver impressora.
- Leitor de QR da venda (`QRCodeScanner.tsx`) agora entende `PV#101-1` (antes tratava como SKU e dava "Produto não encontrado"): resolve em `GET /product-variants/short-code/{code}` e segue pelo SKU da variação. Câmera NÃO testada em aparelho.
- Testes: `tests/test_short_codes.py` (tamanho exato de cada página lido do PDF, grade, recusas). Ambiente de teste no navegador: backend com `DATABASE_URL=sqlite+aiosqlite:///./qa_etq.db` ligado ao IP da rede na porta 8000 (o app em dev chama `http://<ip-da-rede>:8000`) e Metro na 8081 (CORS só aceita essa porta); Metro em CI não relê arquivo alterado.
- Plano de leitura do QR (conferência, venda, consulta; câmera e leitor tipo teclado): `docs/PLANO_LEITOR_QR.md` (Q1 a Q11; Q1, o + e - no campo Contado, feita).
- Armadilha: `backend/test.db` sujo (execução interrompida por timeout) faz os testes falharem com `UNIQUE constraint failed: stores.slug`; apagar `test.db` e `test.db-journal`.


## Auditoria de seguranca (28/10/2026)
- Relatorio: docs/security-audit/REPORT.md (+ findings.json). Perfil quick, cobertura parcial; 19 confirmados (5 altos, 6 medios, 8 baixos), 1 needs_validation (backup plaintext em artifact do GitHub Actions).
- Onda 1 (commit 38619c0, NAO publicado): 5 altos corrigidos em codigo + testes (backend/tests/test_seguranca_achados_altos.py).
- **Onda 2 (pendente, nao dar push antes):** configuracao no servidor dos segredos novos (PDV_WEBHOOK_TOKEN, MP_WEBHOOK_SECRET, ADMIN_PANEL_EMAILS), cadastrar URLs de webhook Stone/Cielo com ?token=, refinar o codigo dessas partes; depois os 6 medios e 8 baixos e o item de backup. Sem esses segredos, push do 38619c0 recusa webhooks MP/Stone/Cielo e bloqueia o /admin.
- Suite: baseline tem 98 falhas pre-existentes (iguais com e sem as correcoes).
## Dinheiro: conta única de receita, custo e lucro (2026-10-28)

- `backend/app/services/money_ledger.py` (`period_totals(db, tenant_id, inicio, fim)`, dias do Brasil): usada pelo início (`/dashboard/stats`, `/sales/monthly`, `/sales/daily`, `/sales/yoy`), relatório de vendas e PDF (`ReportService.get_sales_report`) e Resultado do Mês (`ExpenseService._build_period_result`). Tela nova de dinheiro usa ela, nunca `sum(Sale.total_amount)` solto.
- Regras (Victor, 28/10): receita LÍQUIDA (vendas válidas do período - devoluções do período); venda válida = concluída, parcialmente devolvida ou devolvida (cancelada e pendente fora, e as devoluções dela também); devolução abate no DIA EM QUE ACONTECEU (dia pode ficar negativo); a venda da troca soma as peças novas e não conta como venda (quantidade/ticket); custo = FIFO vendido - custo das peças que VOLTARAM ao estoque (defeito fica como prejuízo); total gasto do cliente líquido.
- Venda com devolução/troca não pode ser cancelada (400, usar Devolução). Cancelar pela API recebe o motivo em `?reason=` (corpo é ignorado: 422). Troco: pagamento gravado é o que ficou na loja; cartão/PIX acima do total = 400.
- Testes: `tests/test_estresse_dinheiro.py` (todas as telas contra um livro independente; `ESTRESSE_OPS`, `ESTRESSE_DINHEIRO_SEEDS`). Ver itens 5 a 12 em `docs/PLANO_TESTES_VENDAS_FIFO.md`.
- Total gasto dos clientes antigos (devoluções antigas não descontaram, troca não somava): `backend/scripts/recalcular_total_gasto.py` recalcula `total_spent` e `total_purchases` pela regra acima (sem `--apply` só simula; `--loja N`; não mexe em pontos nem no tipo da cliente; idempotente). Teste: fim de `tests/test_estresse_dinheiro.py`; conferido no Postgres local. Simulado em produção na loja 2 em 28/10/2026 (guarda livre): 0 clientes com valor diferente, nada gravado (`--apply` desnecessário). Rodar de novo só se aparecer divergência: `docker exec -w /app provador-backend python scripts/recalcular_total_gasto.py --loja 2`.
