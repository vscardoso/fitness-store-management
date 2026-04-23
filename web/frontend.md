# frontend.md — WA Moda Fitness Web

Guia de referência para desenvolvimento do frontend do catálogo online.

## Stack e contexto

- **Site:** https://www.wamodafitness.com.br (Next.js 14+, App Router, TypeScript, Tailwind)
- **Backend:** https://fitness-backend-x1qn.onrender.com (FastAPI + PostgreSQL)
- **Marca:** W.A Moda Fitness — roupas fitness femininas (leggings, tops, conjuntos, macacões)
- **Identidade visual:** dark theme (`#0d0d18`), rosa vibrante (`#FF1A6C`), fontes Barlow + Barlow Condensed
- **Modelo de negócio:** catálogo de vitrine + contato via **WhatsApp** — NÃO há carrinho, checkout ou conta de usuário

## Referências de design

- **https://vistaeuforia.com.br** — imagens portrait 3:4, cards clean, trust badges, grade densa (8px gap), parcelas visíveis
- **https://www.manalinda.com** — layout feminino clean, destaques de lançamentos, WhatsApp flutuante

## O que está implementado ✅

### Estrutura de arquivos
```
web/
├── app/
│   ├── page.tsx              ✅ Homepage com hero split, produtos, condicional, looks, CTA
│   ├── produtos/[id]/page.tsx ✅ Página de produto com portrait + trust signals + WhatsApp
│   ├── looks/page.tsx        ✅ Galeria de looks
│   ├── looks/[id]/page.tsx   ✅ Detalhe do look
│   └── sitemap.ts            ✅ Sitemap dinâmico (produtos + looks)
├── components/
│   ├── Navbar.tsx            ✅ Sticky, mobile drawer, WhatsApp CTA
│   ├── ProductCard.tsx       ✅ Portrait 3:4, tamanhos, parcelas, WhatsApp hover
│   ├── CategoryFilter.tsx    ✅ Filtro por categoria (pills horizontais)
│   ├── LookCard.tsx          ✅ Card de look
│   ├── WhatsAppButton.tsx    ✅ (componente existe mas não está ativo globalmente)
│   └── sections/
│       └── ProductsSection.tsx ✅ Grid 2/3/4 cols com filtro de categoria
└── services/api.ts           ✅ Funções: getProducts, getProduct, getCategories, getLooks
```

### Homepage (page.tsx)
- Hero split desktop: texto à esquerda + produto em destaque à direita (portrait)
- Label "Nova coleção", headline impactante, CTAs "Ver produtos" + "Monte seu look"
- Counters dinâmicos: qtd produtos, frete grátis, atendimento
- Seção de produtos com filtro por categoria
- Seção "Condicional" (experimente antes de comprar)
- Lookbook (se houver looks públicos)
- CTA final WhatsApp

### Produto (/produtos/[id])
- Imagem portrait 3:4
- Trust signals: Frete Grátis / 1ª Troca / Pagamento Seguro
- Tamanhos + cores das variantes
- Parcelas (3x sem juros)
- WhatsApp: "Pedir via WhatsApp" + "Receber em casa para experimentar"

---

## O que ainda faz sentido implementar 📋

### Prioridade ALTA

**1. WhatsApp flutuante global**
- Componente fixo no canto inferior direito em todas as páginas
- Já existe `WhatsAppButton.tsx` — ativar em `app/layout.tsx`
- Animar entrada após 3s de página aberta

**2. Trust badges horizontais abaixo do hero**
- Faixa entre hero e produtos: "Frete Grátis acima de R$200" | "3x sem juros" | "Troca grátis" | "Atendimento WhatsApp"
- Scroll horizontal no mobile, 4 colunas no desktop

**3. Galeria de fotos na página de produto**
- Backend já tem `GET /api/v1/products/{id}/media` com galeria de fotos
- Implementar thumbnail row + imagem principal com click para trocar
- Swipe no mobile

**4. Animações de scroll (Intersection Observer)**
- Cards entram com fade + slide-up ao rolar
- Sem biblioteca — puro CSS `@keyframes` + `IntersectionObserver`

### Prioridade MÉDIA

**5. Seção de categorias com imagens (estilo Vista Euforia)**
- Grid de imagens de categorias: Leggings / Tops / Conjuntos / Macacões
- Foto real de produto por categoria + label sobreposto
- Rola para o filtro de categoria ao clicar
- Implementar entre o hero e a seção de produtos

**6. "Você também vai amar" na página de produto**
- Buscar produtos da mesma categoria
- Grid de 4 cards portrait ao final da página de produto

**7. Badge "NOVO" nos cards**
- Se `created_at` for nos últimos 30 dias → badge "NOVO"
- Se tiver desconto (sale_price < price) → badge "% OFF"

**8. Navbar — categorias no desktop**
- Buscar categorias via `getCategories()` em Server Component no layout
- Exibir como links no menu desktop (agora só tem "Produtos" e "Looks")

### Prioridade BAIXA

**9. Loading skeleton nos cards**
- Skeleton de cards enquanto carrega
- Só relevante se mover para RSC com Suspense

**10. Hover para segunda foto do produto**
- Se o produto tiver galeria, trocar imagem no hover do card
- Depende do item 3 (galeria) estar implementado primeiro

---

## O que NÃO implementar ❌

| Item | Motivo |
|------|--------|
| Carrinho / e-commerce | O negócio vende via WhatsApp, não há checkout direto |
| Favoritar / wishlist | Sem conta de usuário, não persiste |
| "Adicionar ao carrinho" | Não existe carrinho — CTA é sempre WhatsApp |
| Login/conta | Sem autenticação no web |
| Checkout / pagamentos web | Toda venda é fechada via WhatsApp ou app mobile |
| Slug de produto | Rota usa `/produtos/[id]` (número), não slug de texto |

---

## Endpoints disponíveis

```
GET /api/v1/products                  Lista produtos (limit, skip, category_id, search)
GET /api/v1/products/{id}             Produto individual com variantes
GET /api/v1/products/{id}/media       Galeria de fotos do produto
GET /api/v1/categories                Categorias
GET /api/v1/looks                     Looks públicos
GET /api/v1/looks/{id}                Look com produtos
```

## Variáveis de ambiente

```env
NEXT_PUBLIC_API_URL=https://fitness-backend-x1qn.onrender.com/api/v1
NEXT_PUBLIC_WHATSAPP_NUMBER=55XXXXXXXXXXX
NEXT_PUBLIC_STORE_NAME=WA Moda Fitness
NEXT_PUBLIC_SITE_URL=https://www.wamodafitness.com.br
```

## Restrições técnicas

- CSS: apenas Tailwind classes + `globals.css` para tokens/componentes reutilizáveis
- Componentes reutilizáveis em `/components/` e `/components/sections/`
- Imagens: `next/image` com `remotePatterns` já configurado
- TypeScript estrito, sem `any`
- Não quebrar rotas existentes
- Server Components por padrão, `"use client"` só quando necessário (interatividade)
- ISR com `revalidate = 60` em todas as páginas

## Como implementar novos itens

1. Ler os arquivos existentes antes de escrever qualquer código
2. Verificar se o endpoint do backend retorna o dado necessário
3. Server Component → passar props para Client Component quando precisar de estado
4. Invalidar ISR via `revalidate` ou on-demand revalidation se necessário
5. Testar mobile (375px) e desktop (1280px+)
