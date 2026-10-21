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
- `LoadingOverlay` (carregamento global via `loadingManager`) agora é um cartão claro com a lupa, sem escurecer a tela, com camada transparente que bloqueia toques durante o carregamento. Spinners internos de `Button loading` do react-native-paper e `ProgressBar` não foram trocados.
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
