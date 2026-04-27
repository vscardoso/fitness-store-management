# Web Expert

Você está no modo **web expert** do projeto fitness-store-management.

## Contexto do projeto

Site público da loja: **wamodafitness.com.br**
Stack: Next.js 14 App Router + Tailwind CSS + TypeScript.
Deploy: Vercel (root dir = `web`, auto-deploy no push para main).

## Arquitetura

```
web/
├── app/                      # App Router (Next.js 14)
│   ├── layout.tsx            # Root: CartProvider + CartDrawer globais
│   ├── page.tsx              # Homepage (hero + categorias + produtos)
│   └── produtos/[id]/        # Detalhe do produto
├── components/
│   ├── Navbar.tsx            # Header com ícone carrinho + badge
│   ├── ProductCard.tsx       # Card portrait 3:4 ("use client")
│   ├── CartDrawer.tsx        # Drawer lateral do carrinho
│   ├── AddToCartButton.tsx   # Botão client para server components
│   └── WhatsAppButton.tsx    # Botão flutuante WhatsApp
├── contexts/
│   └── CartContext.tsx       # Estado global: useReducer + localStorage
└── services/
    └── api.ts                # Usa APENAS /public/* (sem auth)
```

## Regras críticas

- **Só endpoints `/public/*`** — nunca expor dados autenticados no web
- Dados seguros: `sale_price`, `in_stock` (bool), `sizes`, `colors`, `description`, `brand`
- **Nunca expor**: `cost_price`, `quantity_exact`, dados internos da loja
- `CartContext` usa `useReducer` + `localStorage` — sem lib externa (Redux/Recoil)

## Endpoints públicos disponíveis (backend)

```
GET /api/v1/public/products          # lista com sale_price, in_stock, sizes
GET /api/v1/public/products/{id}     # detalhe com cores, descrição, marca, galeria
GET /api/v1/public/categories        # categorias com produtos ativos
GET /api/v1/public/looks             # looks públicos
```

Resolução multi-tenant: `domain` → `?store=slug` → `is_default` → primeira loja ativa

## Design

- Cards portrait 3:4 (não quadrado)
- Grid com gap-2
- Parcelas visíveis no card ("3x de R$ X s/juros")
- Trust signals na página de produto (Frete Grátis / 1ª Troca / Pagamento Seguro)
- Sem redirects www/apex no `next.config.ts` (Vercel gerencia)

## Checkout WhatsApp

Mensagem formatada no WhatsApp com itens + total:
```
Olá! Gostaria de fazer um pedido em WA Moda Fitness:

• 2x Legging Power Fit — R$ 179,80
• 1x Top Fitness Pro — R$ 59,90

*Total: R$ 239,70*

Poderia me ajudar a finalizar?
```

## Variáveis de ambiente

```env
NEXT_PUBLIC_API_URL=https://fitness-backend-x1qn.onrender.com/api/v1
NEXT_PUBLIC_WHATSAPP_NUMBER=55XXXXXXXXXXX
NEXT_PUBLIC_STORE_NAME=WA Moda Fitness
NEXT_PUBLIC_SITE_URL=https://www.wamodafitness.com.br
```

## Iniciar web (dev)

```powershell
cd web && npm run dev   # porta 3000
npm run build           # build produção
```

## Próximos itens planejados

1. Galeria de fotos na página de produto (`GET /public/products/{id}` já retorna mídia)
2. WhatsApp flutuante animado após 3s (`WhatsAppButton.tsx` já existe)
3. Seção de categorias com imagens entre hero e produtos
4. "Você também vai amar" — produtos da mesma categoria
5. Badge "NOVO" — se `created_at` < 30 dias
6. Loading skeleton nos cards

---

Pronto para implementar. Descreva o que precisa fazer.
