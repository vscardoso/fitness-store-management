# PDV Expert

Você está no modo **PDV expert** do projeto fitness-store-management.

## Contexto

Módulo de Ponto de Venda com suporte a:
- Pagamento local (dinheiro/crédito/débito/PIX manual)
- TEF (Terminal Eletrônico de Fundos): Stone Connect + Cielo LIO
- PIX via Mercado Pago (provider configurável)
- Confirmação manual para maquininhas sem integração

## Arquitetura do módulo

### Backend
```
backend/app/api/v1/endpoints/pdv.py          # endpoints TEF, terminais, PIX
backend/app/services/pdv_service.py          # lógica de pagamento
backend/app/models/pdv_terminal.py           # PDVTerminal
backend/app/models/pix_transaction.py        # PixTransaction (auditoria + idempotência)
```

### Mobile
```
mobile/app/(tabs)/pdv/                       # telas PDV
mobile/services/pdvService.ts                # cliente HTTP do PDV
```

## Modelos chave

**PDVTerminal**: provider (stone/cielo/rede/mock), store_id, terminal_id, credentials_encrypted, is_active, last_seen_at

**PixTransaction**: sale_id, provider (mercadopago/bradesco/mock), external_id, status (PENDING/PAID/FAILED/EXPIRED/CANCELLED), amount, qr_code, expires_at

## Providers disponíveis

| Provider | Tipo | Status |
|----------|------|--------|
| `mock` | Dev local sem credenciais | Sempre aprova |
| `mercadopago` | PIX | Integrado |
| `stone` | Maquininha (TEF) | Integrado (Stone Connect) |
| `cielo` | Maquininha (TEF) | Integrado (Cielo LIO) |
| `manual` | Confirmação manual | Sempre disponível |

## Configuração no .env

```env
PIX_PROVIDER=mock            # mock | mercadopago | bradesco
MP_ACCESS_TOKEN=             # TEST-... (teste) ou APP_USR-... (live)
MP_WEBHOOK_SECRET=
```

## Fluxo de venda TEF

1. Cliente seleciona produtos → carrinho
2. Escolhe forma de pagamento
3. Se maquininha: selecionar terminal ativo
4. Backend inicia transação no provider
5. Terminal físico processa
6. Webhook confirma → Sale status atualiza
7. Recibo gerado

## Fluxo PIX

1. Backend cria cobrança no MP → retorna `qr_code` + `expires_at`
2. Mobile exibe QR Code
3. Polling ou webhook confirma pagamento
4. `PixTransaction.status` = PAID → Sale finaliza

## Pendentes / cancelamento

- Vendas PENDING ficam na tela de pagamentos pendentes
- Terminal PENDING auto-cancela após 30min
- Cancelamento manual disponível para vendas locais

## Endpoints principais

```
POST /api/v1/pdv/sale                    # criar venda
POST /api/v1/pdv/sale/{id}/pay-pix       # iniciar PIX
POST /api/v1/pdv/sale/{id}/pay-terminal  # iniciar TEF
POST /api/v1/pdv/sale/{id}/confirm       # confirmação manual
GET  /api/v1/pdv/pending-sales           # vendas pendentes
GET  /api/v1/pdv/terminals               # terminais ativos
POST /api/v1/pdv/terminals               # cadastrar terminal
DELETE /api/v1/pdv/terminals/{id}        # desativar terminal
POST /api/v1/pdv/mp/webhook              # webhook Mercado Pago
```

## MP OAuth (multi-tenant)

Cada loja conecta sua própria conta Mercado Pago via OAuth:
```
GET  /api/v1/mp/connect          # inicia OAuth flow
GET  /api/v1/mp/callback         # callback OAuth
GET  /api/v1/mp/status           # status da conexão
DELETE /api/v1/mp/disconnect     # desconectar conta
```

---

Pronto para implementar ou debugar o módulo PDV.
