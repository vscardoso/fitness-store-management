# Sistema de Notificações Periódicas - Envios Condicionais

Sistema completo de notificações automáticas para envios condicionais, permitindo enviar lembretes de envios pendentes e alertas críticos de envios atrasados.

## Arquitetura

```
ConditionalNotificationService
    ├── send_pending_shipments_reminder()  → Lembretes de envios pendentes
    ├── send_overdue_shipments_alert()     → Alertas críticos de atrasos
    └── check_and_send_sla_notifications() → SLAs (5min antes de envio, 15min antes de retorno)

NotificationService (usado internamente)
    ├── send_notification()                → Envia push via Expo
    └── _log_notification()                → Registra log no banco
```

## Novos Métodos Implementados

### 1. `send_pending_shipments_reminder(db: AsyncSession)`

**Objetivo:** Enviar lembrete diário de envios pendentes.

**Processo:**
1. Busca todos envios com `status=PENDING` e `is_active=True`
2. Agrupa por tenant
3. Para cada tenant:
   - Busca usuários ADMIN/SELLER ativos
   - Monta notificação com total de envios e lista de até 3 clientes
   - Envia push notification: "📦 X Envio(s) Pendente(s)"

**Retorno:**
```python
{
    'total_tenants': 2,           # Quantos tenants têm envios pendentes
    'total_shipments': 5,         # Total de envios pendentes
    'sent_count': 2,              # Notificações enviadas com sucesso
    'failed_count': 0,            # Notificações que falharam
    'errors': []                  # Lista de erros (se houver)
}
```

**Exemplo de notificação:**
```
Título: 📦 3 Envio(s) Pendente(s)
Body: Total: 3 envio(s) aguardando processamento
      • João Silva, Maria Santos, Pedro Oliveira

Data: {
  'type': 'pending_shipments_reminder',
  'total_shipments': 3,
  'route': '/conditional',
  'priority': 'normal'
}
```

---

### 2. `send_overdue_shipments_alert(db: AsyncSession)`

**Objetivo:** Enviar alerta crítico de envios atrasados.

**Processo:**
1. Busca todos envios com `deadline < now()` e `status IN (SENT, PARTIAL_RETURN)`
2. Agrupa por tenant
3. Para cada tenant:
   - Busca usuários ADMIN/SELLER ativos
   - Busca dados de clientes afetados (até 5)
   - Calcula quantos dias de atraso
   - Envia push notification: "🚨 X Envio(s) Atrasado(s)!"

**Retorno:**
```python
{
    'total_tenants': 1,
    'total_shipments': 2,
    'sent_count': 1,
    'failed_count': 0,
    'errors': []
}
```

**Exemplo de notificação:**
```
Título: 🚨 2 Envio(s) Atrasado(s)!
Body: ⚠️ URGENTE: 2 envio(s) com prazo vencido!

      Clientes:
      • João Silva (3d atrasado)
      • Maria Santos (1d atrasado)

Data: {
  'type': 'overdue_shipments_alert',
  'total_shipments': 2,
  'customers': [15, 23],
  'route': '/conditional?filter=overdue',
  'priority': 'critical'
}
```

---

## Novo Endpoint

### `POST /api/v1/conditional-shipments/notifications/send-periodic`

**Descrição:** Envia notificações periódicas consolidadas (pendentes + atrasados).

**Autenticação:** Bearer Token (ADMIN apenas)

**Permissão:** Apenas usuários com `role=ADMIN` podem chamar este endpoint.

**Response:**
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
    "total_shipments": 2,
    "sent_count": 1,
    "failed_count": 0,
    "errors": []
  },
  "summary": {
    "total_notifications_sent": 3,
    "total_notifications_failed": 0,
    "total_errors": 0,
    "success": true,
    "timestamp": "2025-12-08T14:30:00.000000"
  }
}
```

**Códigos HTTP:**
- `200 OK` - Notificações enviadas (pode ter falhas parciais, veja `summary.success`)
- `403 Forbidden` - Usuário não é ADMIN
- `401 Unauthorized` - Token inválido ou ausente
- `500 Internal Server Error` - Erro no servidor

---

## Integração com Scheduler/Cron

### Opção 1: Cron Job Linux (Recomendado)

```bash
# Editar crontab
crontab -e

# Executar diariamente às 9h
0 9 * * * curl -X POST https://seu-dominio.com/api/v1/conditional-shipments/notifications/send-periodic \
  -H "Authorization: Bearer SEU_TOKEN_ADMIN" \
  >> /var/log/periodic-notifications.log 2>&1

# Executar a cada 6 horas
0 */6 * * * curl -X POST https://seu-dominio.com/api/v1/conditional-shipments/notifications/send-periodic \
  -H "Authorization: Bearer SEU_TOKEN_ADMIN" \
  >> /var/log/periodic-notifications.log 2>&1
```

### Opção 2: Celery Task (Python)

```python
# backend/app/tasks/notification_tasks.py
from celery import Celery
from app.core.database import async_session
from app.services.conditional_notification_service import ConditionalNotificationService

app = Celery('tasks', broker='redis://localhost:6379/0')

@app.task
async def send_periodic_notifications():
    """Task Celery para enviar notificações periódicas"""
    async with async_session() as db:
        service = ConditionalNotificationService()

        pending = await service.send_pending_shipments_reminder(db)
        overdue = await service.send_overdue_shipments_alert(db)

        return {
            'pending': pending,
            'overdue': overdue
        }

# Configurar beat schedule
app.conf.beat_schedule = {
    'periodic-notifications-daily': {
        'task': 'tasks.send_periodic_notifications',
        'schedule': crontab(hour=9, minute=0),  # Diariamente às 9h
    },
}
```

### Opção 3: APScheduler (Python - Sem Celery)

```python
# backend/app/scheduler.py
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from app.core.database import async_session
from app.services.conditional_notification_service import ConditionalNotificationService

scheduler = AsyncIOScheduler()

async def send_periodic_notifications():
    async with async_session() as db:
        service = ConditionalNotificationService()

        pending = await service.send_pending_shipments_reminder(db)
        overdue = await service.send_overdue_shipments_alert(db)

        print(f"Notificações enviadas: {pending['sent_count']} + {overdue['sent_count']}")

# Agendar diariamente às 9h
scheduler.add_job(send_periodic_notifications, 'cron', hour=9, minute=0)
scheduler.start()

# Adicionar no main.py
# from app.scheduler import scheduler
# @app.on_event("startup")
# async def startup():
#     scheduler.start()
```

### Opção 4: GitHub Actions (CI/CD)

```yaml
# .github/workflows/periodic-notifications.yml
name: Send Periodic Notifications

on:
  schedule:
    - cron: '0 9 * * *'  # Diariamente às 9h UTC

jobs:
  send-notifications:
    runs-on: ubuntu-latest
    steps:
      - name: Call Notification API
        run: |
          curl -X POST ${{ secrets.API_URL }}/api/v1/conditional-shipments/notifications/send-periodic \
            -H "Authorization: Bearer ${{ secrets.ADMIN_TOKEN }}" \
            -H "Content-Type: application/json"
```

---

## Exemplo de Uso Manual (Testing)

### Via cURL

```bash
# 1. Fazer login e obter token
TOKEN=$(curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@fitness.com", "password": "admin123"}' \
  | jq -r '.access_token')

# 2. Enviar notificações periódicas
curl -X POST http://localhost:8000/api/v1/conditional-shipments/notifications/send-periodic \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  | jq
```

### Via Python (httpx)

```python
import httpx
import asyncio

async def test_periodic_notifications():
    async with httpx.AsyncClient() as client:
        # Login
        login_response = await client.post(
            "http://localhost:8000/api/v1/auth/login",
            json={"email": "admin@fitness.com", "password": "admin123"}
        )
        token = login_response.json()["access_token"]

        # Enviar notificações
        response = await client.post(
            "http://localhost:8000/api/v1/conditional-shipments/notifications/send-periodic",
            headers={"Authorization": f"Bearer {token}"}
        )

        result = response.json()
        print(f"Pendentes: {result['pending_notifications']['sent_count']}")
        print(f"Atrasados: {result['overdue_notifications']['sent_count']}")
        print(f"Sucesso: {result['summary']['success']}")

asyncio.run(test_periodic_notifications())
```

### Via Postman

```
POST http://localhost:8000/api/v1/conditional-shipments/notifications/send-periodic

Headers:
  Authorization: Bearer {{admin_token}}
  Content-Type: application/json
```

---

## Logging e Monitoramento

Todas as notificações são registradas na tabela `notification_logs`:

```sql
SELECT
    nl.id,
    nl.title,
    nl.body,
    nl.success,
    nl.error_message,
    nl.sent_at,
    u.email as user_email
FROM notification_logs nl
LEFT JOIN users u ON nl.user_id = u.id
WHERE nl.title LIKE '%Envio%'
ORDER BY nl.sent_at DESC
LIMIT 100;
```

**Monitorar taxa de sucesso:**
```sql
SELECT
    DATE(sent_at) as date,
    COUNT(*) as total,
    SUM(CASE WHEN success THEN 1 ELSE 0 END) as success_count,
    ROUND(AVG(CASE WHEN success THEN 1.0 ELSE 0.0 END) * 100, 2) as success_rate
FROM notification_logs
WHERE title LIKE '%Envio%'
GROUP BY DATE(sent_at)
ORDER BY date DESC;
```

---

## Tratamento de Erros

### Cenários de Falha

1. **Nenhum token registrado:**
   - Retorno: `sent_count=0`, `errors=["Nenhum token encontrado"]`
   - Solução: Usuário precisa abrir o app mobile para registrar token

2. **Token inválido/expirado:**
   - Expo API retorna erro: `DeviceNotRegistered`
   - Solução: Sistema deve remover token inválido automaticamente

3. **Falha de rede com Expo API:**
   - Retorno: `failed_count > 0`, `errors=["Network error"]`
   - Solução: Retry automático ou alertar dev team

4. **Usuário sem permissão:**
   - HTTP 403: "Apenas administradores podem enviar notificações periódicas"

### Resiliência

- **Isolamento por tenant:** Se falhar para um tenant, continua processando outros
- **Logs detalhados:** Cada envio é registrado no banco (`notification_logs`)
- **Erros parciais:** Endpoint retorna sucesso mesmo com falhas parciais, veja `summary.success`

---

## Performance

### Otimizações Implementadas

1. **Batch grouping:** Agrupa por tenant antes de enviar (reduz queries)
2. **Eager loading:** Carrega customers com `selectinload` (evita N+1)
3. **Limit de clientes:** Mostra apenas 3-5 clientes na notificação (evita body gigante)
4. **Index nos campos:** `status`, `tenant_id`, `deadline` têm índices no banco

### Tempo de Execução Estimado

- 10 tenants, 50 envios: ~2-3 segundos
- 100 tenants, 500 envios: ~10-15 segundos
- 1000 tenants, 5000 envios: ~60-90 segundos

Para sistemas grandes (>100 tenants), considere:
- Processar em lotes (batch de 50 tenants por vez)
- Usar Celery para processamento assíncrono
- Cache de usuários por tenant

---

## Roadmap Futuro

- [ ] Configuração de horário preferido por tenant
- [ ] Opção de opt-out (desabilitar notificações periódicas)
- [ ] Notificação via email como fallback
- [ ] Dashboard de estatísticas de envio
- [ ] Webhook para integração com Slack/Discord
- [ ] Retry automático para notificações falhadas
- [ ] Rate limiting para evitar spam

---

## FAQ

**Q: Posso rodar manualmente pelo Swagger UI?**
A: Sim! Acesse `http://localhost:8000/docs`, autentique com token ADMIN e chame `POST /conditional-shipments/notifications/send-periodic`.

**Q: O que acontece se não houver envios pendentes/atrasados?**
A: O endpoint retorna `sent_count=0` sem enviar notificação. É seguro rodar mesmo sem dados.

**Q: Como testar sem spam para usuários reais?**
A: Crie um usuário de teste, registre um token de teste, e use um tenant de desenvolvimento.

**Q: Posso customizar o texto da notificação?**
A: Sim, edite os métodos `send_pending_shipments_reminder()` e `send_overdue_shipments_alert()` no arquivo `conditional_notification_service.py`.

**Q: Funciona com multi-tenancy?**
A: Sim! O sistema agrupa por tenant automaticamente e envia notificações isoladas para cada loja.

---

## Arquivo de Exemplo de Configuração

```bash
# .env
NOTIFICATION_SCHEDULE_ENABLED=true
NOTIFICATION_SCHEDULE_CRON="0 9 * * *"  # Diariamente às 9h
NOTIFICATION_MAX_RETRY=3
NOTIFICATION_TIMEOUT_SECONDS=30
```

---

## Contato

Para dúvidas sobre o sistema de notificações periódicas, consulte:
- `backend/app/services/conditional_notification_service.py` (lógica de negócio)
- `backend/app/api/v1/endpoints/conditional_shipments.py` (endpoint)
- `backend/app/services/notification_service.py` (envio Expo Push)
