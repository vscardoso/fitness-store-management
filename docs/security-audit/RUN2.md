# Auditoria — segunda rodada (28/10/2026)
Fonte unica: 2 agentes (revisao das correcoes + lacunas), SOMENTE leitura de codigo. Achados NAO passaram por verificador independente (status: candidatos fortes, nao "confirmados").

## Revisao do commit 38619c0 (5 altos): nenhum bypass. Residuais
- ?token= dos webhooks Stone/Cielo vaza no access_log do nginx/fail2ban -> aceitar so header X-Webhook-Token ou mascarar no log.
- state OAuth MP reutilizavel por 10 min (sem jti de uso unico; uid nao conferido no callback).
- /admin: authenticate nao rechecka is_active/role no banco (sessao 1h).
- MP topico order: HMAC nao cobre o corpo e ts sem limite de idade; _confirm/_cancel/_refund_sale sem tenant.
- UPDATEs por Sale.id sem tenant (hoje nao explorados): cielo.py:327,348; stone.py:279,339,412; mercadopago.py:380,428,469; cielo_pix.py:221,484; mock_pix.py:157,195.

## Novos candidatos
ALTA: (1) /notifications/send envia push cross-tenant (notification_repository.get_tokens_by_users sem tenant); (2) /products/fifo-costs le custo FIFO de outro tenant (products.py:1228, fifo_service.py:343).
MEDIA: (3) category_id cross-tenant em product_service.py:83/333, products.py:39/76 (+cache global), ai_scan_service.py:425/629; (4) /notifications/test/* dispara para todos os tenants (ADMIN de qualquer loja); (5) despesas: category_id sem validar tenant (expense_service.py:127,174-185; repositories/expense.py sum_by_category).
BAIXA: (6) is_active em ProductUpdate/TripUpdate contorna DELETE de ADMIN; (7) CustomerUpdate.is_active (SELLER); (8) GET /products/{id} le soft-deleted; (9) invalidate_dashboard_cache por substring (tenant 1 apaga 10/12).

Cobertos sem achados: dashboard.py (queries e chaves de cache com tenant), reports, customer_privacy_service (LGPD), audit, store, payment_discounts, trips, matriz de permissoes e cost_mask.
