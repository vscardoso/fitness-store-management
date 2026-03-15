# 💎 ESTRATÉGIA: LOOKBOOK PERSONALIZADO + WISHLIST INTELIGENTE

**Criado em:** 24/01/2026
**Última revisão:** 11/03/2026
**Versão:** 4.0
**Status:** Fases 1, 2 e 3 concluídas — iniciando Fase 4

---

## 📊 AUDITORIA: O QUE JÁ EXISTE (11/03/2026)

### ✅ Backend — Já implementado
| Feature | Arquivo | Status |
|---|---|---|
| Products com variantes (size/color) | `models/product_variant.py` | ✅ FEITO |
| Categorias | `models/category.py` | ✅ FEITO |
| Clientes com loyalty points | `models/customer.py` | ✅ FEITO |
| Estoque FIFO | `models/entry_item.py`, `models/stock_entry.py` | ✅ FEITO |
| Viagens/Trips | `models/trip.py` | ✅ FEITO |
| **Condicional (try before you buy)** | `models/conditional_shipment.py` | ✅ FEITO |
| Notificações | `models/notification.py` | ✅ FEITO |
| Descontos de pagamento | `models/payment_discount.py` | ✅ FEITO |
| Look / LookItem | ❌ não existe | ❌ PENDENTE |
| Wishlist | ❌ não existe | ❌ PENDENTE |
| ProductTag | ❌ não existe | ❌ PENDENTE |
| WhatsApp webhook | ❌ não existe | ❌ PENDENTE |

### ✅ Mobile — Já implementado
| Feature | Arquivo |
|---|---|
| PDV / Checkout | `app/(tabs)/sale.tsx`, `app/checkout.tsx` |
| Produtos (lista, detalhe, criar, editar) | `app/(tabs)/products.tsx`, `app/products/` |
| Clientes (lista, detalhe, criar, editar) | `app/(tabs)/customers.tsx`, `app/customers/` |
| Condicional (lista, criar, detalhe) | `app/(tabs)/conditional/` |
| Entradas de estoque | `app/(tabs)/entries/` |
| Viagens | `app/(tabs)/trips.tsx`, `app/trips/` |
| Relatórios | `app/(tabs)/reports.tsx`, `app/reports/` |
| Categorias | `app/categories/` |
| Catálogo | `app/catalog.tsx` |
| Tela de Looks/Wishlist | ❌ não existe | ❌ PENDENTE |
| Dashboard de demanda | ❌ não existe | ❌ PENDENTE |

### ❌ Web / WhatsApp — Nada implementado
- `web/` — pasta não existe
- `backend/app/webhooks/` — pasta não existe
- `backend/whatsapp_bot/` — pasta não existe

---

## 🎯 VISÃO GERAL DO SISTEMA

### Conceito Central
Sistema que permite **montar looks** com peças da loja, **salvar** o que quer, e recebe **alerta automático** quando a peça chegar em estoque.

**Think:** Pinterest + Zara App + Personal Stylist em um só.

### Problema que Resolve
- ❌ Cliente vê peça no Instagram → "Quero em P rosa!" → "Não tenho P" → Vendedora **esquece** → Cliente compra em outro lugar
- ❌ Cliente não sabe o que combina → Compra 1 peça só → Ticket baixo
- ❌ Loja não sabe o que repor → Compra no achismo → Encalha estoque errado

### Solução
- ✅ Sistema sugere combinações automaticamente
- ✅ Alerta automático quando peça da wishlist chegar
- ✅ Vendedora vê demanda real ANTES de comprar
- ✅ Ticket médio aumenta (de 1 peça → look completo)

---

## 📊 ROI ESTIMADO

| Métrica | Sem sistema | Com sistema |
|---|---|---|
| Clientes/mês | 100 | 100 |
| Ticket médio | R$ 120 (1 peça) | R$ 280 (2,3 peças) |
| Conversão wishlist | 20% (vendedora esquece) | 65% (alerta automático) |
| **Receita mensal** | **R$ 12.000** | **R$ 28.000** |

**Ganho: +R$ 16.000/mês = +R$ 192.000/ano 🚀**

---

## 🏗️ ARQUITETURA COMPLETA (ESTADO ALVO)

```
                    ┌─────────────────────┐
                    │   BACKEND FastAPI   │
                    │   (API REST única)  │
                    └──────────┬──────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
        ▼                      ▼                      ▼
┌───────────────┐     ┌───────────────┐     ┌───────────────┐
│  WhatsApp     │     │ Landing Page  │     │  App Mobile   │
│  Business API │     │  (Next.js)    │     │ (React Native)│
├───────────────┤     ├───────────────┤     ├───────────────┤
│ • Chatbot     │     │ • Catálogo    │     │ • PDV ✅      │
│ • Catálogo    │     │ • Looks       │     │ • Estoque ✅  │
│ • Pedidos     │     │ • Wishlist    │     │ • Condic. ✅  │
│ • Alertas     │     │ • SEO         │     │ • Looks ⏳    │
└───────┬───────┘     └───────┬───────┘     └───────┬───────┘
        │                     │                     │
        ▼                     ▼                     ▼
  CLIENTE FINAL         CLIENTE FINAL          VENDEDORA
  (WhatsApp)            (Browser)              (Celular)
```

---

## 📅 NOVO ROADMAP EXECUTÁVEL (A PARTIR DE 11/03/2026)

### FASE 1: Backend Lookbook — **PRIORIDADE AGORA** (1 semana)

Implementar os modelos e endpoints que suportam Lookbook + Wishlist.
Nada de frontend ainda — apenas a fundação de dados.

#### 1.1 Novos Models

**Look** — conjunto de produtos montado por cliente ou pela loja
```python
class Look(BaseModel):
    name: str                    # "Meu Look Treino Perfeito"
    customer_id: int | None      # NULL = look da loja; INT = look do cliente
    is_public: bool              # Outros podem ver?
    discount_percentage: float   # 10% em looks 3+ peças
    # Relationships: items → LookItem
```

**LookItem** — cada produto dentro de um look
```python
class LookItem(BaseModel):
    look_id: int
    product_id: int
    variant_id: int | None       # Usa ProductVariant já existente
    position: int                # Ordem no look
    # Relationships: product, variant
```

**Wishlist** — produto desejado por um cliente
```python
class Wishlist(BaseModel):
    customer_id: int
    product_id: int
    variant_id: int | None       # Tamanho/cor específico desejado
    look_id: int | None          # Se é parte de um look
    notified: bool               # Se já enviou alerta
    notified_at: datetime | None
    # Relationships: product, customer, variant, look
```

**ProductTag** — tags para sugestões de combinação
```python
class ProductTag(BaseModel):
    product_id: int
    tag_type: str   # 'color', 'style', 'occasion', 'season'
    tag_value: str  # 'preto', 'athleisure', 'treino', 'verao'
```

#### 1.2 Novos Services

**LookService** (`backend/app/services/look_service.py`)
```python
async def create_look(db, tenant_id, customer_id, look_data) → Look
async def add_item_to_look(db, look_id, product_id, variant_id) → LookItem
async def get_customer_looks(db, customer_id) → List[Look]
async def get_public_looks(db, tenant_id) → List[Look]
async def apply_look_discount(db, look_id) → float
```

**WishlistService** (`backend/app/services/wishlist_service.py`)
```python
async def add_to_wishlist(db, customer_id, product_id, variant_id) → Wishlist
async def get_customer_wishlist(db, customer_id) → List[Wishlist]
async def check_and_notify_availability(db, product_id, variant_id) → List[Wishlist]
async def get_demand_report(db, tenant_id) → List[DemandItem]
```

**SuggestionService** (`backend/app/services/suggestion_service.py`)
```python
async def suggest_by_tags(db, product_id) → List[Product]
async def suggest_by_customer_history(db, customer_id) → List[Product]
```

#### 1.3 Novos Endpoints

```
GET  /api/v1/looks              Looks públicos da loja
GET  /api/v1/looks/my           Looks do cliente autenticado
POST /api/v1/looks              Criar look
PUT  /api/v1/looks/{id}         Editar look
DEL  /api/v1/looks/{id}         Soft delete look
POST /api/v1/looks/{id}/items   Adicionar item ao look
DEL  /api/v1/looks/{id}/items/{item_id}

GET  /api/v1/wishlist           Wishlist do cliente
POST /api/v1/wishlist           Adicionar à wishlist
DEL  /api/v1/wishlist/{id}      Remover da wishlist
GET  /api/v1/wishlist/demand    Demanda agregada (vendedora/admin)

GET  /api/v1/suggestions/{product_id}   Produtos que combinam
```

#### 1.4 Background Job — Wishlist Notifier

```python
# backend/app/tasks/wishlist_notifier.py
# Cron job a cada 1h:
# 1. Busca wishlists não notificadas
# 2. Para cada uma, verifica se o produto/variante tem estoque
# 3. Se sim: cria Notification, marca wishlist.notified=True
# 4. Notificação aparece no app mobile da vendedora (já existe NotificationModel)
```

#### 1.5 Migração

```bash
python migrate.py "add lookbook wishlist product_tags"
```

**Checklist FASE 1:**
- [ ] `backend/app/models/look.py`
- [ ] `backend/app/models/look_item.py`
- [ ] `backend/app/models/wishlist.py`
- [ ] `backend/app/models/product_tag.py`
- [ ] `backend/app/models/__init__.py` atualizado
- [ ] `backend/app/schemas/look.py`
- [ ] `backend/app/schemas/wishlist.py`
- [ ] `backend/app/repositories/look_repository.py`
- [ ] `backend/app/repositories/wishlist_repository.py`
- [ ] `backend/app/services/look_service.py`
- [ ] `backend/app/services/wishlist_service.py`
- [ ] `backend/app/services/suggestion_service.py`
- [ ] `backend/app/api/v1/endpoints/looks.py`
- [ ] `backend/app/api/v1/endpoints/wishlist.py`
- [ ] `backend/app/api/v1/router.py` atualizado
- [ ] `backend/app/tasks/wishlist_notifier.py`
- [ ] Migration criada e aplicada
- [ ] Swagger: `/docs` mostrando novos endpoints

---

### FASE 2: Mobile — Telas Lookbook (1 semana)

Com o backend pronto, implementar as telas no app da vendedora.

#### 2.1 Tipos TypeScript
```typescript
// mobile/types/look.ts
interface Look {
  id: number;
  name: string;
  customer_id: number | null;
  is_public: boolean;
  discount_percentage: number;
  items: LookItem[];
  total: number;
}

interface LookItem {
  id: number;
  look_id: number;
  product_id: number;
  variant_id: number | null;
  position: number;
  product: Product;
  variant?: ProductVariant;
}

// mobile/types/wishlist.ts
interface WishlistItem {
  id: number;
  customer_id: number;
  product_id: number;
  variant_id: number | null;
  look_id: number | null;
  notified: boolean;
  product: Product;
  variant?: ProductVariant;
}

interface DemandItem {
  product_id: number;
  product_name: string;
  variant_description: string;
  waiting_count: number;
  potential_revenue: number;
}
```

#### 2.2 Novas Telas Mobile

**`mobile/app/looks/index.tsx`** — Galeria de looks públicos
**`mobile/app/looks/[id].tsx`** — Detalhe do look
**`mobile/app/looks/builder.tsx`** — Montar look (selecionar produtos/variantes)
**`mobile/app/wishlist/index.tsx`** — Wishlist do cliente
**`mobile/app/(tabs)/demand.tsx`** — Dashboard de demanda (vendedora)

#### 2.3 Integração Look → Condicional

Aproveitar o sistema de **Condicional já implementado**:
- Look builder → botão "Pedir Condicional do Look"
- Cria um `ConditionalShipment` com todos os items do look
- Fluxo de devolução já funciona

```typescript
// Integração com conditional existente
const requestLookConditional = async (lookId: number, customerId: number) => {
  const look = await getLook(lookId);
  const items = look.items.map(item => ({
    product_id: item.product_id,
    variant_id: item.variant_id,
    quantity: 1,
  }));
  await createConditional({ customer_id: customerId, items });
};
```

**Checklist FASE 2:**
- [x] `mobile/types/look.ts`
- [x] `mobile/types/wishlist.ts` (em look.ts)
- [x] `mobile/services/lookService.ts`
- [x] `mobile/services/wishlistService.ts`
- [x] `mobile/app/looks/index.tsx`
- [x] `mobile/app/looks/[id].tsx`
- [x] `mobile/app/looks/builder.tsx`
- [x] `mobile/app/wishlist/index.tsx`
- [x] `mobile/app/(tabs)/demand.tsx`
- [x] Integração: Look → Condicional (botão "Pedir Condicional do Look" + customer picker)
- [x] Botão "Looks" visível no app (seção "Looks & Wishlist" no Menu)

---

### FASE 3: Web Landing Page — Next.js (1 semana)

Landing page pública para clientes navegarem sem instalar app.

#### 3.1 Setup
```powershell
cd C:\Users\Victor\Desktop\fitness-store-management
npx create-next-app@latest web --typescript --tailwind --app
```

#### 3.2 Estrutura
```
web/
├── app/
│   ├── page.tsx              # Home: grid de produtos + looks em alta
│   ├── produtos/[id]/page.tsx # Produto com variantes e botão WhatsApp
│   ├── looks/page.tsx         # Galeria de looks
│   └── wishlist/page.tsx      # Wishlist (localStorage anônima ou por tel)
├── components/
│   ├── ProductCard.tsx
│   ├── LookCard.tsx
│   ├── WhatsAppButton.tsx    # Botão flutuante
│   └── WishlistButton.tsx
└── services/
    └── api.ts                # Mesmo backend FastAPI
```

#### 3.3 Fluxo Principal
```
Instagram/Google → Site → Produto → "Pedir via WhatsApp"
    → WhatsApp abre com mensagem pré-preenchida
    → Vendedora atende no app mobile
```

#### 3.4 Deploy
- Vercel (plano free)
- Conectar ao backend via `NEXT_PUBLIC_API_URL`

**Checklist FASE 3:**
- [x] Projeto Next.js criado em `web/`
- [x] `web/services/api.ts` conectado ao backend
- [x] Home page com produtos
- [x] Página de produto com variantes
- [x] Botão WhatsApp flutuante em todas as páginas
- [x] Galeria de looks (usando API `/looks`)
- [x] Deploy Vercel — https://fitness-store-management.vercel.app

---

### FASE 4: WhatsApp Integration (1 semana)

Bot básico para atendimento e alertas de wishlist.

#### 4.1 Backend Webhook
```
backend/app/webhooks/
├── __init__.py
└── whatsapp.py       # POST /webhooks/whatsapp
```

Funcionalidades mínimas:
- Menu (1-5)
- Busca de produto por nome
- Link para catálogo no site
- Escalonar para vendedora

#### 4.2 WhatsApp Bot (Baileys)
```
backend/whatsapp_bot/
├── index.js          # Baileys listener → chama webhook
├── package.json
└── .env
```

#### 4.3 Alertas de Wishlist via WhatsApp
Integrar `WishlistNotifier` (Fase 1) para enviar:
```
"Oi Maria! 🎉 A Legging P Rosa chegou!
Seu look completo: R$ 239,80
[COMPRAR AGORA VIA WHATSAPP]"
```

**Checklist FASE 4:**
- [ ] `backend/app/webhooks/whatsapp.py`
- [ ] `backend/app/main.py` — router do webhook registrado
- [ ] `backend/whatsapp_bot/index.js`
- [ ] Menu básico (5 opções)
- [ ] Busca de produto por palavra-chave
- [ ] Alerta de wishlist enviado via WhatsApp quando produto chega

---

## 🎯 IMPLEMENTAÇÃO IMEDIATA — FASE 1 AGORA

**Comando para iniciar:**
```
🔄 FULL-STACK NEW-FEATURE: Backend Lookbook — models Look, LookItem, Wishlist, ProductTag + services LookService/WishlistService/SuggestionService + endpoints /looks e /wishlist
```

**Por que começar pelo backend:**
- ✅ Sem risco: não mexe em nada existente
- ✅ Unlocks Fase 2, 3 e 4 (todos dependem da API)
- ✅ Pode ser testado pelo Swagger antes do frontend
- ✅ Aproveita ProductVariant já existente

---

## 🔗 INTEGRAÇÕES JÁ PRONTAS PARA APROVEITAR

| Feature existente | Como integrar com Lookbook |
|---|---|
| `ProductVariant` | `LookItem.variant_id` → tamanho/cor específico |
| `ConditionalShipment` | Look builder → "Pedir condicional do look" |
| `Notification` | WishlistNotifier cria notificação no app |
| `Customer.loyalty_points` | Desconto em looks 3+ peças = pontos extras |
| `Inventory` | Wishlist verifica `entry_item.quantity_remaining > 0` |

---

## 🎁 FASE 5 (FUTURO — após validação)

### Coleções Temáticas
```
🌸 COLEÇÃO PRIMAVERA 2026
• Look Pastel (3 peças) - R$ 349
• Look Neon (2 peças) - R$ 229
[MONTE O SEU]
```

### Gamificação
- VIP por looks montados
- Closet virtual ("12 combinações possíveis!")

### WhatsApp Business Oficial
- Migrar Baileys → Meta Business API
- Catálogo nativo
- Analytics oficial

### Sugestões com IA
- Embeddings de produtos por tags
- Recomendação colaborativa (outros clientes montaram esse look)

---

## 📊 MÉTRICAS DE SUCESSO

### KPIs Lookbook
| KPI | Meta | Como medir |
|---|---|---|
| Ticket médio | R$ 120 → R$ 280 | `AVG(sale.total_amount)` |
| Conversão wishlist | 20% → 65% | `wishlists_converted / total_wishlists` |
| Looks criados/cliente | 2+/mês | `COUNT(looks) / COUNT(DISTINCT customer_id)` |
| Vendas multi-peça | 60% com 2+ | `sales_with_2plus_items / total_sales` |

### Checkpoint de Go/No-Go
- **Após Fase 1+2:** Vendedora usa tela de looks no app? → GO para Fase 3
- **Após Fase 3:** Site converte 30%+ (visita → WhatsApp) → GO para Fase 4
- **Após Fase 4:** WhatsApp converte 60%+ (conversa → venda) → Escalar

---

## 🚨 RISCOS E MITIGAÇÕES

| Risco | Mitigação |
|---|---|
| Complexidade de implementação | MVP por fases — backend antes de qualquer frontend |
| Cliente não usar o site | WhatsApp é canal principal; site é complementar |
| Sugestões de combinação ruins | Tags manuais primeiro; IA depois |
| Notificações spam | Cliente escolhe canal (push OU WhatsApp OU nenhum) |
| Performance queries wishlist | Cache de demanda, background job async |
| Baileys ban por Meta | Aceitar risco no MVP; migrar para API oficial em produção |

---

## 💰 CUSTO TOTAL

| Item | Custo |
|---|---|
| Landing Page (Vercel free) | R$ 0 |
| Backend (já rodando) | R$ 0 |
| WhatsApp Bot (Baileys) | R$ 0 |
| Domínio .com.br (opcional) | R$ 40/ano |
| WhatsApp Business API (produção) | ~R$ 100/mês |
| **Total MVP** | **R$ 0–40** |

**ROI estimado: 14.000% ao ano** 🚀

---

**Documento criado em:** 24/01/2026
**Revisado em:** 11/03/2026 — auditoria completa do estado atual + novo plano por fases
**Versão:** 4.0

**Próximo passo:** Executar `🔄 FULL-STACK NEW-FEATURE` para Fase 1 (Backend Lookbook)
