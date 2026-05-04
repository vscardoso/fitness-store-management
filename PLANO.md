# Plano de Implementação — fitness-store-management

## Status atual (2026-05-04)

### ✅ Concluído
- SaaS multi-tenant com self-service onboarding (mobile)
- Backend: modelo 3 camadas, FIFO strict, soft delete
- Mobile: Expo Router, React Query, Zustand, wizard de produtos, PDV
- Web: catálogo público Next.js (para venda)
- Remoção do catálogo **global** de produtos (templates compartilhados entre tenants)
- `is_catalog` deixou de ser auto-sincronizado pelo FIFO

---

## Melhores Práticas — Catálogo vs Estoque Ativo

### Como os melhores sistemas fazem

Baseado em Shopify, VTEX, Bling, Tiny ERP, Odoo e SAP Business One:

| Sistema | Catálogo | Estoque |
|---------|----------|---------|
| **Shopify** | "Product" (dados + visibilidade) | "Inventory" (quantities per location) |
| **VTEX** | SKU / Catálogo (produto master) | Inventário (quantidade por armazém) |
| **Bling** | Produto (cadastro completo) | Estoque (movimento de entrada/saída) |
| **Odoo** | Product Template + Variants | Stock Quant (FIFO/AVCO real) |
| **SAP B1** | Item Master Data | Warehouse Quantities |

**Princípio universal:** Catálogo = dados do produto (o que você vende). Estoque = quanto você tem desse produto. São conceitos separados mas relacionados.

### Estados típicos de um produto

```
RASCUNHO → CATÁLOGO (sem estoque) → CATÁLOGO + ESTOQUE (ativo) → DESCONTINUADO
                                  ↘ INTERNO (sem catálogo, só estoque)
```

### Nossa definição (adaptada ao contexto fitness)

| `is_catalog` | Tem estoque | Significa | Exibição |
|-------------|-------------|-----------|----------|
| `true` | sim | Produto ativo, disponível para venda | Mostra no catálogo web, disponível no PDV |
| `true` | não | Produto em catálogo, aguardando estoque | Mostra no catálogo com badge "Sem estoque" |
| `false` | sim | Produto interno (ex: serviço, bonificação) | Só aparece no PDV, não no catálogo web |
| `false` | não | Rascunho / uso interno | Não aparece em lugar nenhum para o cliente |

---

## Redesign do campo `is_catalog`

### O que era (errado)
1. Auto-sync baseado em FIFO: produto sem estoque → `is_catalog=true` ← **ERRADO**
2. Campo global compartilhado entre tenants ← **ERRADO**

### O que é (correto)
- `is_catalog` é uma **decisão do usuário**, por tenant, por produto
- Significa: "este produto aparece no catálogo público da minha loja?"
- Default ao criar produto: `is_catalog=True` (a maioria dos produtos é para venda)
- **Nunca** auto-modificado pelo sistema

### Comportamento esperado ao criar produto

Ao criar produto no wizard (Step 1 ou Step final), o usuário escolhe:
- **Catálogo + Estoque** (padrão) → `is_catalog=True` + StockEntry → produto visível com estoque
- **Somente Catálogo** → `is_catalog=True` sem StockEntry → visível com "Sem estoque"
- **Somente Interno** → `is_catalog=False` + StockEntry (opcional) → apenas no PDV

### Impacto nas listagens

- **Catálogo web público** (`/api/v1/public/catalog`): filtra `is_catalog=True`
- **PDV mobile** (scanner/busca produto): mostra TODOS com estoque (ignora `is_catalog`)
- **Lista de produtos (mobile admin)**: mostra TODOS os produtos do tenant
- **Badge "Sem estoque"**: `is_catalog=True AND total_stock=0`
- **Badge "Interno"**: `is_catalog=False`

---

## Correções necessárias (após redesign)

### Backend
- [ ] `create_product()`: default `is_catalog=True` (era `False`)
- [ ] Endpoint `POST /products`: aceitar `is_catalog` no body (o usuário decide)
- [ ] `public_catalog.py`: garantir filtro `is_catalog=True`
- [ ] `products_grouped.py`: admin vê tudo; catálogo web filtra por `is_catalog`
- [ ] Schema `ProductCreate`: expor campo `is_catalog` (boolean, default True)

### Mobile (wizard)
- [ ] Step final do wizard: toggle "Publicar no catálogo da loja?" (default ON)
- [ ] Lista de produtos: badge "Interno" quando `is_catalog=False`
- [ ] Detalhe do produto: mostrar status catálogo + toggle para mudar

### Web
- [ ] Catálogo público: já filtra — verificar que usa `is_catalog=True`

---

## Próximos itens do backlog (por prioridade)

### 🔴 Alta prioridade

#### 1. Redesign `is_catalog` (item acima)
Implementar conforme tabela: user-controlled, default True, sem auto-sync.

#### 2. Tela de detalhe do produto (mobile)
- `/products/[id]` — dados completos, galeria de fotos, variantes, histórico de entrada
- Botão "Adicionar entrada" → vai para wizard de entrada
- Botão "Editar produto" + toggle "Publicar no catálogo"
- Estoque por variante

#### 3. Scan de barcode no PDV (mobile)
- `BarcodeScanner.tsx` já existe mas tem erros TS conhecidos
- Integrar com o fluxo de venda: scan → adiciona ao carrinho

#### 4. Relatórios básicos (mobile)
- Vendas por período (já tem endpoint)
- Produtos mais vendidos
- Estoque atual (snapshot)

### 🟡 Média prioridade

#### 5. Foto no wizard (mobile)
- `QRCodeScanner.tsx` e `BarcodeScanner.tsx` com props Modal ainda com erro TS
- Scanner de código de barras no Step 1 do wizard (alternativa ao scanner IA)

#### 6. Web: melhorias do catálogo público
- Filtros por categoria/tamanho/cor
- Busca
- Carrinho → link WhatsApp

#### 7. Gestão de usuários por tenant (admin panel)
- Listar usuários da loja, convidar, definir roles (ADMIN/SELLER/VIEWER)

### 🟢 Baixa prioridade / Futura

#### 8. Billing / Assinaturas
- Integração Mercado Pago
- Upgrade de plano dentro do app
- Trial counter no dashboard

#### 9. Notificações push
- Estoque baixo
- Venda realizada
- `usePushNotifications.ts` com erro TS (Expo Notifications API mudou)

#### 10. Exportação de relatórios
- PDF/CSV de vendas, estoque, P&L

---

## Convenções do projeto

- Backend: `API → Service → Repository`, async, soft delete, tenant_id em tudo
- Mobile: React Query para server state, Zustand para UI state, Expo Router
- Após mutation: `queryClient.invalidateQueries()` sempre
- Loading automático via `loadingManager` (sem spinner manual)
- Sem Dividers na UI — usar gap/margin
- `headerShown: false` em telas com header custom
