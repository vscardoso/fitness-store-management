---
description: Especialista PDV — TEF, Stone/Cielo, PIX, terminals, fluxo de checkout
---

# Especialista PDV

Ponto de venda com maquininha (TEF) e PIX.

## Arquivos

```
backend/app/api/v1/endpoints/pdv.py        # todos os endpoints /pdv/*
backend/app/api/v1/endpoints/mp_connect.py # OAuth Mercado Pago (vincula conta do lojista)
backend/app/services/pdv_service.py
backend/app/services/payment_providers/    # base, factory, mercadopago, stone, cielo,
                                           # cielo_pix, manual, mock_pix
backend/app/models/pdv_terminal.py         # PDVTerminal
backend/app/models/pix_transaction.py      # PixTransaction
mobile/services/pdvService.ts
mobile/app/checkout/                       # fluxo de checkout
```

## Providers

Duas interfaces abstratas em `payment_providers/base.py`:

- **`BaseTerminalProvider`** — `setup_terminal`, `create_payment`, `get_payment_status`,
  `cancel_payment`, `refund_payment`
- **`BasePixProvider`** — `create_pix_payment`, `get_pix_status`, `refund_pix`

Resolução via `payment_providers/factory.py` (singletons com cache):

```python
from app.services.payment_providers.factory import get_terminal_provider, get_pix_provider

provider = get_terminal_provider("mercadopago")   # mercadopago | stone | cielo | (resto → manual)
pix = get_pix_provider("mercadopago")             # mock | mercadopago | cielo_pix
```

- Terminal: `mercadopago` → `MercadoPagoTerminalProvider`, `stone` → `StoneConnectProvider`,
  `cielo` → `CieloLIOProvider`. **Qualquer outro** (rede, getnet, pagseguro, sumup, manual) cai
  em `ManualTerminalProvider` — confirmação manual pelo operador.
- PIX: só `mock`, `mercadopago` e `cielo_pix` são suportados — o resto levanta `ValueError`.

**Ao adicionar um provider novo:** implemente a interface em `payment_providers/<nome>.py`,
registre em `_get_terminal_class` / `_get_pix_class` (import lazy, para evitar circular),
e trate o webhook correspondente.

## Endpoints principais (`/api/v1/pdv`)

| Grupo | Rotas |
|---|---|
| Providers | `GET /providers` |
| Loja | `POST /store/setup` |
| Terminais | `POST /terminals`, `GET /terminals`, `POST /terminals/{id}/setup`, `DELETE /terminals/{id}`, `PUT /terminals/{id}/credentials`, `POST /terminals/{id}/activate` |
| Devices MP | `GET /devices` |
| Pedidos | `POST /orders`, `GET /orders/{sale_id}/status`, `POST /orders/{sale_id}/cancel`, `POST /orders/{sale_id}/refund`, `POST /orders/{sale_id}/confirm` (manual) |
| SSE | `GET /orders/{sale_id}/events`, `GET /pix/{payment_id}/events` |
| PIX | `POST /pix/start`, `POST /pix/generate-qr`, `POST /pix/{sale_id}`, `GET /pix/{payment_id}/status`, `POST /pix/{payment_id}/refund` |
| Webhooks | `POST /webhooks/mp`, `/webhooks/stone`, `/webhooks/cielo`, `/webhooks/cielo-pix`, `POST /cielo-pix/register-webhook` |

Os endpoints `POST /payment` e `GET /payment/{sale_id}/status` são legados
(`include_in_schema=False`) — não usar em código novo.

## Fluxo de checkout

1. Terminal cadastrado e configurado (`is_configured`, `is_pdv_active`).
2. `POST /pdv/orders` (ou `/pdv/pix/start`) cria a cobrança no provider.
3. Front acompanha por **SSE** (`/events`) ou polling de `/status`.
4. Webhook do provider confirma o pagamento → venda concluída → **FIFO baixa o estoque**.
5. Cancelamento/estorno pelas rotas `/cancel` e `/refund`.

## Regras

- Credenciais do provider ficam em `PDVTerminal.provider_config` (JSON) — **nunca** logar,
  nunca devolver em response.
- Todo terminal é por tenant: filtrar por `tenant_id` sempre.
- Provider sem integração real → `manual`: o operador confirma via
  `POST /orders/{sale_id}/confirm`.
- Webhook é idempotente por natureza — trate reentrega do mesmo evento sem duplicar venda.
- PIX de teste: provider `mock` (`mock_pix.py`), nunca em produção.
