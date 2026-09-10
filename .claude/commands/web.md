---
description: Modo web expert — Next.js 14, Tailwind, endpoints públicos, carrinho WhatsApp
---

# Modo Web Expert

Landing page + catálogo público em `web/`. Next.js 14+ (App Router), Tailwind + shadcn/ui,
Framer Motion, Lucide React. Deploy Vercel.

**Público-alvo:** lojistas de fitness/suplementos. Objetivo: conversão para download do app.

## Estrutura

```
web/
  app/            # App Router: page.tsx, produtos/, looks/, layout.tsx, sitemap.ts, not-found.tsx
  components/     # Navbar, ProductCard, ProductGallery, LookCard, CartDrawer,
                  # AddToCartButton, CategoryFilter, WhatsAppButton, sections/
  contexts/       # CartContext (carrinho persistido em localStorage)
  services/api.ts # fetch tipado para os endpoints públicos
  types/          # Product, ProductListItem, Look, LookListItem, Category
  design-system/  # fitnessstore/MASTER.md + pages/
```

## API — só endpoints públicos

`web/services/api.ts` consome **apenas** `/public/*` (sem autenticação), que expõe só campos
seguros — **sem custo e sem quantidade em estoque**:

- `GET /public/products` (`search`, `category_id`, `skip`, `limit`)
- `GET /public/products/{id}`
- `GET /public/categories`
- `GET /public/looks`

```ts
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
// fetchApi usa next: { revalidate: 60 } → ISR
```

Nunca chamar endpoint autenticado a partir do site. Se faltar dado, criar um endpoint em
`backend/app/api/v1/endpoints/public_catalog.py` — e revisar quais campos vazam.

## Carrinho → WhatsApp

Não há checkout no site. `CartContext` guarda os itens em `localStorage` e o pedido é fechado
pelo WhatsApp: `https://wa.me/${NEXT_PUBLIC_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`
(ver `components/WhatsAppButton.tsx`).

## Padrões de UI

- Mobile-first (baseline 375px).
- **Sem emojis como ícones** — usar Lucide React.
- Contraste mínimo 4.5:1.
- Animações 150–300ms.
- **Tokens semânticos, nunca hex hardcoded nos componentes.** Paleta em `tailwind.config.ts`:
  `pink.50–900` (primária, `pink.500 = #ff1a6c`), `surface.50–950` (base escura,
  `surface.DEFAULT = #0d0d18`), fonte `Inter`.
  Gradientes prontos: `bg-pink-glow`, `bg-pink-glow-sm`, `bg-hero-gradient`, `bg-card-gradient`.
  Animações prontas: `animate-fade-up`, `animate-pulse-slow`, `animate-float`.

## Seções da landing

Hero → Problema/Solução → Funcionalidades → Screenshots → Depoimentos → CTA Final

## Skill de design

```bash
python3 ../.agents/skills/ui-ux-pro-max/scripts/search.py "fitness store ecommerce landing" \
  --design-system --persist -p "FitnessStore"
```

## Comandos

```bash
cd web && npm run dev
npm run build   # valide o build antes de entregar
```
