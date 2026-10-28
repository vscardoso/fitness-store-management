# Auditoria de segurança — Provador Fit (fitness-store-management)

**Perfil:** quick (cobertura PARCIAL) · **Commit:** 8699ddd (worktree sujo: sale_service, return_service, conditional_shipment, stock_lock) · **Execução:** somente leitura de código (Windows sem sandbox; nada do alvo foi executado) · **Run:** incomplete — o crítico de cobertura pós-onda NÃO rodou (economia de tokens pedida pelo usuário); sem afirmação de cobertura completa. Sem execuções anteriores.
**Agentes:** 4 reconhecimento + 8 caçadores + 21 verificadores independentes (1 por candidato). Desvio do método: os blocos de ataque foram lidos de disco pelos agentes (não colados no prompt).
Arquivos: `findings.json` (21 registros, validado), `coverage-ledger.json` (8 unidades, validado), `architecture.md`.

## Postura
Isolamento entre tenants depende só de filtros no código (RLS_ENABLED=False por padrão e sem ativação no deploy). Vários caminhos sem filtro, webhooks de pagamento sem autenticação e painel /admin aberto a qualquer dono de loja (signup público = ADMIN). **19 confirmados (5 altos, 6 médios, 8 baixos), 1 needs_validation, 1 rejeitado.** Evidência de todos é de código (“Source-established”), não de execução.

## Confirmados
| Sev | Achado | Fingerprint |
|---|---|---|
| ALTA | Webhooks Stone/Cielo/Cielo PIX sem auth marcam venda de qualquer tenant como COMPLETED | pdv-webhooks:stone-cielo-cielopix-unauthenticated-sale-completion-cross-tenant |
| ALTA | Webhook Mercado Pago fail-open (MP_WEBHOOK_SECRET não é passado no compose de prod); tópicos order/point_integration_wh confiam no corpo | pdv-webhooks:mercadopago-signature-fail-open-and-unverified-order-topics |
| ALTA | Callback OAuth do MP usa `state`=tenant_id sem assinatura e sobrescreve o token de pagamento de qualquer tenant | oauth/mp-connect-callback-unsigned-state-tenant-token-overwrite |
| ALTA | /admin (SQLAdmin) aceita qualquer ADMIN de tenant; lê/edita/apaga dados de todos os tenants (inclui mp_access_token) | admin-panel/any-tenant-admin-cross-tenant-access |
| ALTA | POST /pdv/orders atualiza venda de outro tenant (UPDATE sem tenant); job de vendas pendentes cancela e reverte estoque | pdv-orders-create-payment-unscoped-sale-update |
| MÉDIA | Webhook legado do WhatsApp sem token no deploy; consulta produtos/clientes de todos os tenants | webhook/baileys-whatsapp-failopen-auth-crosstenant-queries |
| MÉDIA | Config de impressora (ip/porta/usb/serial) sem validação: SSRF + truncar/sobrescrever arquivos do servidor (rebaixada de alta p/ média: severidade ≤ impacto) | printer-config-unvalidated-socket-file-serial-sinks |
| MÉDIA | POST /sales aceita customer_id/product_id de outro tenant e devolve nome/dados | sale-create-unvalidated-foreign-ids |
| MÉDIA | Wishlist aceita ids de outro tenant e devolve nome do cliente | tenant-authz/wishlist-unscoped-refs |
| MÉDIA | Reorder de mídia e variant_id sem escopo: escrita cross-tenant (image_url de variação alheia) | tenant-authz/product-media-unscoped-ids |
| MÉDIA | Sugestões/tags sem tenant: leitura, delete e produtos de outros tenants | tenant-authz/suggestions-unscoped |
| BAIXA | Refresh JWT do signup aceito como bearer por 7 dias, sem revogação | jwt/refresh-jwt-accepted-as-access-bearer-unrevocable |
| BAIXA | Preview/impressão de etiqueta lê produto/variação de outro tenant | print-job-variant-product-lookup-missing-tenant-filter |
| BAIXA | Reembolso ignora desconto do item; preço de troca vem do cliente | return-refund-exceeds-paid-and-client-exchange-price |
| BAIXA | Desconto > subtotal gera total negativo e venda COMPLETED sem pagamento | sale-unbounded-discount-negative-total-zero-payment |
| BAIXA | Looks aceitam produto/variação de outro tenant (nome, imagem, preço) | tenant-authz/looks-unscoped-product-refs |
| BAIXA | SSE de pagamento com registro global sem tenant (vaza status, interfere em outro tenant) | tenant-authz/pdv-sse-global-event-registry |
| BAIXA | Ordem das regras de permissão deixa CASHIER ler fornecedores do produto | tenant-authz/matrix-shadow-product-suppliers |
| BAIXA | GET /categories/{id} anônimo lê categoria de qualquer tenant | tenant-authz/category-public-unscoped-by-id |

Detalhes (trace, evidência, condições, reprodução local segura, correção mínima e teste de regressão) de cada um estão em `findings.json`. Condições comuns: RLS desligado; ids sequenciais; signup público dá ADMIN de um tenant novo.

## NEEDS VALIDATION (sem severidade)
- **ci/backup-database-plaintext-artifact** — `.github/workflows/backup-database.yml` sobe pg_dump em texto puro como artifact (30 dias). Bloqueios: visibilidade do repo, se o secret DATABASE_BACKUP_URL existe e para qual banco aponta (README cita Neon legado), se o workflow está ativo. Checar no GitHub (Settings/Actions); se houver dados reais: apagar artifacts, rotacionar credenciais e criptografar com age antes do upload.

## Rejeitado
- sale-response-cost-margin-exposed-to-cashier: CostMaskMiddleware anula campos de custo/lucro/margem para cashier/seller.

## Hardening (não são achados)
Deploy como root executando scripts de `origin/main` sem proteção de branch visível; ssh-keyscan TOFU; actions sem pin de SHA e sem `permissions:`; scans com `|| true`; dependências antigas (fastapi 0.100.1/starlette, python-multipart 0.0.6, python-jose 3.3.0 — alcance não rastreado); tokens em AsyncStorage; `remotePatterns: **` no Next (proxy de imagem aberto); sem CSP/HSTS no web; TrustedHost `*`; nginx-api.conf antigo com XFF anexável; /send do bot sem auth obrigatória; logout no-op e sessão sem teto (SESSION_MAX_HOURS=0); trial/assinatura nunca aplicados (expirado mantém acesso); uploads lidos inteiros antes do limite de tamanho; DEBUG_LOG.txt já commitado no histórico (conferir conteúdo); smoke_test.py cria dados reais em produção; mobile/eas.json aponta ao Render legado; MP: HMAC cobre só id/request-id/ts.
Positivos: image_guard re-codifica uploads; ZPL com safe_text; WhatsApp Cloud com HMAC fail-closed; SQL com bind params; locks advisory consistentes; deploy fork-safe (sem pull_request_target).

## Cobertura (ledger)
8 unidades: 7 `candidate` (com achados), 1 `covered` (mobile/web/CORS, sem achados). Lacunas: crítico de cobertura não rodou; não revistos linha a linha: `dashboard.py`/cache, ai.py, store.py, payment_discounts.py, expenses.py, products.py (imagem/barcode); acesso a registros soft-deleted; deep links do mobile só superficial. Execução de código/testes proibida (sem sandbox): reproduções acima são planos para rodar localmente com dados fictícios.
