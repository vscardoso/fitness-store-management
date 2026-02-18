# Correções Aplicadas — fitness-store-management

> Gerado em: 17/02/2026  
> Sessão de revisão arquitetural completa

---

## Resumo Executivo

Foram identificadas e corrigidas **5 inconsistências críticas** no sistema, divididas entre backend (Python/FastAPI) e mobile (React Native/TypeScript). Todas as correções preservam os invariantes FIFO e o isolamento multi-tenant.

---

## Correção 1 — Inventory vs FIFO: `add_item_to_entry` e `delete_entry`

**Arquivo:** `backend/app/services/stock_entry_service.py`  
**Problema:** `add_item_to_entry()` e `delete_entry()` atualizavam `Inventory.quantity` diretamente com `+qty` / `-qty`, podendo divergir da soma real dos `EntryItem.quantity_remaining`.  
**Correção:** Substituído por `rebuild_product_from_fifo(product_id, tenant_id)` após cada operação.

**Invariante preservada:**
```
Inventory.quantity == SUM(EntryItem.quantity_remaining WHERE is_active=True AND tenant_id=X AND product_id=Y)
```

---

## Correção 2 — `activate_catalog_product` não usava FIFO

**Arquivo:** `backend/app/services/product_service.py`  
**Problema:** `activate_catalog_product()` fazia `inventory.quantity += quantity` diretamente, sem passar pelo FIFO.  
**Correção:** Substituído por `flush()` + `rebuild_product_from_fifo()` após criar o `EntryItem`.

---

## Correção 3 — `update_product` alterava `unit_cost` retroativamente

**Arquivo:** `backend/app/services/product_service.py`  
**Problema:** Ao atualizar `cost_price` de um produto, o código propagava o novo valor para todos os `EntryItems` com `quantity_remaining > 0`, distorcendo CMV histórico e ROI por entrada.  
**Correção:** Removido o bloco de propagação. O `cost_price` do produto agora serve apenas como valor **sugerido** para novas entradas. `EntryItems` existentes são imutáveis.

**Regra de negócio:**
```
unit_cost em EntryItem = custo REAL pago naquela compra (imutável)
cost_price em Product = sugestão para próximas entradas (mutável)
```

---

## Correção 4 — Wizard mobile: produto criado com `is_catalog=True` incorretamente

**Arquivos modificados:**
- `mobile/types/index.ts` — adicionado `is_catalog?: boolean` ao `ProductCreate`
- `mobile/hooks/useProductWizard.ts` — adicionado `is_catalog: false` no payload de criação
- `backend/app/services/product_service.py` — corrigida lógica de inferência de `is_catalog`
- `mobile/components/products/WizardComplete.tsx` — melhorado aviso de produto sem estoque

**Problema:** O backend inferia `is_catalog=True` para qualquer produto com `initial_stock=0`. O wizard sempre envia `initial_stock=0` (estoque via entrada FIFO), então **todos os produtos criados pelo wizard ficavam `is_catalog=True`** — invisíveis na lista de produtos e nas vendas.

**Correção no backend:**
```python
# ANTES (errado):
if initial_stock is None or initial_stock <= 0:
    product_dict["is_catalog"] = True  # Sobrescrevia o valor do cliente!

# DEPOIS (correto):
client_is_catalog = product_dict.get("is_catalog")
if client_is_catalog is None:
    # Fallback legado: inferir pelo estoque (compatibilidade)
    product_dict["is_catalog"] = (initial_stock is None or initial_stock <= 0)
else:
    # Respeitar o valor enviado pelo cliente
    pass  # client_is_catalog já está no dict
```

**Correção no mobile (hook):**
```typescript
const productData: ProductCreate = {
  // ...outros campos...
  initial_stock: 0,
  is_catalog: false,  // ← SEMPRE false para produtos criados pelo usuário da loja
};
```

**UX melhorada no WizardComplete:**
- Título: "Produto sem Estoque" (antes: "Sem Entrada Vinculada")
- Texto explica que o produto **aparece na lista** mas **não pode ser vendido**
- Instruções passo a passo para vincular uma entrada

---

## Correção 5 — FIFOService sem isolamento multi-tenant

**Arquivos modificados:**
- `backend/app/repositories/entry_item_repository.py` — adicionado `tenant_id` ao `get_available_for_product()`
- `backend/app/services/fifo_service.py` — propagado `tenant_id` em `check_availability()`, `simulate_sale()`, `get_product_cost_info()`

**Problema:** `get_available_for_product()` não filtrava por `tenant_id`, permitindo que vendas de um tenant consumissem `EntryItems` de outro tenant.

**Correção:**
```python
# ANTES:
WHERE product_id = X AND quantity_remaining > 0 AND is_active = True

# DEPOIS:
WHERE product_id = X AND quantity_remaining > 0 AND is_active = True AND tenant_id = Y
```

---

## Arquivos Modificados

| Arquivo | Tipo | Correções |
|---------|------|-----------|
| `backend/app/services/product_service.py` | Backend | #2, #3, #4 |
| `backend/app/services/stock_entry_service.py` | Backend | #1 |
| `backend/app/services/fifo_service.py` | Backend | #5 |
| `backend/app/repositories/entry_item_repository.py` | Backend | #5 |
| `mobile/hooks/useProductWizard.ts` | Mobile | #4 |
| `mobile/types/index.ts` | Mobile | #4 |
| `mobile/components/products/WizardComplete.tsx` | Mobile | #4 (UX) |

---

## Invariantes FIFO — Referência Rápida

```
1. Inventory.quantity == SUM(EntryItem.quantity_remaining WHERE is_active=True AND tenant_id=X)
2. EntryItem.unit_cost é IMUTÁVEL após criação
3. Toda alteração de estoque passa por rebuild_product_from_fifo()
4. FIFOService sempre filtra por tenant_id
5. Produtos criados pelo wizard são is_catalog=False (produto da loja, não template global)
```

---

## Correção 6 — `sale_service.py`: `check_availability` sem `tenant_id`

**Arquivo:** `backend/app/services/sale_service.py`  
**Problema:** `check_availability` era chamado sem `tenant_id`, permitindo que a verificação de disponibilidade de estoque consultasse `EntryItems` de outros tenants.  
**Correção:** Adicionado `tenant_id=tenant_id` na chamada.

**Problema secundário:** `get_sales_by_period` tinha código morto após o `return` (chamada duplicada sem `tenant_id`).  
**Correção:** Removido o bloco duplicado.

---

## Correção 7 — Emojis removidos de todo o backend

**Arquivos:** 15 arquivos em `backend/app/` (services, endpoints, schemas, repositories)  
**Problema:** Emojis em strings de `logger.info()`, `print()` e comentários inline violam a regra do projeto.  
**Correção:** Script Python com regex Unicode removeu todos os emojis de forma não-destrutiva.

**Arquivos limpos:**
- `api/deps.py`, `api/v1/endpoints/conditional_shipments.py`, `api/v1/endpoints/debug.py`
- `api/v1/endpoints/products.py`, `api/v1/endpoints/reports.py`, `api/v1/endpoints/sales.py`
- `api/v1/endpoints/trips.py`, `schemas/product.py`, `services/ai_scan_service.py`
- `services/auth_service.py`, `services/conditional_notification_service.py`
- `services/notification_scheduler.py`, `services/product_seed_service.py`
- `services/sale_service.py`, `services/signup_service.py`

---

## Análise: Dashboard CMV

**Resultado:** Correto. O Dashboard usa `SaleItem.unit_cost` para calcular CMV:
```sql
SUM(SaleItem.quantity * SaleItem.unit_cost)
```
`SaleItem.unit_cost` é preenchido pelo `FIFOService.process_sale()` com o custo médio ponderado das fontes FIFO — não usa `Inventory.quantity`. Nenhuma correção necessária.

---

## Análise: WIP.md

**Resultado:** Itens pendentes são melhorias futuras (cache de scans, modo batch, histórico). Nenhum bug crítico identificado. Erros TypeScript pré-existentes listados são em arquivos não relacionados ao wizard e devem ser tratados em sessão separada.

---

## Pendências Identificadas (não corrigidas nesta sessão)

- [ ] **Erros TypeScript pré-existentes**: `app/(tabs)/conditional/[id].tsx`, `app/(tabs)/more.tsx`, `hooks/usePushNotifications.ts`, `components/sale/BarcodeScanner.tsx`
- [ ] **Notificações periódicas**: verificar isolamento multi-tenant em `conditional_notification_service.py`
- [ ] **Testes**: verificar cobertura dos cenários corrigidos (FIFO multi-tenant, is_catalog, check_availability)
- [ ] **Melhorias futuras (WIP.md)**: cache de scans, modo batch, histórico de scans
