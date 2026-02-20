# 📖 DOCUMENTAÇÃO TÉCNICA — Fitness Store Management

**Última atualização:** 18/02/2026 | **Versão:** 1.0

---

## 🏗️ O QUE É ESTE SISTEMA

Sistema SaaS multi-tenant de gestão para lojas de artigos esportivos/fitness.

- **Backend:** Python 3.11 + FastAPI (async) + SQLAlchemy 2.0
- **Mobile:** React Native + Expo SDK 54 + TypeScript
- **Banco:** SQLite (dev) / PostgreSQL (prod)
- **Arquitetura:** Multi-tenant, multi-member, FIFO de estoque

---

## 🏢 MULTI-TENANT (Uma instância, várias lojas)

### Como funciona

Cada **loja** é um `Store` (tenant) isolado. Todos os dados têm `tenant_id` — produtos, vendas, clientes, estoque, usuários.

```
Store (tenant)
 ├── id, name, slug, subdomain, plan, trial_ends_at
 ├── Subscription (plano e limites)
 └── Users (membros da equipe)
```

### Resolução de Tenant (por prioridade)

1. `user.tenant_id` do JWT (principal — usuário já pertence a uma loja)
2. `request.state.tenant_id` (definido pelo `TenantMiddleware`)
3. Header `X-Tenant-Id` (numérico)
4. Header `X-Store-Slug` (slug da loja)
5. Host header mapeado em `Store.domain`
6. `Store.is_default = True` (fallback)

### Fluxo de Cadastro (SignupService)

Quando uma nova loja se cadastra, em uma única transação atômica:

```
POST /api/v1/auth/signup
    │
    ├── 1. Valida email único
    ├── 2. Gera slug único (ex: "minha-loja")
    ├── 3. Gera subdomain único (ex: "minha-loja-a1b2c3d4")
    ├── 4. Cria Store (tenant)
    ├── 5. Cria Subscription (trial 30 dias)
    ├── 6. Cria User (ADMIN — dono da loja)
    ├── 7. Seed automático: 115 produtos fitness no catálogo global
    └── 8. Retorna JWT tokens (access + refresh)
```

### Planos e Limites

| Plano | Produtos | Usuários | Relatórios | Preço |
|-------|----------|----------|------------|-------|
| **trial** | 100 | 1 | Básico | 30 dias grátis |
| **free** | 50 | 1 | Básico | Grátis |
| **pro** | Ilimitado | 5 | Completo | R$ 49/mês |
| **enterprise** | Ilimitado | Ilimitado | Completo | Sob consulta |

---

## 👥 MULTI-MEMBERS (Equipe da loja)

### Roles disponíveis

| Role | Permissões |
|------|-----------|
| **ADMIN** | Tudo (`*`) — dono da loja |
| **MANAGER** | read, write, manage_inventory, manage_sales |
| **SELLER** | read, create_sale, manage_customers |
| **CASHIER** | read, create_sale |

### Como adicionar membros

```
POST /api/v1/team/          → criar membro
GET  /api/v1/team/          → listar equipe
PUT  /api/v1/team/{id}/role → mudar role
POST /api/v1/team/{id}/reset-password → resetar senha
DELETE /api/v1/team/{id}    → desativar membro
```

Cada membro tem `tenant_id` apontando para a loja. O JWT carrega `tenant_id` e `role`.

---

## 📦 CATÁLOGO GLOBAL DE PRODUTOS

### O que é

O catálogo é um conjunto de **115 produtos fitness pré-cadastrados** (`is_catalog=True`) que ficam disponíveis para **todas as lojas** como templates. São criados automaticamente no signup via `ProductSeedService`.

### Categorias do catálogo

| Categoria | Qtd | Exemplos |
|-----------|-----|---------|
| Camisetas | 25 | Dry Fit, Regata, Oversized, Compressão |
| Shorts e Bermudas | 20 | Treino, Moletom, Corrida 2em1, Ciclista |
| Leggings e Calças | 20 | Cintura Alta, Corsário, Jogger, Seamless |
| Tops e Sutiãs | 15 | Esportivo, Alto Impacto, Cropped, Nadador |
| Jaquetas e Moletons | 15 | Corta-Vento, Moletom, Bomber, Colete |
| Tênis e Calçados | 10 | Corrida, Musculação, Ultraboost, Slide |
| Acessórios | 10 | Boné, Meia, Luva, Mochila, Munhequeira |

### Diferença: Catálogo vs Produto Ativo

```
is_catalog = True  → Template global (sem estoque, sem tenant_id)
                     Visível para todas as lojas
                     Não aparece nas vendas

is_catalog = False → Produto ativo da loja (com estoque, com tenant_id)
                     Aparece nas vendas, relatórios, dashboard
```

### Como um produto do catálogo vira ativo

**Opção 1 — Via Wizard (mobile):**
```
Wizard Step 1 → Seleciona produto do catálogo
Wizard Step 3 → Vincula a uma entrada de estoque
              → is_catalog = False (produto ativo)
              → EntryItem criado (rastreabilidade FIFO)
```

**Opção 2 — Via API:**
```
POST /api/v1/products/{catalog_id}/activate
    → Cria CÓPIA do produto com is_catalog=False
    → Gera novo SKU único para a loja
    → Opcionalmente vincula a entry_id + quantity
```

**Opção 3 — Ao criar entrada de estoque:**
```
POST /api/v1/stock-entries/
    → Se product.is_catalog == True
    → Automaticamente: product.is_catalog = False
```

### Se a entrada for excluída

Se um produto ativo não tem outras entradas → volta para catálogo (`is_catalog = True`).

---

## 🔄 SISTEMA FIFO — Cadeia Completa

### As 4 tabelas e seus papéis

```
products      → O QUE é (nome, SKU, preço, categoria)
stock_entries → DE ONDE veio (viagem, online, local, ajuste...)
entry_items   → QUANTO veio e QUANTO RESTA ← FONTE DA VERDADE
inventory     → RESUMO derivado (soma dos entry_items — NÃO editar diretamente)
```

### Modelo EntryItem (coração do FIFO)

```python
entry_id            → qual entrada
product_id          → qual produto
quantity_received   → quanto chegou (IMUTÁVEL após vendas)
quantity_remaining  → quanto ainda tem (decrementado a cada venda)
unit_cost           → custo unitário REAL pago nessa compra

# Calculados:
quantity_sold       = quantity_received - quantity_remaining
total_cost          = quantity_received × unit_cost
is_depleted         = quantity_remaining == 0
```

### Tipos de Entrada (EntryType)

| Tipo | Quando usar |
|------|------------|
| `TRIP` | Compra em viagem (vinculada a um Trip) |
| `ONLINE` | Compra online |
| `LOCAL` | Compra local/física |
| `INITIAL` | Estoque inicial (criado automaticamente no cadastro do produto) |
| `ADJUSTMENT` | Ajuste manual de inventário |
| `RETURN` | Devolução de cliente |
| `DONATION` | Doação/brinde recebido |

### Fluxo: Criar Produto com Estoque

```
ProductService.create_product(initial_stock=10)
    ├── Cria Product (is_catalog=False)
    ├── Cria StockEntry (type=INITIAL_INVENTORY)
    ├── Cria EntryItem (qty_received=10, qty_remaining=10, unit_cost=cost_price)
    └── rebuild_product_from_fifo() → cria Inventory.quantity=10
```

### Fluxo: Criar Entrada de Estoque

```
StockEntryService.create_entry(items=[...])
    ├── Valida produtos e trip (se houver)
    ├── Se produto é catálogo → is_catalog = False
    ├── Para cada item:
    │   ├── Cria EntryItem (qty_remaining = qty_received)
    │   └── Atualiza cost_price e price do produto
    ├── Calcula total_cost da entrada
    └── rebuild_product_from_fifo() → sincroniza Inventory
```

### Fluxo: Venda (FIFO em ação)

```
SaleService.create_sale()
    │
    ├── 1. Valida estoque via FIFOService.check_availability()
    │       └── Soma quantity_remaining dos EntryItems disponíveis
    │
    ├── 2. Para cada item da venda:
    │   └── FIFOService.process_sale()
    │       ├── Busca EntryItems ORDENADOS POR DATA (mais antigos primeiro)
    │       ├── Decrementa quantity_remaining (do mais antigo ao mais novo)
    │       └── Retorna fontes: [{entry_item_id, quantity_taken, unit_cost}]
    │
    ├── 3. Cria SaleItem com:
    │   ├── unit_cost = custo médio ponderado das fontes FIFO
    │   └── sale_sources = {"sources": [...]} ← rastreabilidade completa
    │
    └── 4. rebuild_product_from_fifo() → sincroniza Inventory
```

### Fluxo: Cancelamento de Venda

```
SaleService.cancel_sale()
    ├── Para cada SaleItem:
    │   └── FIFOService.reverse_sale(item.sale_sources['sources'])
    │       └── Restaura quantity_remaining nos EntryItems originais
    └── Reverte pontos de fidelidade do cliente
```

### Invariantes FIFO (nunca violar)

| # | Regra |
|---|-------|
| 1 | `inventory.quantity = Σ(entry_items.quantity_remaining)` sempre |
| 2 | `quantity_remaining` nunca negativo, nunca > `quantity_received` |
| 3 | Consumo sempre do item mais antigo primeiro |
| 4 | Cada unidade vendida rastreada em `sale_sources` |
| 5 | Entradas com vendas (`quantity_sold > 0`) **não podem ser excluídas** |
| 6 | `inventory` é derivado — corrigir via `rebuild_product_from_fifo()`, nunca manualmente |
| 7 | `cost_price` do produto NÃO retroage em EntryItems existentes (preserva CMV histórico) |

---

## 🏗️ ARQUITETURA BACKEND

### 3 Camadas

```
API Layer      (app/api/v1/endpoints/)  → HTTP, validação Pydantic, sem DB direto
Service Layer  (app/services/)          → Lógica de negócio, transações
Repository     (app/repositories/)      → Acesso ao banco, sem lógica de negócio
```

### Endpoints disponíveis (17 routers)

| Router | Prefixo | Descrição |
|--------|---------|-----------|
| auth | `/auth` | Login, signup, refresh, me |
| products | `/products` | CRUD + catálogo + scanner IA |
| categories | `/categories` | CRUD de categorias |
| inventory | `/inventory` | Estoque, movimentos, rebuild FIFO |
| sales | `/sales` | PDV, relatórios, top produtos |
| customers | `/customers` | CRUD + histórico de compras |
| stock_entries | `/stock-entries` | Entradas de estoque + analytics |
| trips | `/trips` | Viagens de compra + analytics |
| dashboard | `/dashboard` | Métricas, saúde do estoque |
| reports | `/reports` | Vendas, fluxo de caixa, clientes |
| team | `/team` | Gestão de membros da equipe |
| notifications | `/notifications` | Push tokens, envio |
| conditional_shipments | `/conditional-shipments` | Consignação |
| payment_discounts | `/payment-discounts` | Descontos por forma de pagamento |
| batches | `/batches` | Lotes com validade |
| ai | `/ai` | Scanner IA (OpenAI GPT-4o Vision) |
| debug | `/debug` | Logs de debug (dev only) |

### Modelos principais

```
Store           → Tenant (loja)
Subscription    → Plano e limites da loja
User            → Membro da equipe (ADMIN/MANAGER/SELLER/CASHIER)
Product         → Produto (is_catalog distingue template de ativo)
Category        → Categoria de produto
StockEntry      → Entrada de estoque (de onde veio)
EntryItem       → Item da entrada (FIFO — fonte da verdade)
Inventory       → Estoque atual (derivado do FIFO)
InventoryMovement → Histórico de movimentos
Sale            → Venda
SaleItem        → Item da venda (com sale_sources FIFO)
Payment         → Pagamento da venda
Customer        → Cliente (com fidelidade e histórico)
Trip            → Viagem de compra
ConditionalShipment → Envio condicional (consignação)
PaymentDiscount → Desconto por forma de pagamento
Batch           → Lote com validade
Notification    → Push notification log
```

---

## 📱 ARQUITETURA MOBILE

### Stack

| Tecnologia | Uso |
|-----------|-----|
| Expo Router | Navegação file-based |
| React Query | Estado do servidor (cache, invalidação) |
| Zustand | Estado local (auth, cart, UI, notifications) |
| React Native Paper | UI Material Design 3 |
| Axios | HTTP com interceptor JWT + loading global |

### Telas implementadas

```
(auth)/
  login.tsx          → Login
  signup.tsx         → Cadastro de nova loja
  onboarding.tsx     → Onboarding inicial
  create-store.tsx   → Criar loja
  forgot-password.tsx

(tabs)/
  index.tsx          → Dashboard (métricas em tempo real)
  products.tsx       → Lista de produtos
  sale.tsx           → PDV (ponto de venda)
  customers.tsx      → Clientes
  inventory.tsx      → Estoque
  trips.tsx          → Viagens de compra
  reports.tsx        → Relatórios
  management.tsx     → Gestão
  more.tsx           → Configurações
  payment-discounts.tsx → Descontos por pagamento
  entries/           → Entradas de estoque
  sales/             → Histórico de vendas
  team/              → Equipe
  conditional/       → Envios condicionais

products/
  wizard.tsx         → Wizard de criação (3 etapas)
  scan.tsx           → Scanner IA standalone
  [id].tsx           → Detalhe do produto
  add.tsx            → Adicionar produto
  edit/[id].tsx      → Editar produto
  label/[id].tsx     → Etiqueta do produto

customers/
  [id].tsx, add.tsx, edit/[id].tsx

entries/
  index.tsx, [id].tsx, add.tsx

trips/
  [id].tsx, add.tsx

sales/
  [id].tsx

reports/
  sales.tsx, history.tsx, top-products.tsx, sales-period.tsx

checkout/
  success.tsx
```

### Stores Zustand

| Store | O que guarda |
|-------|-------------|
| `authStore` | user, token, tenant_id (persistido no AsyncStorage) |
| `cartStore` | itens do carrinho de compras |
| `uiStore` | estado de UI (modais, loading) |
| `notificationStore` | push tokens, notificações |

### Loading Global

Todas as requisições mostram overlay de loading automaticamente.

```typescript
await api.post('/products', data);                          // loading automático
await api.post('/products', data, withLoadingMessage('Criando produto...'));  // mensagem custom
await api.get('/products', skipLoading());                  // sem loading (background)
```

---

## 🤖 WIZARD DE CRIAÇÃO DE PRODUTOS (WIP)

### Fluxo em 3 etapas

```
Step 1: IDENTIFICAR
  ├── Scanner IA → foto → GPT-4o Vision analisa → preenche dados
  └── Manual → nome + categoria básicos

Step 2: CONFIRMAR
  ├── Edição inline (nome, SKU, preços, categoria, marca, cor, tamanho)
  ├── SKU auto-regenerado ao editar campos (desativa se editado manualmente)
  └── Painel de duplicados (produtos similares detectados)

Step 3: ENTRADA DE ESTOQUE
  ├── "Nova Entrada" → /entries/add (produto pré-selecionado)
  ├── "Entrada Existente" → /entries (modo seleção)
  └── "Manter no Catálogo" → is_catalog=True (aguarda reposição)
```

### Scanner IA (OpenAI GPT-4o Vision)

```
POST /api/v1/ai/scan-product
    → Recebe imagem (base64 ou upload)
    → GPT-4o analisa: nome, marca, categoria, cor, tamanho, preço sugerido
    → Detecta duplicados por similaridade
    → Gera SKU automático
    → Retorna dados estruturados para o wizard
```

**Configuração:** Adicionar `OPENAI_API_KEY` no `backend/.env`
**Créditos:** $5 USD grátis (~250-500 scans) | Validade: 3 meses

---

## 🚀 COMO INICIAR O PROJETO

### Backend

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt

# Configurar .env
cp .env.example .env
# Editar: DATABASE_URL, SECRET_KEY, OPENAI_API_KEY (opcional)

# Criar banco e usuário admin
python recreate_db.py
python create_user.py        # admin@fitness.com / admin123
python create_categories.py  # categorias iniciais

# Iniciar servidor
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
# Ou usar: start_server.bat
```

**API Docs:** http://localhost:8000/docs

### Mobile

```powershell
cd mobile
npm install

# Configurar .env
cp .env.example .env
# EXPO_PUBLIC_API_URL=http://SEU_IP:8000/api/v1

# Iniciar (recomendado — evita travamentos)
.\expo-dev.ps1

# Se travar:
.\kill-all.ps1
.\expo-dev.ps1

# Para device físico:
.\expo-dev.ps1 -Tunnel
```

### Variáveis de ambiente importantes

**Backend (`backend/.env`):**
```env
DATABASE_URL=sqlite+aiosqlite:///./fitness_store.db
SECRET_KEY=sua-chave-secreta-aqui
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
CORS_ORIGINS=http://localhost:8081,http://localhost:19006
OPENAI_API_KEY=sk-...  # opcional, para scanner IA
AI_SCAN_ENABLED=true
UPLOAD_DIR=./uploads
STORAGE_TYPE=local  # ou cloudinary
```

**Mobile (`mobile/.env`):**
```env
EXPO_PUBLIC_API_URL=http://192.168.x.x:8000/api/v1
```

---

## 🗄️ BANCO DE DADOS

### Migrations

```powershell
cd backend

# SEMPRE usar migrate.py (automatizado):
python migrate.py "descrição da mudança"

# NUNCA editar banco manualmente ou usar alembic diretamente
```

### Reset completo (APAGA TUDO)

```powershell
python recreate_db.py
python create_user.py
python create_categories.py
```

### Rebuild FIFO (corrigir inconsistências de estoque)

```powershell
# Via API (recomendado):
POST /api/v1/inventory/rebuild-fifo

# Via script:
python rebuild_inventory.py
```

---

## 🧪 TESTES

```powershell
cd backend

pytest                    # todos os testes
pytest -v                 # verbose
pytest --cov=app          # com cobertura
pytest tests/test_products.py  # arquivo específico
```

---

## 📊 ESTADO ATUAL DO PROJETO

### ✅ Implementado e funcionando

- Multi-tenant completo (Store + Subscription + TenantMiddleware)
- Multi-members (4 roles com permissões)
- Catálogo global (115 produtos fitness)
- FIFO de estoque (rastreabilidade completa)
- Wizard de criação de produtos (3 etapas)
- Scanner IA com OpenAI GPT-4o Vision
- Upload de imagens de produtos
- PDV (ponto de venda) com múltiplas formas de pagamento
- Descontos por forma de pagamento
- Clientes com fidelidade (pontos, upgrade automático VIP/PREMIUM)
- Viagens de compra com analytics
- Envios condicionais (consignação)
- Relatórios (vendas, fluxo de caixa, clientes, top produtos)
- Dashboard com métricas em tempo real
- Notificações push
- Gestão de equipe
- Etiquetas de produtos

### 🚧 Erros TypeScript conhecidos (pré-existentes, não críticos)

- `conditional/[id].tsx` — tipos de ShipmentStatus desatualizados
- `more.tsx` — comparação de roles com strings
- `usePushNotifications.ts` — API do Expo Notifications mudou
- `BarcodeScanner.tsx` — props do Modal

### 🔮 Melhorias futuras planejadas

- Cache de resultados de scan IA
- Histórico de scans
- Modo batch (múltiplas fotos)
- Sincronização offline
- Dashboard web administrativo
- Integração com pagamentos (Stripe/PagSeguro)
- App Stores (iOS + Android via EAS Build)
- IA para previsão de demanda

---

## 📁 ESTRUTURA DE ARQUIVOS CHAVE

```
fitness-store-management/
├── backend/
│   ├── app/
│   │   ├── api/v1/endpoints/   → 17 routers de endpoints
│   │   ├── core/               → config, database, security, timezone
│   │   ├── middleware/         → TenantMiddleware
│   │   ├── models/             → 15+ modelos SQLAlchemy
│   │   ├── repositories/       → 14 repositórios (BaseRepository)
│   │   ├── schemas/            → Pydantic schemas
│   │   ├── services/           → 18 serviços de negócio
│   │   └── main.py             → Entry point FastAPI
│   ├── alembic/                → Migrations
│   ├── tests/                  → Testes unitários e integração
│   └── requirements.txt
│
├── mobile/
│   ├── app/                    → Telas (Expo Router file-based)
│   │   ├── (auth)/             → Login, signup, onboarding
│   │   ├── (tabs)/             → Tabs principais
│   │   ├── products/           → Wizard, scanner, detalhe
│   │   ├── customers/          → CRUD clientes
│   │   ├── entries/            → Entradas de estoque
│   │   └── trips/              → Viagens
│   ├── components/             → Componentes reutilizáveis
│   ├── services/               → Clientes de API (23 serviços)
│   ├── store/                  → Zustand stores
│   ├── hooks/                  → Custom hooks
│   ├── types/                  → TypeScript types
│   ├── constants/              → Config.ts (URL da API), Colors.ts
│   └── utils/                  → Helpers, formatação, validação
│
├── docs/                       → Documentação adicional
├── CLAUDE.md                   → Guia para IA (padrões do projeto)
├── AGENT_ORCHESTRATION.md      → Processo full-stack
├── WIP.md                      → Work in progress atual
├── SESSION_2026-02-17.md       → Log da última sessão
└── start_server.bat            → Iniciar backend (Windows)
```

---

## 🔑 PADRÕES OBRIGATÓRIOS

### Backend

```python
# ✅ CORRETO: Service chama Repository
class ProductService:
    async def delete_product(self, product_id: int, *, tenant_id: int):
        # Lógica de negócio no service
        inventory = await self.inventory_repo.get_by_product(product_id, tenant_id=tenant_id)
        if inventory and inventory.quantity > 0:
            raise ValueError("Não pode deletar produto com estoque")
        # Soft delete (NUNCA hard delete)
        await self.product_repo.update(self.db, id=product_id, obj_in={'is_active': False}, tenant_id=tenant_id)

# ❌ ERRADO: Lógica de negócio no Repository
# ❌ ERRADO: Hard delete (sempre usar is_active=False)
# ❌ ERRADO: Esquecer await em operações async
# ❌ ERRADO: Editar inventory.quantity diretamente (usar rebuild_product_from_fifo)
```

### Mobile

```typescript
// ✅ CORRETO: React Query com invalidação
const createMutation = useMutation({
  mutationFn: createProduct,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['products'] });
  },
});

// ❌ ERRADO: Mutação direta do estado
setProducts([...products, newProduct]);
```

### Commits

```
feat(products): adiciona wizard de criação
fix(fifo): corrige cálculo de custo médio
docs(readme): atualiza documentação
refactor(sale): extrai lógica de desconto
```

---

*Documentação gerada em 18/02/2026 com base na análise completa do código-fonte.*
