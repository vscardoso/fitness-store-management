# Exemplos de Resposta - Notificações Periódicas

## Exemplo 1: Sucesso Total (com envios pendentes e atrasados)

```json
{
  "pending_notifications": {
    "total_tenants": 2,
    "total_shipments": 5,
    "sent_count": 2,
    "failed_count": 0,
    "errors": []
  },
  "overdue_notifications": {
    "total_tenants": 1,
    "total_shipments": 3,
    "sent_count": 1,
    "failed_count": 0,
    "errors": []
  },
  "summary": {
    "total_notifications_sent": 3,
    "total_notifications_failed": 0,
    "total_errors": 0,
    "success": true,
    "timestamp": "2025-12-08T14:30:00.123456"
  }
}
```

**Interpretação:**
- 2 tenants têm 5 envios pendentes (receberam lembrete)
- 1 tenant tem 3 envios atrasados (recebeu alerta crítico)
- Todas as notificações foram enviadas com sucesso

---

## Exemplo 2: Sem Envios para Notificar

```json
{
  "pending_notifications": {
    "total_tenants": 0,
    "total_shipments": 0,
    "sent_count": 0,
    "failed_count": 0,
    "errors": []
  },
  "overdue_notifications": {
    "total_tenants": 0,
    "total_shipments": 0,
    "sent_count": 0,
    "failed_count": 0,
    "errors": []
  },
  "summary": {
    "total_notifications_sent": 0,
    "total_notifications_failed": 0,
    "total_errors": 0,
    "success": true,
    "timestamp": "2025-12-08T09:00:00.000000"
  }
}
```

**Interpretação:**
- Nenhum envio pendente ou atrasado
- Endpoint retorna sucesso mesmo sem enviar notificações
- É seguro rodar periodicamente mesmo sem dados

---

## Exemplo 3: Falhas Parciais (usuários sem token)

```json
{
  "pending_notifications": {
    "total_tenants": 3,
    "total_shipments": 8,
    "sent_count": 2,
    "failed_count": 1,
    "errors": [
      "Tenant 3: Nenhum usuário encontrado"
    ]
  },
  "overdue_notifications": {
    "total_tenants": 2,
    "total_shipments": 4,
    "sent_count": 1,
    "failed_count": 1,
    "errors": [
      "Tenant 5: Nenhum token encontrado"
    ]
  },
  "summary": {
    "total_notifications_sent": 3,
    "total_notifications_failed": 2,
    "total_errors": 2,
    "success": false,
    "timestamp": "2025-12-08T14:30:00.123456"
  }
}
```

**Interpretação:**
- 3 notificações enviadas com sucesso
- 2 falharam (1 sem usuário, 1 sem token registrado)
- `summary.success = false` indica falhas parciais
- Ação: Verificar por que tenants 3 e 5 não têm usuários/tokens

---

## Exemplo 4: Erro HTTP 403 (Usuário não é ADMIN)

```json
{
  "detail": "Apenas administradores podem enviar notificações periódicas"
}
```

**HTTP Status:** `403 Forbidden`

**Causa:** Usuário autenticado não tem `role=ADMIN`

**Solução:** Usar token de um usuário ADMIN

---

## Exemplo 5: Erro HTTP 401 (Token Inválido)

```json
{
  "detail": "Could not validate credentials"
}
```

**HTTP Status:** `401 Unauthorized`

**Causa:** Token JWT ausente, expirado ou inválido

**Solução:** Fazer login novamente e obter novo token

---

## Notificações no Mobile - Formato Recebido

### 1. Notificação de Envios Pendentes

```typescript
// Push notification recebida no app mobile
{
  to: "ExponentPushToken[xxxxxxxxxxxxxx]",
  title: "📦 3 Envio(s) Pendente(s)",
  body: "Total: 3 envio(s) aguardando processamento\n• João Silva, Maria Santos, Pedro Oliveira",
  data: {
    type: "pending_shipments_reminder",
    total_shipments: 3,
    route: "/conditional",
    priority: "normal"
  },
  sound: "default"
}
```

**Ação ao clicar:** Navega para `/conditional` (lista de envios)

---

### 2. Notificação de Envios Atrasados

```typescript
// Push notification recebida no app mobile
{
  to: "ExponentPushToken[xxxxxxxxxxxxxx]",
  title: "🚨 2 Envio(s) Atrasado(s)!",
  body: "⚠️ URGENTE: 2 envio(s) com prazo vencido!\n\nClientes:\n• João Silva (3d atrasado)\n• Maria Santos (1d atrasado)",
  data: {
    type: "overdue_shipments_alert",
    total_shipments: 2,
    customers: [15, 23],
    route: "/conditional?filter=overdue",
    priority: "critical"
  },
  sound: "default"
}
```

**Ação ao clicar:** Navega para `/conditional?filter=overdue` (só atrasados)

---

## Log de Notificação no Banco de Dados

### Tabela: `notification_logs`

```sql
SELECT * FROM notification_logs WHERE title LIKE '%Envio%' ORDER BY sent_at DESC LIMIT 5;
```

**Resultado:**

| id | tenant_id | user_id | title | body | success | error_message | sent_at |
|----|-----------|---------|-------|------|---------|---------------|---------|
| 45 | 1 | 2 | 🚨 2 Envio(s) Atrasado(s)! | ⚠️ URGENTE: 2 envio(s)... | true | NULL | 2025-12-08 14:30:00 |
| 44 | 1 | 2 | 📦 3 Envio(s) Pendente(s) | Total: 3 envio(s)... | true | NULL | 2025-12-08 14:30:00 |
| 43 | 2 | 5 | 📦 2 Envio(s) Pendente(s) | Total: 2 envio(s)... | false | DeviceNotRegistered | 2025-12-08 14:30:00 |

---

## Cenários de Teste

### Teste 1: Criar Envio Pendente e Verificar Notificação

```bash
# 1. Criar envio condicional
curl -X POST http://localhost:8000/api/v1/conditional-shipments \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": 1,
    "items": [{"product_id": 10, "quantity_sent": 2, "unit_price": 89.90}],
    "shipping_address": "Rua Teste, 123"
  }'

# 2. Aguardar alguns segundos

# 3. Enviar notificação periódica
curl -X POST http://localhost:8000/api/v1/conditional-shipments/notifications/send-periodic \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Resultado esperado: pending_notifications.total_shipments >= 1
```

---

### Teste 2: Criar Envio Atrasado e Verificar Alerta

```bash
# 1. Criar envio e marcar como enviado com deadline no passado (via SQL)
sqlite3 fitness_store.db <<EOF
INSERT INTO conditional_shipments (tenant_id, customer_id, status, deadline, shipping_address, is_active, created_at, updated_at)
VALUES (1, 1, 'SENT', datetime('now', '-2 days'), 'Rua Teste, 123', 1, datetime('now'), datetime('now'));
EOF

# 2. Enviar notificação periódica
curl -X POST http://localhost:8000/api/v1/conditional-shipments/notifications/send-periodic \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Resultado esperado: overdue_notifications.total_shipments >= 1
```

---

### Teste 3: Simular Falha (Usuário Sem Token)

```bash
# 1. Remover token do usuário (via SQL)
sqlite3 fitness_store.db "DELETE FROM push_tokens WHERE user_id = 2;"

# 2. Enviar notificação periódica
curl -X POST http://localhost:8000/api/v1/conditional-shipments/notifications/send-periodic \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Resultado esperado:
# - failed_count >= 1
# - errors contém "Nenhum token encontrado"
```

---

## Monitoramento com SQL

### 1. Taxa de Sucesso de Notificações (Últimos 7 dias)

```sql
SELECT
    DATE(sent_at) as date,
    COUNT(*) as total,
    SUM(CASE WHEN success THEN 1 ELSE 0 END) as success_count,
    SUM(CASE WHEN NOT success THEN 1 ELSE 0 END) as failed_count,
    ROUND(AVG(CASE WHEN success THEN 1.0 ELSE 0.0 END) * 100, 2) as success_rate
FROM notification_logs
WHERE sent_at >= datetime('now', '-7 days')
  AND title LIKE '%Envio%'
GROUP BY DATE(sent_at)
ORDER BY date DESC;
```

---

### 2. Notificações Por Tenant (Últimas 24h)

```sql
SELECT
    nl.tenant_id,
    s.name as store_name,
    COUNT(*) as total_notifications,
    SUM(CASE WHEN nl.success THEN 1 ELSE 0 END) as successful
FROM notification_logs nl
LEFT JOIN stores s ON nl.tenant_id = s.id
WHERE nl.sent_at >= datetime('now', '-1 day')
  AND nl.title LIKE '%Envio%'
GROUP BY nl.tenant_id, s.name
ORDER BY total_notifications DESC;
```

---

### 3. Erros Mais Comuns

```sql
SELECT
    error_message,
    COUNT(*) as occurrences
FROM notification_logs
WHERE success = 0
  AND error_message IS NOT NULL
  AND sent_at >= datetime('now', '-7 days')
GROUP BY error_message
ORDER BY occurrences DESC
LIMIT 10;
```

---

## Integração com Grafana/Datadog

### Métricas Recomendadas

1. **notification.periodic.pending.sent** - Contador de notificações de envios pendentes
2. **notification.periodic.overdue.sent** - Contador de alertas de envios atrasados
3. **notification.periodic.failed** - Contador de falhas
4. **notification.periodic.latency** - Tempo de execução do endpoint
5. **notification.periodic.success_rate** - Taxa de sucesso (%)

### Alertas Recomendados

```yaml
# alert.yml
alerts:
  - name: NotificationFailureRate
    condition: notification.periodic.failed > 5
    message: "Mais de 5 notificações falharam na última execução"
    severity: warning

  - name: NoNotificationsSent
    condition: notification.periodic.pending.sent == 0 AND notification.periodic.overdue.sent == 0
    message: "Nenhuma notificação foi enviada (possível problema no cron)"
    severity: critical
    duration: 24h
```

---

## Troubleshooting

### Problema 1: Notificações não estão sendo recebidas

**Sintomas:** `sent_count > 0` mas usuário não recebe no app

**Diagnóstico:**
```sql
SELECT * FROM push_tokens WHERE user_id = 2;
```

**Soluções:**
1. Verificar se token existe e está válido
2. Abrir app mobile e permitir notificações novamente
3. Testar notificação manual via Expo Notifications API

---

### Problema 2: `failed_count` sempre > 0

**Sintomas:** Sempre há falhas ao enviar

**Diagnóstico:**
```sql
SELECT error_message, COUNT(*) FROM notification_logs WHERE success = 0 GROUP BY error_message;
```

**Soluções:**
- `DeviceNotRegistered`: Remover tokens inválidos do banco
- `Network error`: Verificar conectividade com Expo API
- `Nenhum token encontrado`: Usuário precisa abrir app mobile

---

### Problema 3: Endpoint retorna 500 Internal Server Error

**Sintomas:** Erro ao chamar endpoint

**Diagnóstico:**
```bash
# Verificar logs do backend
tail -f backend.log

# Testar conexão com banco
python -c "from app.core.database import async_session; print('OK')"
```

**Soluções:**
1. Verificar se banco está acessível
2. Verificar se há migrations pendentes
3. Checar se `ConditionalShipment` e `User` têm dados válidos

---

## Próximos Passos

Após validar que o sistema funciona:

1. Configurar cron job para rodar diariamente
2. Configurar alertas de falha no Grafana/Datadog
3. Adicionar dashboard de estatísticas no admin panel
4. Implementar retry automático para notificações falhadas
5. Adicionar opção de opt-out para usuários
