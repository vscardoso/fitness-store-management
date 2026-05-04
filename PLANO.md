# Plano de Implementação — fitness-store-management

## Status atual (2026-05-04)

### ✅ Concluído
- SaaS multi-tenant com self-service onboarding (mobile)
- Backend: modelo 3 camadas, FIFO strict, soft delete
- Mobile: Expo Router, React Query, Zustand, wizard de produtos, PDV
- Web: catálogo público Next.js (para venda)
- Remoção do catálogo global de produtos (templates compartilhados entre tenants)

---

## Problema atual: campo `is_catalog`

**O que foi feito (errado):** Auto-sync de `is_catalog` baseado no estoque FIFO — produto sem estoque vira `is_catalog=True`.

**O que o usuário quer:** Sem conceito de catálogo. Produtos são produtos. Se tem estoque = ativo. Se não tem estoque = aparece com badge "sem estoque". Ponto.

**Correção necessária:**
- Remover o auto-sync de `is_catalog` no `rebuild_product_from_fifo`
- Remover o auto-sync de `is_catalog` no `rebuild_all_from_fifo`  
- Sempre criar produto com `is_catalog=False`
- `is_catalog` fica deprecated — ignorado pelo front (será removido futuramente)
- Listagens mostram todos os produtos, badge "sem estoque" baseado em `current_stock === 0`

---

## Próximos itens do backlog (por prioridade)

### 🔴 Alta prioridade

#### 1. Corrigir `is_catalog` (agora)
Ver seção acima.

#### 2. Tela de detalhe do produto (mobile)
- `/products/[id]` — dados completos, galeria de fotos, variantes, histórico de entrada
- Botão "Adicionar entrada" → vai para wizard de entrada
- Botão "Editar produto"
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
