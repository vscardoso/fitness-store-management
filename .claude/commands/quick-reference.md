---
description: Referência rápida — tipos, prompts UI-UPGRADE prontos, tokens, checklist
---

# 🚀 Referência Rápida

Consulta rápida. Fonte completa: `QUICK_REFERENCE.md` (prompts UI-UPGRADE prontos) e
`AGENT_ORCHESTRATION.md` (processo por tipo de mudança).

Contexto/pedido: **$ARGUMENTS**

## Comandos do projeto

```powershell
# Backend
cd backend && .\venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
python migrate.py "descrição"        # gera + aplica migration
pytest                                # testes

# Mobile
cd mobile && .\expo-dev.ps1
.\expo-dev.ps1 -Tunnel                # device físico em outra rede
.\kill-all.ps1                        # se travar

# Web
cd web && npm run dev
npm run build
```

## Onde fica cada coisa

| Preciso mexer em... | Vá para |
|---|---|
| Endpoint | `backend/app/api/v1/endpoints/` + `include_router` no `router.py` |
| Regra de negócio | `backend/app/services/` |
| Query / acesso a dados | `backend/app/repositories/` |
| Tabela | `backend/app/models/` → `python migrate.py` |
| Contrato da API | `backend/app/schemas/` |
| Auth / tenant | `backend/app/api/deps.py` |
| Tela do app | `mobile/app/` (Expo Router, file-based) |
| Chamada de API do app | `mobile/services/<domínio>Service.ts` |
| Estado global do app | `mobile/store/` (Zustand) |
| Componente reutilizável | `mobile/components/ui/` |
| URL da API | `mobile/constants/Config.ts` (**único** lugar) |
| Cores do app | `mobile/constants/Colors.ts` / `useThemeColors()` |
| Site / catálogo público | `web/app/`, `web/services/api.ts`, `/public/*` no backend |
| Tokens do site | `web/tailwind.config.ts` (`pink.*`, `surface.*`) |

## Modelos-chave

- **Product** — `name`, `sku`, `barcode`, `cost_price`, `sale_price` → category, inventory,
  variants, media
- **Inventory** — `quantity` = soma de `EntryItem.quantity_remaining`. **Nunca escrever direto**
- **StockEntry / EntryItem** — FIFO. `EntryType`: `trip`, `online`, `local`, `initial`,
  `adjustment`, `return`, `donation` (em `models/stock_entry.py`)
- **Customer** — `loyalty_points`, `total_spent`, `customer_type` REGULAR/VIP/PREMIUM
  (auto-upgrade em R$ 10k / R$ 25k)
- **Sale** — `customer_id`, `total_amount`, `payment_method`, `status`
- **ConditionalShipment** — envio condicional. `ShipmentStatus` em `models/enums.py`:
  `PENDING`, `SENT`, `RETURNED_NO_SALE`, `COMPLETED_PARTIAL_SALE`, `COMPLETED_FULL_SALE`
- **Supplier / SupplierProduct**, **Trip**, **Expense**, **Look**, **Subscription**,
  **PDVTerminal**, **PixTransaction**

## Snippets

**Endpoint com tenant + role**
```python
@router.get("/", response_model=List[XResponse])
async def list_x(
    db: AsyncSession = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
    user: User = Depends(require_role([UserRole.ADMIN, UserRole.SELLER])),
):
    return await XService(db).list(tenant_id=tenant_id)
```

**Mutation no mobile**
```ts
const mutation = useMutation({
  mutationFn: updateX,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['x'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
  },
});
```

**Request sem loading overlay**
```ts
api.get('/algo', { headers: { 'X-Skip-Loading': 'true' } });
api.post('/algo', body, { headers: { 'X-Loading-Message': 'Salvando...' } });
```

## UI-UPGRADE

Prompts completos (listagem, dados financeiros, formulário, correção cirúrgica de cores) estão
em `QUICK_REFERENCE.md` § "Prompts Prontos — UI-UPGRADE". Regras que valem sempre:

- `PageHeader` + `headerShown: false`
- Sem `Divider` — `margin` / `gap`
- Cores por token, nunca hex hardcoded
- Sem emoji como ícone
- Sem botão `position: absolute` — scroll ou sticky footer
- Textos em português

## Pitfalls

- SQL raw PostgreSQL: `= true` / `= false`, **nunca** `= 1` / `= 0` para BOOLEAN
- Não mutar cache do React Query na mão
- Não criar produto com estoque sem `StockEntry`
- Não esquecer `tenant_id` em create manual
- `response_model` divergente do retorno → 500, não 422
