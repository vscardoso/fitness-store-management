# Billing Expert

Você está no modo **billing expert** do projeto fitness-store-management.

## Contexto

Sistema de assinaturas SaaS multi-tenant. Cada loja tem uma `Subscription` com plano e limites.

## Modelos

**Store** (`backend/app/models/store.py`):
- `slug`, `domain`, `name`, `logo_url`, `is_default`
- `plan` (free/trial/pro/enterprise)
- `mp_access_token`, `mp_user_id` — conta MP conectada via OAuth

**Subscription** (`backend/app/models/subscription.py`):
- `store_id`, `plan` (TRIAL/FREE/PRO/ENTERPRISE)
- `status` (ACTIVE/CANCELLED/PAST_DUE/TRIALING)
- `trial_ends_at`, `current_period_start`, `current_period_end`
- `max_products`, `max_users`, `max_monthly_sales`
- `external_id` — ID no provider de pagamento (MP/Stripe)

## Planos e limites

| Plano | Produtos | Usuários | Vendas/mês | Preço |
|-------|----------|----------|------------|-------|
| TRIAL | 100 | 3 | 500 | Grátis 30 dias |
| FREE | 50 | 1 | 100 | Grátis |
| PRO | Ilimitado | 10 | Ilimitado | A definir |
| ENTERPRISE | Ilimitado | Ilimitado | Ilimitado | Custom |

## Fluxo de signup

1. `POST /api/v1/auth/signup` → cria Store + User (ADMIN) + Subscription (TRIAL 30 dias)
2. `ProductSeedService.seed_fitness_products()` → 115 produtos catálogo (`is_catalog=True`)
3. Trial expira → downgrade para FREE ou cobrança

## Integração Mercado Pago

- **PIX**: cobrança avulsa por venda (PDV)
- **Assinaturas**: MP Subscriptions (futuro — ainda não implementado como recorrência automática)
- OAuth por loja: cada tenant conecta sua própria conta MP

```env
# Tenant-level (salvo em Store.mp_access_token)
MP_ACCESS_TOKEN=APP_USR-...   # live token da conta da loja
MP_WEBHOOK_SECRET=...

# App-level OAuth (aplicação registrada em mercadopago.com/developers)
MP_CLIENT_ID=...
MP_CLIENT_SECRET=...
FRONTEND_URL=exp://localhost:8081
```

## Endpoints de billing

```
GET  /api/v1/store/subscription     # status da assinatura atual
POST /api/v1/store/subscription/upgrade  # upgrade de plano
POST /api/v1/mp/connect             # conectar conta MP (OAuth)
GET  /api/v1/mp/status              # status MP OAuth
DELETE /api/v1/mp/disconnect        # desconectar MP
```

## Métricas (Dashboard)

O dashboard em `backend/app/api/v1/endpoints/dashboard.py` (73KB) expõe:
- `revenue_today`, `revenue_month`, `revenue_year`
- `sales_count`, `avg_ticket`
- `top_products`, `top_customers`
- `low_stock_alerts`
- DRE simplificado (receita - despesas = lucro)

## Relatórios financeiros

`backend/app/api/v1/endpoints/reports.py`:
- Fluxo de caixa por período
- P&L (receita vs despesas)
- Histórico de vendas filtrado

## Métricas SaaS a implementar (futuros)

- **MRR** (Monthly Recurring Revenue): soma de assinaturas ativas pagas
- **Churn**: lojas que cancelaram / total lojas ativas
- **ARR** = MRR × 12
- **LTV** = ticket médio mensal / churn rate

---

Pronto para trabalhar em billing, assinaturas ou relatórios financeiros.
