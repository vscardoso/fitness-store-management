# Handoff — fitness-store-management

Resumo de tudo que foi feito e como configurar o projeto do zero em um novo PC.

---

## Setup do novo PC

### Pré-requisitos

```bash
# Python 3.11+
# Node.js 18+
# Git
# PostgreSQL (ou usar o banco remoto do Render)
```

### Clonar e configurar

```bash
git clone <repo-url>
cd fitness-store-management
```

### Backend

```bash
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1        # Windows PowerShell

pip install -r requirements.txt

# Criar arquivo .env (copiar de .env.example e preencher)
cp .env.example .env
```

**Variáveis críticas no `.env`:**
```env
DATABASE_URL=postgresql+asyncpg://user:pass@host/db
SECRET_KEY=sua-chave-secreta
CORS_ORIGINS=["http://localhost:3000","https://wamodafitness.com.br"]
```

> **IMPORTANTE:** `CORS_ORIGINS` deve ser uma string JSON válida (array entre aspas duplas).
> O backend usa pydantic-settings v2 — o campo é `str` e parseado via `@property`.

```bash
# Rodar migrations
python migrate.py "init"   # se banco novo
# ou apenas:
alembic upgrade head

# Iniciar servidor
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Web (Next.js)

```bash
cd web
npm install

# Criar .env.local
cp .env.example .env.local   # se existir, senão criar manualmente
```

**Variáveis do `.env.local`:**
```env
NEXT_PUBLIC_API_URL=https://fitness-backend-x1qn.onrender.com/api/v1
NEXT_PUBLIC_WHATSAPP_NUMBER=55XXXXXXXXXXX
NEXT_PUBLIC_STORE_NAME=WA Moda Fitness
NEXT_PUBLIC_SITE_URL=https://www.wamodafitness.com.br
```

```bash
npm run dev      # desenvolvimento (porta 3000)
npm run build    # build produção
```

### Mobile (Expo)

```bash
cd mobile
npm install
.\expo-dev.ps1             # emulador
.\expo-dev.ps1 -Tunnel     # dispositivo físico
```

---

## O que foi feito hoje

### 1. Fix CORS no backend (pydantic-settings v2)

**Problema:** uvicorn travava no Render com `SettingsError` ao tentar parsear `CORS_ORIGINS` como `List[str]`.

**Causa:** pydantic-settings v2 intercepta campos `List[str]` antes do `field_validator` rodar.

**Solução** (`backend/app/core/config.py`):
- `CORS_ORIGINS`, `CORS_ALLOW_METHODS`, `CORS_ALLOW_HEADERS` → tipo `str`
- `@property cors_origins` parseia JSON com fallback para CSV
- `app/main.py` usa `settings.cors_origins` (property, não campo direto)

---

### 2. Fix redirect loop www.wamodafitness.com.br

**Problema:** Loop infinito de redirect — Next.js redirecionava `www→apex` E Vercel redirecionava `apex→www`.

**Solução:** Remover o bloco de redirects do `web/next.config.ts`. Deixar o Vercel gerenciar.

---

### 3. Endpoints públicos `/public/*` (sem autenticação)

**Arquivo:** `backend/app/api/v1/endpoints/public_catalog.py`

Expõe apenas dados seguros para o site (nunca custo nem quantidade exata):
- `GET /api/v1/public/products` — lista com `sale_price`, `in_stock` (bool), `sizes`
- `GET /api/v1/public/products/{id}` — detalhe com cores, descrição, marca
- `GET /api/v1/public/categories` — categorias com produtos ativos
- `GET /api/v1/public/looks` — looks públicos

**Bugs corrigidos:**
- `sale_price` não existe na tabela `products` → usa `MIN(product_variants.price)` com fallback para `base_price`
- Estoque verificado via `JOIN product_variants ON pv.id = inv.variant_id` (não `inv.product_id` que é legado)

---

### 4. Resolução multi-tenant nos endpoints públicos

**Função `_resolve_tenant(db, request, store)`** com prioridade:

1. `Store.domain` = host header → ex: `wamodafitness.com.br` resolve direto
2. `?store=slug` query param → outra loja pode usar `?store=outra-loja`
3. `Store.is_default = true` → fallback padrão
4. Primeira loja ativa → último recurso

Todos os 4 endpoints públicos usam essa função. Nenhuma migration necessária — usa campos `domain` e `slug` já existentes no modelo `Store`.

**Para configurar no banco:**
```sql
UPDATE stores SET domain = 'wamodafitness.com.br' WHERE id = 1;
-- ou via admin do app
```

---

### 5. Redesign visual do site (inspirado em Vista Euforia)

- Cards portrait 3:4 (era quadrado)
- Grid com gap menor (gap-2)
- Parcelas visíveis no card ("3x de R$ X s/juros")
- Hero split desktop: texto + produto em destaque
- Trust signals na página de produto (Frete Grátis / 1ª Troca / Pagamento Seguro)
- Imagem portrait 3:4 na página de produto
- `web/services/api.ts` → todos os endpoints agora usam `/public/*`

---

### 6. Carrinho + Checkout WhatsApp

**Novos arquivos:**
- `web/contexts/CartContext.tsx` — estado global, `useReducer` + `localStorage`, sem lib externa
- `web/components/CartDrawer.tsx` — drawer lateral com lista de itens e botão checkout
- `web/components/AddToCartButton.tsx` — botão client para Server Components

**Arquivos atualizados:**
- `web/components/ProductCard.tsx` — `"use client"`, botão "Adicionar ao carrinho" no hover
- `web/components/Navbar.tsx` — ícone de carrinho com badge de contagem
- `web/app/layout.tsx` — `CartProvider` + `CartDrawer` globais
- `web/app/produtos/[id]/page.tsx` — `AddToCartButton` como CTA primário

**Fluxo:**
1. Cliente adiciona produtos ao carrinho
2. Abre o drawer (ícone na Navbar)
3. Ajusta quantidades, remove itens
4. Clica "Enviar pedido no WhatsApp"
5. WhatsApp abre com mensagem formatada:

```
Olá! Gostaria de fazer um pedido em WA Moda Fitness:

• 2x Legging Power Fit — R$ 179,80
• 1x Top Fitness Pro — R$ 59,90

*Total: R$ 239,70*

Poderia me ajudar a finalizar?
```

---

### 7. Mensagens WhatsApp mais informativas

**Página de produto — "Pedir direto no WhatsApp":**
```
Olá! Tenho interesse no produto *Tênis Esportivo* (R$ 89,90).

Tamanhos: P, M, G, GG
Cores: Preto, Rosa

Qual tamanho e cor você deseja? Tem disponível?
```

**Condicional:**
```
Olá! Quero fazer um condicional do produto *Tênis Esportivo* (R$ 89,90).
Tamanhos: P, M, G, GG

Posso receber em casa para experimentar antes de decidir?
```

---

## Deploy atual

| Serviço | URL | Status |
|---------|-----|--------|
| Backend | https://fitness-backend-x1qn.onrender.com | Render (auto-deploy no push) |
| Web | https://www.wamodafitness.com.br | Vercel (auto-deploy no push) |
| Mobile | Expo EAS | Build manual |

**Vercel — configuração obrigatória:**
- Root Directory: `web`
- Env vars: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WHATSAPP_NUMBER`, `NEXT_PUBLIC_STORE_NAME`, `NEXT_PUBLIC_SITE_URL`

---

## Arquitetura resumida

```
fitness-store-management/
├── backend/          FastAPI + PostgreSQL (Python 3.11)
│   ├── app/
│   │   ├── api/v1/endpoints/public_catalog.py  ← endpoints sem auth para o web
│   │   ├── core/config.py                       ← CORS_ORIGINS como str + @property
│   │   └── models/store.py                      ← campos domain + slug para multi-tenant
│   └── alembic/      migrations
├── mobile/           Expo Router + React Native
│   └── ...
└── web/              Next.js 14 App Router
    ├── app/
    │   ├── layout.tsx          ← CartProvider + CartDrawer aqui
    │   ├── page.tsx            ← homepage
    │   └── produtos/[id]/      ← detalhe do produto
    ├── components/
    │   ├── CartDrawer.tsx      ← drawer do carrinho
    │   ├── AddToCartButton.tsx ← botão client
    │   ├── ProductCard.tsx     ← card com "Adicionar ao carrinho"
    │   └── Navbar.tsx          ← ícone carrinho com badge
    ├── contexts/
    │   └── CartContext.tsx     ← estado global do carrinho
    └── services/api.ts         ← usa /public/* (sem auth)
```

---

## Próximos itens (frontend.md)

### Prioridade ALTA
1. **WhatsApp flutuante global** — já existe `WhatsAppButton.tsx`, ativar animação após 3s
2. **Galeria de fotos na página de produto** — backend tem `GET /products/{id}/media`

### Prioridade MÉDIA
3. **Seção de categorias com imagens** — grid de categorias entre hero e produtos
4. **"Você também vai amar"** — produtos da mesma categoria no final da página
5. **Badge "NOVO"** — se `created_at` nos últimos 30 dias

### Prioridade BAIXA
6. **Loading skeleton nos cards**
7. **Hover para segunda foto** — depende da galeria implementada
