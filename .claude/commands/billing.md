---
description: Especialista faturamento — assinaturas, Mercado Pago, MRR, DRE, churn
---

# Especialista Faturamento / SaaS

Cobrança do **sistema** (assinatura do lojista), não a venda da loja.

## Estado atual — leia antes de assumir qualquer coisa

Existe o model `Subscription` (`backend/app/models/subscription.py`), mas o módulo ainda é
parcial:

- ✅ `Subscription` criada no cadastro — ver `app/services/signup_service.py`,
  `app/api/v1/endpoints/auth.py`, `app/schemas/signup.py`
- ❌ **Não existe** `subscription_service.py` nem `subscription_repository.py`
- ❌ **Não existe** endpoint de billing (nada de `/subscriptions/*` no `router.py`)
- ❌ Nenhuma integração de cobrança recorrente ligada

⚠️ `mp_connect.py` é OAuth do Mercado Pago **para o PDV** (recebimento da loja) — não é billing
da assinatura. Não confundir os dois fluxos.

## Model `Subscription`

Campos: `tenant_id` (FK `stores.id`, **unique** — 1 assinatura por loja), `plan`, `status`,
`is_trial`, `trial_started_at`, `trial_ends_at`, `current_period_start`, `current_period_end`,
limites (`max_products`, `max_users`, `max_sales_per_month`), features
(`feature_advanced_reports`, `feature_multi_store`, `feature_api_access`,
`feature_custom_fields`), pagamento (`payment_provider`, `payment_customer_id`,
`payment_subscription_id`), `cancelled_at`, `cancelled_reason`.

`status`: `active` | `cancelled` | `expired` | `suspended`

### Planos (`get_plan_limits()`)

| Plano | Produtos | Usuários | Vendas/mês | Relatórios avançados | Multi-loja | API |
|---|---|---|---|---|---|---|
| `trial` (30 dias) | 100 | 1 | ilimitado | ❌ | ❌ | ❌ |
| `free` | 50 | 1 | 100 | ❌ | ❌ | ❌ |
| `pro` (R$ 49/mês) | 999999 | 5 | ilimitado | ✅ | ❌ | ✅ |
| `enterprise` | 999999 | 999999 | ilimitado | ✅ | ✅ | ✅ |

Properties prontas: `is_trial_active`, `trial_days_remaining`, `is_paid_plan`.

⚠️ `can_create_products` e `can_add_users` são **placeholders que retornam `True`** — a contagem
real precisa ser feita na service layer. Não confie nelas para enforcement.

## Ao implementar billing

Siga a arquitetura de 3 camadas (`/backend`):

1. `SubscriptionRepository` (`app/repositories/`) — herdar `BaseRepository`, `db` no `__init__`.
2. `SubscriptionService` (`app/services/`) — trial, upgrade/downgrade, cancelamento,
   **enforcement real dos limites** (contar produtos/usuários do tenant).
3. Endpoints em `app/api/v1/endpoints/subscriptions.py` + `include_router` no `router.py`.
4. Webhook do gateway em `app/webhooks/` (hoje só existe `whatsapp.py`).
5. `python migrate.py "..."` se mexer no model.

### Regras

- `tenant_id` é **unique** — nunca criar segunda assinatura para a mesma loja; use `get_or_create`.
- Soft delete: cancelar é `status = "cancelled"` + `cancelled_at`, nunca deletar a linha.
- Webhook de pagamento tem que ser **idempotente** (o gateway reenvia o mesmo evento).
- Downgrade que estoura limite: **não** apagar dados do lojista — bloquear criação de novos.
- Nunca logar credencial de gateway nem devolver em response.
- Datas: os campos são `DateTime` sem timezone e as properties usam `datetime.now()` — mantenha
  a consistência ao comparar períodos.

## Métricas (quando implementar relatórios)

- **MRR** = soma das assinaturas `active` e `is_paid_plan`, normalizada por mês.
- **Churn** = cancelamentos no período ÷ assinantes ativos no início do período.
- **DRE / P&L da loja** é outra coisa: vem de `Expense` + `Sale` (ver
  `app/services/expense_service.py` e `report_service.py`), não da `Subscription`.
