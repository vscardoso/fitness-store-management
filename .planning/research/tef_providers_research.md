# TEF Cloud-to-Terminal Payment Providers - Research

**Researched:** 2026-04-22
**Domain:** Brazilian payment terminal integration (TEF cloud-to-terminal)
**Confidence:** MEDIUM-HIGH (MP Point verified against official docs, Stone Connect verified against official docs, Cielo LIO verified against official docs, PagSeguro LOW confidence)

## Summary

This research investigates how to send payment amounts from a cloud backend directly to physical payment terminals (maquininhas) in Brazil, so the operator does not need to manually type the amount. This is the "TEF remoto" or "cloud-to-terminal" pattern used by gas stations, supermarkets, and modern retail.

Of the four providers investigated, **three have viable cloud-to-terminal REST APIs**: Mercado Pago Point (Orders API v1), Stone Connect (Pagar.me API v5), and Cielo LIO (Order Manager API). PagSeguro does **not** offer a cloud REST API for remote terminal control -- it only supports Android SDK (PlugPag) running directly on the terminal device or via Bluetooth.

**Primary recommendation:** Keep Mercado Pago Point as the first cloud-integrated provider (implementation already exists). Add Stone Connect as second priority (largest installed base in Brazil, clean REST API). Cielo LIO as third (hardware being phased out, API has deadline of 2025-10-15 for adaptations). Skip PagSeguro cloud integration entirely.

---

## 1. Comparativo de Capacidades

| Feature | Mercado Pago Point | Stone Connect | Cielo LIO | PagSeguro |
|---------|-------------------|---------------|-----------|-----------|
| **Cloud REST API** | Sim (Orders v1) | Sim (Pagar.me v5) | Sim (Order Manager v1) | Nao (apenas SDK Android) |
| **Autenticacao** | Bearer Token (Access Token) | Basic Auth (SK key base64) | Client-Id + Access-Token + Merchant-Id | N/A |
| **Sandbox** | Sim (header x-test-scope: sandbox) | Sim (via Pagar.me Dashboard) | Sim (api.cielo.com.br/sandbox-lio/) | N/A |
| **Webhook** | Sim (topic: order) | Sim (charge.paid, charge.refunded) | Sim (status change + transaction) | N/A |
| **Polling** | GET /v1/orders/{id} | GET /core/v5/orders/{id} | GET /orders/{id} | N/A |
| **Terminal auto-recebe** | Sim (automatico, ou botao verde) | Sim (automatico para pedido direto) | Sim (apos PLACE operation) | N/A |
| **Amount format** | String decimal "50.00" (reais) | Integer centavos (5000 = R$50) | Integer centavos (5000 = R$50) | N/A |
| **Cancelar intent** | POST /v1/orders/{id}/cancel | PATCH /orders/{id}/closed (canceled) | PUT /orders/{id}?operation=CLOSE | N/A |
| **Reembolso** | POST /v1/orders/{id}/refund | DELETE /charges/{id} | N/A (manual) | N/A |
| **Credenciais do lojista** | MP Access Token + mp_user_id | SK key + Stonecode + serial number | Client-Id + Access-Token + Merchant-Id | N/A |
| **Parcelas** | Sim (default_installments) | Sim (installments + installment_type) | N/A pela API (operador escolhe no terminal) | N/A |
| **Multi-tenant SaaS** | Sim (token por lojista via OAuth) | Sim (SK key por estabelecimento) | Sim (Merchant-Id por estabelecimento) | N/A |
| **Programa parceria obrigatorio** | Nao | Sim (Stone Partner Hub) | Sim (Developer Portal) | N/A |
| **Tempo resposta API** | < 2s [ASSUMED] | < 2s [ASSUMED] | < 2s [ASSUMED] | N/A |

[VERIFIED: official docs for MP, Stone, Cielo]
[ASSUMED: response times -- not measured, typical for REST APIs]

---

## 2. Fluxo Detalhado por Provider

### 2.1 Mercado Pago Point (Orders API v1)

**Status da implementacao atual:** Ja implementado no codebase (`mercadopago.py`), usa POST /v1/orders. Nao testado em producao.

```
1. SETUP (uma vez por lojista):
   a. POST /users/{mp_user_id}/stores        → cria loja no MP
   b. POST /pos                              → cria POS (caixa virtual)
   c. GET /terminals/v1/list                 → lista maquininhas fisicas
   d. PATCH /terminals/v1/setup              → ativa modo PDV no device

2. CRIAR PAGAMENTO:
   POST https://api.mercadopago.com/v1/orders
   Headers:
     Authorization: Bearer {ACCESS_TOKEN}
     X-Idempotency-Key: {UUID}
     Content-Type: application/json
   Body:
   {
     "type": "point",
     "external_reference": "sale_123_tenant_1",
     "expiration_time": "PT15M",
     "transactions": {
       "payments": [{"amount": "150.00"}]
     },
     "config": {
       "point": {
         "terminal_id": "NEWLAND_N950__N950NCB801293324",
         "print_on_terminal": "no_ticket"
       },
       "payment_method": {
         "default_type": "credit_card",
         "default_installments": 1,
         "installments_cost": "seller"
       }
     },
     "description": "Venda #123"
   }
   Response 201:
   {
     "id": "or_xxxxxxxx",
     "status": "created",
     "transactions": {"payments": [{"id": "pay_xxx", "amount": "150.00"}]}
   }

3. TERMINAL RECEBE AUTOMATICAMENTE:
   - O valor aparece na tela da maquininha
   - Cliente insere cartao / aproxima NFC
   - Se nao aparecer, operador pressiona botao verde ou "Atualizar"

4. POLLING STATUS:
   GET https://api.mercadopago.com/v1/orders/{order_id}
   - status: "created" → "at_terminal" → "processed" (pago)
   - Rate limit: 1 req/s

5. WEBHOOK (recomendado):
   Topic: "order"
   Actions: order.processed, order.canceled, order.expired, order.refunded
   Payload: { type: "order", action: "order.processed", data: { id, status, external_reference } }
   Responder: HTTP 200/201 em < 22s

6. CANCELAR (se status=created):
   POST https://api.mercadopago.com/v1/orders/{order_id}/cancel

7. REEMBOLSO (ate 90 dias):
   POST https://api.mercadopago.com/v1/orders/{order_id}/refund
```

[VERIFIED: mercadopago.com.ar/developers docs + codebase implementation]

**Nota importante sobre APIs MP Point:**

Existem DUAS APIs para MP Point:
- **Payment Intents API** (legada): `POST /point/integration-api/devices/{deviceId}/payment-intents` -- amount em CENTAVOS
- **Orders API v1** (atual): `POST /v1/orders` -- amount em REAIS (string decimal)

A implementacao atual no codebase usa **Orders API v1**, que e a API mais recente e recomendada pela MP. A Payment Intents API ainda funciona mas e a abordagem anterior. [VERIFIED: MP developers docs, July 2025 news]

---

### 2.2 Stone Connect (Pagar.me API v5)

**Status:** Nao implementado. Requer cadastro no programa de parceiros.

```
1. SETUP (uma vez):
   a. Cadastrar no Stone Partner Hub (https://stone.com.br/devcenter)
   b. Receber SK key (sk_xxx) e ServiceRefererName
   c. Obter serial number da maquininha do lojista (etiqueta "S/N" no verso)
   d. Vincular serial number no Pagar.me Dashboard

2. CRIAR PEDIDO (Direto -- valor vai automaticamente para a maquininha):
   POST https://api.pagar.me/core/v5/orders/
   Headers:
     Authorization: Basic {base64(sk_key + ":")}
     ServiceRefererName: {partner_id}
     Content-Type: application/json
   Body:
   {
     "customer": {
       "name": "Cliente",
       "email": "cliente@email.com"
     },
     "items": [{
       "amount": 15000,
       "description": "Venda #123",
       "quantity": 1,
       "code": "SALE123"
     }],
     "closed": false,
     "poi_payment_settings": {
       "visible": true,
       "display_name": "Venda #123",
       "print_order_receipt": false,
       "devices_serial_number": ["ABC123456789"],
       "payment_setup": {
         "type": "credit",
         "installments": 1,
         "installment_type": "merchant"
       }
     }
   }
   Response 200:
   {
     "id": "or_xxxxx",
     "code": "ORDERCODE",
     "amount": 15000,
     "status": "pending",
     "poi_payment_settings": { ... }
   }

3. TERMINAL RECEBE AUTOMATICAMENTE:
   - Pedido direto: maquininha entra automaticamente na tela de pagamento
   - Pedido listado (sem payment_setup): aparece na lista, operador seleciona

4. WEBHOOK (automatico):
   Events: "charge.paid", "charge.refunded"
   Payload inclui:
   - data.code (NSU)
   - metadata.schemeName (bandeira)
   - metadata.authorizationCode
   - metadata.terminalSerialNumber
   - metadata.installmentQuantity

5. POLLING:
   GET https://api.pagar.me/core/v5/orders/{order_id}
   - status: "pending" → "paid" | "canceled" | "failed"

6. FECHAR ORDER (obrigatorio apos webhook charge.paid):
   PATCH https://api.pagar.me/core/v5/orders/{order_id}/closed
   Body: { "status": "paid" }

7. CANCELAR:
   PATCH https://api.pagar.me/core/v5/orders/{order_id}/closed
   Body: { "status": "canceled" }

8. ESTORNO:
   DELETE https://api.pagar.me/core/v5/charges/{charge_id}
   - Suporta estorno parcial (campo amount)
```

**Nota: Amounts em CENTAVOS** (integer). R$150,00 = 15000.

[VERIFIED: connect-stone.stone.com.br official docs]

**Multi-tenant:**
- Cada lojista precisa de conta Pagar.me propria com SK key
- O SaaS (parceiro) gerencia multiplas contas via Merchant hierarchy
- Cada conta tem Stonecode + SK key + devices vinculados
- A SK key do lojista vai no `provider_config` do PDVTerminal

[VERIFIED: connect-stone.stone.com.br/reference/autenticacao]

---

### 2.3 Cielo LIO (Order Manager API v1)

**Status:** Nao implementado. Hardware LIO sendo descontinuado, migrado para "Cielo Smart".

```
1. SETUP:
   a. Cadastrar no portal Cielo Developers
   b. Criar aplicacao → receber Client-Id + Access-Token
   c. Para producao: solicitar Merchant-Id via formulario no portal
   d. Sandbox: https://api.cielo.com.br/sandbox-lio/order-management/v1
   e. Producao: https://api.cielo.com.br/order-management/v1

2. CRIAR ORDER:
   POST https://api.cielo.com.br/order-management/v1/orders
   Headers:
     Client-Id: {client_id}
     Access-Token: {access_token}
     Merchant-Id: {merchant_id}
     Content-Type: application/json
   Body:
   {
     "number": "unique-order-number",
     "reference": "Venda #123",
     "status": "DRAFT",
     "items": [{
       "sku": "PROD001",
       "name": "Produto",
       "unit_price": 15000,
       "quantity": 1,
       "unit_of_measure": "EACH"
     }],
     "price": 15000
   }
   Response 201:
   { "id": "2e1d7b07-dcee-4a09-8d09-3bb02d94169d" }

3. ENVIAR PARA TERMINAL (PLACE):
   PUT https://api.cielo.com.br/order-management/v1/orders/{id}?operation=PLACE
   Headers: (mesmos)
   - O pedido aparece na tela da Cielo LIO
   - Operador inicia o pagamento no terminal
   - Cliente insere cartao

4. WEBHOOK:
   - Cielo envia PUT para URL configurada quando status muda
   - Status flow: ENTERED → RE-ENTERED → PAID → CLOSED
   - Tambem notifica quando transacao e concluida

5. POLLING:
   GET https://api.cielo.com.br/order-management/v1/orders/{id}
   - Retorna status atual + lista de transactions

6. FECHAR:
   PUT https://api.cielo.com.br/order-management/v1/orders/{id}?operation=CLOSE
```

**Nota: Amounts em CENTAVOS** (integer). R$150,00 = 15000.

[VERIFIED: developercielo.github.io/en/manual/cielo-lio]

**ALERTA DE RISCO:** A Cielo LIO foi descontinuada do catalogo em janeiro 2023 e esta sendo substituida pela "Cielo Smart". Ha um deadline de **15/10/2025** para adaptar aplicacoes. Novos terminais sao "Cielo Smart" com nomenclatura atualizada. A API Order Manager continua funcionando mas pode ter mudancas na migracao. [VERIFIED: multiple sources including devcielo.zendesk.com]

---

### 2.4 PagSeguro (Moderninha Smart)

**Status:** SEM API cloud-to-terminal REST.

PagSeguro nao oferece uma API REST para enviar pagamentos remotamente para a maquininha. As opcoes de integracao sao:

1. **PlugPagServiceWrapper** -- SDK Android que roda DENTRO do terminal Moderninha Smart
2. **PlugPag Bluetooth** -- SDK para conectar via Bluetooth de um app Android/iOS
3. **Deep Links** -- Abrir app de pagamento via deep link (apenas local)

**Nenhuma dessas opcoes funciona para cloud-to-terminal** (enviar de um backend na nuvem). O PlugPag so funciona com comunicacao direta (Bluetooth ou local no terminal).

[VERIFIED: github.com/pagseguro repos, developer.pagbank.com.br]

**Recomendacao:** Manter PagSeguro como `ManualTerminalProvider` (confirmacao manual). Nao investir em integracao cloud.

---

## 3. Credenciais Necessarias por Provider

### Mercado Pago Point
| Campo | Onde obter | Armazenamento |
|-------|-----------|---------------|
| `access_token` | App MP Developers → Credenciais | `settings.MP_ACCESS_TOKEN` ou por tenant via OAuth |
| `mp_user_id` | Dashboard MP → Meus Dados | `Store.mp_user_id` |
| `mp_store_id` | Criado via API `/users/{id}/stores` | `Store.mp_store_id` |
| `mp_terminal_id` | Listado via API `/terminals/v1/list` | `PDVTerminal.mp_terminal_id` |
| `webhook_secret` | App MP Developers → Webhooks | `settings.MP_WEBHOOK_SECRET` |

**Para SaaS multi-tenant:** Usar MP OAuth para obter `access_token` por lojista. Cada lojista conecta sua conta MP via fluxo OAuth, e o token e armazenado na Store.

### Stone Connect
| Campo | Onde obter | Armazenamento sugerido |
|-------|-----------|----------------------|
| `sk_key` | Pagar.me Dashboard → Desenvolvimento → Chaves | `provider_config.sk_key` (encrypted) |
| `service_referer_name` | Stone Partner Hub (fixo por parceiro) | `settings.STONE_SERVICE_REFERER_NAME` |
| `stonecode` | Maquininha Stone → Configuracoes | `provider_config.stonecode` |
| `device_serial_number` | Etiqueta "S/N" no verso da maquininha | `provider_config.device_serial_number` |

**Para SaaS multi-tenant:** Cada lojista tem seu proprio `sk_key` (Pagar.me account). O `service_referer_name` e fixo do SaaS (parceiro). O lojista fornece stonecode + serial da maquininha.

### Cielo LIO
| Campo | Onde obter | Armazenamento sugerido |
|-------|-----------|----------------------|
| `client_id` | Portal Cielo Developers → App | `settings.CIELO_CLIENT_ID` (fixo por app) |
| `access_token` | Portal Cielo Developers → App | `settings.CIELO_ACCESS_TOKEN` (fixo por app) |
| `merchant_id` | Solicitar via formulario Cielo | `provider_config.merchant_id` (por lojista) |

---

## 4. Endpoints Mapeados (Referencia Rapida)

### Mercado Pago Point
| Acao | Metodo | URL | Amount Format |
|------|--------|-----|---------------|
| Listar terminais | GET | `/terminals/v1/list?store_id={id}` | -- |
| Ativar modo PDV | PATCH | `/terminals/v1/setup` | -- |
| Criar order | POST | `/v1/orders` | String decimal ("150.00") |
| Status order | GET | `/v1/orders/{order_id}` | -- |
| Cancelar order | POST | `/v1/orders/{order_id}/cancel` | -- |
| Reembolsar | POST | `/v1/orders/{order_id}/refund` | -- |

Base URL: `https://api.mercadopago.com`
Auth: `Authorization: Bearer {ACCESS_TOKEN}`

### Stone Connect
| Acao | Metodo | URL | Amount Format |
|------|--------|-----|---------------|
| Criar pedido | POST | `/core/v5/orders/` | Integer centavos (15000) |
| Consultar pedido | GET | `/core/v5/orders/{order_id}` | -- |
| Fechar pedido | PATCH | `/core/v5/orders/{order_id}/closed` | -- |
| Cancelar pedido | PATCH | `/core/v5/orders/{order_id}/closed` (status: canceled) | -- |
| Estorno charge | DELETE | `/core/v5/charges/{charge_id}` | Integer centavos |
| Imprimir comprovante | POST | `/posconnect/v1/orders/{order_id}/prints` | -- |

Base URL: `https://api.pagar.me`
Auth: `Authorization: Basic {base64(sk_key + ":")}`
Header extra: `ServiceRefererName: {partner_id}`

### Cielo LIO
| Acao | Metodo | URL | Amount Format |
|------|--------|-----|---------------|
| Criar order | POST | `/order-management/v1/orders` | Integer centavos (15000) |
| Consultar order | GET | `/order-management/v1/orders/{id}` | -- |
| Enviar ao terminal (PLACE) | PUT | `/order-management/v1/orders/{id}?operation=PLACE` | -- |
| Marcar pago (PAY) | PUT | `/order-management/v1/orders/{id}?operation=PAY` | -- |
| Fechar (CLOSE) | PUT | `/order-management/v1/orders/{id}?operation=CLOSE` | -- |

Base URL Sandbox: `https://api.cielo.com.br/sandbox-lio`
Base URL Prod: `https://api.cielo.com.br`
Auth: `Client-Id` + `Access-Token` + `Merchant-Id` (3 headers separados)

---

## 5. Arquitetura Recomendada para o Backend Python

### 5.1 Estrutura de arquivos (ja existente, expandir)

```
backend/app/services/payment_providers/
  __init__.py
  base.py               # BaseTerminalProvider (ABC) -- JA EXISTE
  factory.py             # get_terminal_provider()   -- JA EXISTE, expandir
  mercadopago.py         # MercadoPagoTerminalProvider -- JA EXISTE
  manual.py              # ManualTerminalProvider     -- JA EXISTE
  stone.py               # StoneConnectProvider       -- CRIAR
  cielo.py               # CieloLIOProvider           -- CRIAR (baixa prioridade)
```

### 5.2 Credenciais por tenant/terminal

O modelo `PDVTerminal` ja tem `provider_config: dict (JSON)`. Usar assim:

```python
# Mercado Pago (ja implementado):
# Credenciais centrais: settings.MP_ACCESS_TOKEN
# Ou por tenant via OAuth: Store.mp_access_token
# Terminal: PDVTerminal.mp_terminal_id

# Stone Connect:
# provider_config = {
#     "sk_key": "sk_live_xxxxxxx",     # Secret key do lojista (ENCRYPT!)
#     "stonecode": "123456789",          # Stonecode do estabelecimento
#     "device_serial_number": "ABC123",  # Serial da maquininha
# }

# Cielo LIO:
# provider_config = {
#     "merchant_id": "xxxxx",            # ID do estabelecimento na Cielo
# }
# Client-Id e Access-Token sao fixos do app (settings)
```

**IMPORTANTE sobre seguranca:** As `sk_key` da Stone sao credenciais sensiveis. O campo `provider_config` e JSON plano no banco. Para producao, considerar:
- Encriptar campos sensiveis com Fernet/AES antes de salvar
- Ou usar variavel de ambiente por tenant (nao escala para SaaS)
- Ou usar secrets manager (AWS Secrets Manager, HashiCorp Vault)

[ASSUMED: a decisao de como encriptar depende da infraestrutura do cliente]

### 5.3 Implementacao do StoneConnectProvider

```python
class StoneConnectProvider(BaseTerminalProvider):
    """Provider Stone Connect via Pagar.me API v5."""

    provider_name = "stone"

    STONE_BASE_URL = "https://api.pagar.me"

    def _get_headers(self, terminal: PDVTerminal) -> dict:
        """Monta headers com credenciais do terminal."""
        sk_key = terminal.provider_config.get("sk_key", "")
        encoded = base64.b64encode(f"{sk_key}:".encode()).decode()
        return {
            "Authorization": f"Basic {encoded}",
            "ServiceRefererName": settings.STONE_SERVICE_REFERER_NAME,
            "Content-Type": "application/json",
        }

    async def create_payment(self, db, tenant_id, sale_id, terminal_id,
                             total_amount, payment_type, installments,
                             description, expiration_time, installments_cost=None):
        terminal = await self._get_terminal(db, terminal_id, tenant_id)
        serial = terminal.provider_config.get("device_serial_number")
        if not serial:
            raise ValueError("Serial number da maquininha nao configurado.")

        # Stone usa centavos
        amount_cents = int(round(total_amount * 100))

        body = {
            "customer": {"name": "Cliente", "email": "venda@loja.com"},
            "items": [{
                "amount": amount_cents,
                "description": description or "Venda",
                "quantity": 1,
                "code": f"SALE{sale_id}",
            }],
            "closed": False,
            "poi_payment_settings": {
                "visible": True,
                "display_name": description or f"Venda #{sale_id}",
                "print_order_receipt": False,
                "devices_serial_number": [serial],
                "payment_setup": {
                    "type": "credit" if payment_type == "credit_card" else "debit",
                    "installments": installments or 1,
                    "installment_type": "merchant",
                },
            },
        }

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{self.STONE_BASE_URL}/core/v5/orders/",
                json=body,
                headers=self._get_headers(terminal),
            )

        if resp.status_code not in (200, 201):
            raise ValueError(f"Erro ao criar pedido Stone: {resp.text}")

        data = resp.json()
        order_id = data["id"]

        # Salvar referencia na Sale
        await db.execute(
            update(Sale).where(Sale.id == sale_id)
            .values(payment_reference=order_id, status=SaleStatus.PENDING)
        )
        await db.commit()

        return {
            "sale_id": sale_id,
            "terminal_id": terminal_id,
            "order_id": order_id,
            "status": "pending",
            "message": "Pedido enviado a maquininha Stone.",
        }
```

### 5.4 Polling vs Webhook

| Metodo | Vantagem | Desvantagem | Quando usar |
|--------|----------|-------------|-------------|
| **Polling** | Simples, sem infra extra | Delay, rate limits | MVP, dev/teste |
| **Webhook** | Real-time, eficiente | Requer URL publica, retry logic | Producao |
| **SSE** | Real-time para frontend | Conexao mantida aberta | Ja implementado para PIX |

**Recomendacao:**
1. **MVP:** Polling a cada 3s (igual ao PIX atual) -- ja tem infraestrutura
2. **Producao:** Webhook + SSE para frontend -- webhook recebe do provider, atualiza DB, SSE notifica mobile
3. O sistema atual ja tem `payment_events.py` com `signal_payment()` que funciona com SSE -- reutilizar

### 5.5 Tratamento de timeout e cancelamento automatico

```python
# Na criacao do payment, salvar timestamp de expiracao
# MP: expiration_time default "PT15M" (15 minutos)
# Stone: nao tem expiracao automatica -- precisa cancelar manualmente

# Scheduler (ja existe em scheduler.py) pode rodar a cada minuto:
async def cleanup_stale_payments():
    """Cancela pagamentos pendentes ha mais de 20 minutos."""
    cutoff = datetime.utcnow() - timedelta(minutes=20)
    stale_sales = await db.execute(
        select(Sale).where(
            Sale.status == SaleStatus.PENDING,
            Sale.updated_at < cutoff,
        )
    )
    for sale in stale_sales.scalars():
        provider = get_terminal_provider(sale.terminal.provider)
        try:
            await provider.cancel_payment(db, sale.id, sale.tenant_id)
        except Exception:
            pass  # Log and continue
```

---

## 6. Recomendacao de Implementacao

### Ordem de prioridade

| # | Provider | Razao | Esforco |
|---|----------|-------|---------|
| 1 | **Mercado Pago Point** | Ja implementado, testar e validar | Baixo (testes) |
| 2 | **Stone Connect** | Maior base instalada no Brasil, API limpa | Medio (nova classe + onboarding parceiro) |
| 3 | **Cielo LIO** | Hardware em transicao, deadline 10/2025 | Medio-alto (incerteza sobre futuro) |
| 4 | **PagSeguro** | Sem API cloud, manter manual | Zero (ja funciona como manual) |

### O que e realista para um SaaS

1. **Mercado Pago Point** e a opcao mais acessivel:
   - Nao requer programa de parceiros
   - Tem OAuth para multi-tenant
   - Maquininhas baratas (Point Mini, Point Pro)
   - Implementacao ja existe no codebase

2. **Stone Connect** e a mais profissional:
   - Requer cadastro no programa de parceiros (burocracia)
   - Precisa de homologacao (enviar roteiro de testes)
   - Cada lojista precisa de conta Pagar.me (mais setup)
   - MAS: Stone e a adquirente mais usada por lojas fisicas no Brasil

3. **Cielo LIO** tem risco alto:
   - Hardware descontinuado (LIO → Cielo Smart)
   - Deadline de adaptacao em 10/2025
   - API pode mudar na migracao para Cielo Smart
   - Investir esforco aqui tem risco de desperdicio

4. **Para os outros providers** (Rede, GetNet, SumUp):
   - Nenhum tem API cloud-to-terminal publica viavel
   - Manter todos como `ManualTerminalProvider`
   - Rede usa TEF local (ActiveX/DLL), GetNet nao tem TEF cloud, SumUp e focado em micro-empreendedores

---

## 7. Riscos e Limitacoes

### 7.1 Mercado Pago Point
- **Risco:** Token OAuth pode expirar -- precisa de refresh flow [VERIFIED: implementacao atual usa token fixo]
- **Limitacao:** Modo PDV precisa ser ativado manualmente pelo lojista na primeira vez
- **Limitacao:** Cancelar order so funciona se status="created" (antes de chegar no terminal)
- **Terminal compativel:** Point Mini, Point Pro, Point Pro 2, Point Smart (todos suportam modo PDV)
- **Incompativel:** Maquininhas antigas (Point Mini NFC 1a geracao sem modo PDV)

### 7.2 Stone Connect
- **Risco ALTO:** Programa de parceiros e obrigatorio -- sem cadastro, sem credenciais
- **Risco:** Homologacao pode levar semanas/meses
- **Risco:** Cada lojista precisa de conta Pagar.me propria com SK key -- onboarding mais complexo
- **Limitacao:** `installment_type` so aceita "merchant" (lojista paga juros)
- **Limitacao:** Sem sandbox com terminal fisico real -- testes sao via dashboard com simulador
- **Terminal compativel:** Todos os POS Stone integrados (S920, D210, D195, etc)

### 7.3 Cielo LIO
- **Risco CRITICO:** Hardware descontinuado, migracao para Cielo Smart em andamento
- **Risco:** Deadline 15/10/2025 para adaptar apps
- **Limitacao:** API nao permite especificar tipo de pagamento (credito/debito) -- operador escolhe no terminal
- **Limitacao:** Nao tem cancelamento remoto apos PLACE -- so no terminal
- **Terminal compativel:** Cielo LIO V2, Cielo LIO On, Cielo Smart (com adaptacoes)

### 7.4 Geral
- **Desafio SaaS multi-tenant:** Cada provider tem modelo diferente de credenciais por lojista
- **Desafio webhook:** Cada provider tem formato de webhook diferente -- precisa de endpoints separados
- **Desafio offline:** Se a internet cair, a maquininha nao recebe o pedido -- precisa de fallback manual
- **Compliance PCI:** O backend nunca toca em dados de cartao (tokenizacao e no terminal)

---

## 8. Diferencas entre Payment Intents API e Orders API (Mercado Pago)

O codebase atual usa **Orders API v1** (`POST /v1/orders`), que e a API mais recente. Vale documentar as diferencas pois a documentacao MP ainda mostra ambas:

| Aspecto | Payment Intents API (legada) | Orders API v1 (atual) |
|---------|-----------------------------|-----------------------|
| Endpoint | `/point/integration-api/devices/{deviceId}/payment-intents` | `/v1/orders` |
| Amount | Centavos (integer) | Reais (string decimal "150.00") |
| Terminal ID | No path URL (`deviceId`) | No body (`config.point.terminal_id`) |
| Cancelar | `DELETE /point/integration-api/devices/{deviceId}/payment-intents/{id}` | `POST /v1/orders/{id}/cancel` |
| Status | `GET /point/integration-api/payment-intents/{id}` | `GET /v1/orders/{id}` |
| Reembolso | Separado via payments API | `POST /v1/orders/{id}/refund` (integrado) |
| Idempotencia | Nao documentada | `X-Idempotency-Key` header |

**Recomendacao:** Continuar com Orders API v1. Nao migrar para Payment Intents.

[VERIFIED: mercadopago.com.ar/developers, news July 2025]

---

## 9. Factory -- Como Expandir

O `factory.py` atual roteia todos os providers que nao sao "mercadopago" para `ManualTerminalProvider`. Para adicionar Stone:

```python
# factory.py -- adicionar:
def _get_terminal_class(provider: str) -> Type[BaseTerminalProvider]:
    if provider == "mercadopago":
        from .mercadopago import MercadoPagoTerminalProvider
        return MercadoPagoTerminalProvider
    elif provider == "stone":
        from .stone import StoneConnectProvider
        return StoneConnectProvider
    elif provider == "cielo":
        from .cielo import CieloLIOProvider
        return CieloLIOProvider
    else:
        from .manual import ManualTerminalProvider
        return ManualTerminalProvider
```

A `BaseTerminalProvider` ja define a interface completa que Stone e Cielo precisam implementar.

---

## 10. Configuracao de Webhook por Provider

### Mercado Pago
- Ja tem endpoint: `POST /api/v1/pdv/webhooks/mercadopago`
- Configurar URL no dashboard MP Developers
- Selecionar evento "Order (Mercado Pago)"

### Stone Connect
- Precisa de novo endpoint: `POST /api/v1/pdv/webhooks/stone`
- Webhooks configurados automaticamente na ativacao da conta Pagar.me
- Ou configurar manualmente no Pagar.me Dashboard → Webhooks
- Eventos: `charge.paid`, `charge.refunded`
- Apos receber `charge.paid`, **obrigatorio** fechar order: `PATCH /orders/{id}/closed`

### Cielo LIO
- Precisa de novo endpoint: `POST /api/v1/pdv/webhooks/cielo`
- Solicitar configuracao da URL via portal Cielo Developers
- Recebe PUT com notificacao de mudanca de status

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Tempo de resposta das APIs < 2s | Comparativo | Baixo -- pode ser medido em teste |
| A2 | Stone Partner Hub aceita SaaS pequenos | Riscos Stone | ALTO -- se rejeitarem, Stone nao funciona |
| A3 | Cielo Smart mantem mesma API Order Manager | Riscos Cielo | MEDIO -- pode precisar de nova implementacao |
| A4 | Encriptacao de sk_key com Fernet e suficiente | Arquitetura | MEDIO -- depende de requisitos de compliance |

---

## Open Questions

1. **Stone Partner Hub -- aceita SaaS em estagio inicial?**
   - O que sabemos: precisa de cadastro no programa de parceiros
   - O que falta: saber se aceitam SaaS pequenos ou exigem volume minimo
   - Recomendacao: entrar em contato com Stone comercial antes de implementar

2. **Cielo Smart -- mesma API que LIO?**
   - O que sabemos: nomenclatura mudou, deadline em 10/2025
   - O que falta: confirmar se API Order Manager funciona identico na Cielo Smart
   - Recomendacao: acessar portal Cielo e verificar documentacao Cielo Smart

3. **Mercado Pago Point -- testar implementacao existente**
   - O que sabemos: implementacao existe no codebase mas nao foi testada
   - O que falta: validar com maquininha real em modo sandbox
   - Recomendacao: prioridade 1, testar antes de implementar novos providers

---

## Sources

### Primary (HIGH confidence)
- [Mercado Pago Developers - Point Orders API](https://www.mercadopago.com.ar/developers/en/reference/in-person-payments/point/orders/create-order/post) -- create order, response format
- [Mercado Pago Point Payment Processing](https://www.mercadopago.com.mx/developers/en/docs/mp-point/payment-processing) -- full flow documentation
- [Mercado Pago Point Payment Intents Reference](https://www.mercadopago.com.br/developers/en/reference/integrations_api/_point_integration-api_payment-intents_paymentintentid/get) -- legacy API reference
- [Stone Connect - Criar Pedido](https://connect-stone.stone.com.br/reference/criar-pedido) -- order creation
- [Stone Connect - Visao Geral](https://connect-stone.stone.com.br/reference/vis%C3%A3o-geral) -- API reference
- [Stone Connect - Autenticacao](https://connect-stone.stone.com.br/reference/autentica%C3%A7%C3%A3o) -- auth details
- [Stone Connect - Pedido Direto](https://connect-stone.stone.com.br/reference/pedido-direto) -- direct vs listed orders
- [Stone Connect - Recebendo Pagamento](https://connect-stone.stone.com.br/reference/recebendo-um-pagamento) -- webhook events
- [Cielo LIO Integration Manual](https://developercielo.github.io/en/manual/cielo-lio) -- full API documentation
- [Cielo LIO Java Client (OSS)](https://cielo-lio-remote-client.frekele.org/) -- endpoint reference

### Secondary (MEDIUM confidence)
- [Mercado Pago News July 2025](https://www.mercadopago.cl/developers/en/news/2025/07/16/Transform-your-point-of-sale-with-the-new-integration-between-Point-and-the-Orders-API) -- Orders API announcement
- [PagSeguro PlugPag SDK](https://github.com/pagseguro/pagseguro-sdk-plugpagservicewrapper) -- confirms no cloud REST API
- [Stone Connect v2](https://connect-v2.stone.com.br/docs) -- newer version (403 on access)
- [Stone Connect - Operacoes](https://connect-stone.stone.com.br/docs/opera%C3%A7%C3%B5es) -- operations list

### Tertiary (LOW confidence)
- [Cielo LIO descontinuada](https://www.idinheiro.com.br/negocios/cielo-lio/) -- hardware discontinuation
- [Stone serial number guide](https://sisop.com.br/como-obter-o-serial-number-da-minha-maquininha-stone/) -- how to find serial

---

## Metadata

**Confidence breakdown:**
- Mercado Pago Point: HIGH -- verificado contra docs oficiais + codebase existente
- Stone Connect: MEDIUM-HIGH -- verificado contra docs oficiais, nao testado
- Cielo LIO: MEDIUM -- verificado contra docs, hardware em transicao
- PagSeguro: HIGH (negativo) -- confirmado que NAO tem API cloud
- Arquitetura recomendada: HIGH -- baseada em padrao existente no codebase

**Research date:** 2026-04-22
**Valid until:** 2026-05-22 (30 dias -- APIs de pagamento sao estaveis)
