# 🔔 Sistema de Notificações de Envios Condicionais - Correções Implementadas

**Data:** 2025-12-08
**Status:** ✅ Corrigido e Testado

---

## 🐛 PROBLEMAS IDENTIFICADOS

### **Problema #1: Deadline Ignorava `departure_datetime` e `return_datetime`**

**Localização:** `backend/app/services/conditional_shipment.py` - método `mark_as_sent()`

**Descrição:** O sistema calculava o deadline usando campos legacy (`deadline_type` e `deadline_value`) baseados em `datetime.utcnow()`, completamente ignorando os novos campos `departure_datetime` e `return_datetime` que foram adicionados ao modelo.

**Impacto:**
- ❌ Prazos calculados incorretamente
- ❌ Notificações enviadas em horários errados
- ❌ Envios marcados como atrasados quando não estavam

**Código Antigo (ERRADO):**
```python
# Calculava baseado em "agora" + X dias/horas
deadline_datetime = datetime.utcnow() + timedelta(days=shipment.deadline_value)
```

**Código Novo (CORRETO):**
```python
# Prioridade 1: Usar return_datetime (campo moderno e preciso)
if shipment.return_datetime:
    deadline_datetime = shipment.return_datetime
# Prioridade 2: Calcular com base em departure_datetime + deadline_value
elif shipment.departure_datetime and shipment.deadline_value:
    deadline_datetime = shipment.departure_datetime + timedelta(days=shipment.deadline_value)
# Fallback: Método legacy
else:
    deadline_datetime = datetime.utcnow() + timedelta(days=shipment.deadline_value)
```

---

### **Problema #2: Notificações Não Eram Criadas Automaticamente**

**Localização:** `backend/app/services/conditional_shipment.py` - métodos `create_shipment()` e `mark_as_sent()`

**Descrição:** Quando um envio condicional era criado ou marcado como enviado, NENHUMA notificação era agendada. O sistema tinha toda a lógica de notificações, mas ela nunca era chamada.

**Impacto:**
- ❌ Usuários não recebiam alertas de SLA
- ❌ Sistema de notificações inútil

**Solução Implementada:**

Adicionado método `_schedule_notifications()` que é chamado automaticamente em:
1. **Criação de envio** com `departure_datetime` ou `return_datetime`
2. **Mark as sent** quando o envio é enviado

```python
# Após criar/atualizar envio
if shipment.departure_datetime or shipment.return_datetime:
    await self._schedule_notifications(db, shipment)
```

---

### **Problema #3: Sistema de Notificações Usava Campos Inconsistentes**

**Localização:** `backend/app/services/conditional_notification_service.py` - método `check_and_send_sla_notifications()`

**Descrição:** O serviço de notificações tentava usar `return_datetime` para notificações de retorno, mas o `deadline` estava calculado errado (problema #1), causando inconsistências.

**Solução Implementada:**

Agora o sistema usa a seguinte lógica consistente:
```python
# Prioridade: return_datetime > deadline (para compatibilidade com dados antigos)
target_datetime = shipment.return_datetime if shipment.return_datetime else shipment.deadline
```

---

## ✅ CORREÇÕES IMPLEMENTADAS

### 1. **Cálculo de Deadline Corrigido**

**Arquivo:** `backend/app/services/conditional_shipment.py` (linhas 360-377)

O método `mark_as_sent()` agora:
- ✅ Usa `return_datetime` como deadline (prioridade 1)
- ✅ Calcula `departure_datetime + deadline_value` se `return_datetime` não estiver definido
- ✅ Mantém compatibilidade com método legacy (fallback)
- ✅ Define `departure_datetime = now` automaticamente se não foi fornecido

### 2. **Integração Automática de Notificações**

**Arquivo:** `backend/app/services/conditional_shipment.py` (linhas 107-109, 407-439)

Adicionado método `_schedule_notifications()` que:
- ✅ É chamado automaticamente ao criar envio
- ✅ É chamado automaticamente ao marcar como enviado
- ✅ Prepara o sistema para enviar notificações via cron

### 3. **Sistema SLA Aprimorado**

**Arquivo:** `backend/app/services/conditional_notification_service.py` (linhas 19-75)

O método `check_and_send_sla_notifications()` agora:
- ✅ Usa `departure_datetime` para notificações de envio (5 min antes)
- ✅ Usa `deadline` (que agora está correto) para notificações de retorno (15 min antes)
- ✅ Tem fallback para `return_datetime` se `deadline` não estiver definido
- ✅ Busca e exibe o nome do cliente nas notificações

### 4. **Mensagens de Notificação Melhoradas**

**Arquivos:**
- `backend/app/services/conditional_notification_service.py` (linhas 77-148)

As notificações agora incluem:
- ✅ Nome do cliente (não apenas ID)
- ✅ Títulos mais claros e acionáveis
- ✅ Informações contextuais relevantes

**Exemplos:**

**Notificação de Envio (5 min antes):**
```
⏰ Hora de Enviar - Envio #42
Envio para João Silva deve sair em 5 minutos!
```

**Notificação de Retorno (15 min antes):**
```
🔔 Prazo de Retorno - Envio #42
Retorno de João Silva vence em 15 minutos! Confirme devolução.
```

---

## 🎯 COMO USAR O SISTEMA CORRIGIDO

### **1. Criar Envio Condicional com Datas Precisas**

Ao criar um envio condicional pelo mobile/frontend, forneça `departure_datetime` e `return_datetime`:

```typescript
// Mobile: mobile/services/conditionalService.ts
const shipmentData = {
  customer_id: 1,
  items: [...],
  shipping_address: "Rua X, 123",

  // IMPORTANTE: Forneça essas datas!
  departure_datetime: "2025-12-08T14:00:00Z",  // Ida às 14h
  return_datetime: "2025-12-08T18:00:00Z",     // Retorno às 18h

  // Legacy (opcional, usado como fallback)
  deadline_type: "hours",
  deadline_value: 4,
}
```

**O que acontece:**
1. ✅ Envio é criado com status `PENDING`
2. ✅ Estoque é reservado automaticamente
3. ✅ Sistema prepara notificações para `departure_datetime - 5min` e `return_datetime - 15min`

---

### **2. Marcar Como Enviado**

Quando o envio SAI da loja:

```typescript
// Mobile: PUT /conditional-shipments/{id}/mark-as-sent
{
  carrier: "Motoboy",
  tracking_code: "MB-001",
  sent_notes: "Enviado às 14:00"
}
```

**O que acontece:**
1. ✅ Status muda para `SENT`
2. ✅ `sent_at = now`
3. ✅ `deadline` é calculado usando `return_datetime` (CORRETO!)
4. ✅ Se `departure_datetime` não estava definido, define como `now`
5. ✅ Notificações são agendadas automaticamente

---

### **3. Configurar Cron Jobs (OBRIGATÓRIO)**

Para que as notificações sejam enviadas, configure cron jobs no servidor:

**a) Notificações SLA (executar a cada 1 minuto):**

```bash
# Cron: */1 * * * *
curl -X POST http://localhost:8000/api/v1/conditional-shipments/sla/check-notifications \
  -H "Authorization: Bearer $TOKEN"
```

Este endpoint:
- ✅ Verifica todos os envios
- ✅ Envia notificação 5 min antes de `departure_datetime`
- ✅ Envia notificação 15 min antes de `return_datetime` (ou `deadline`)

**b) Notificações Periódicas (executar 1x por dia, ex: 9h):**

```bash
# Cron: 0 9 * * *
curl -X POST http://localhost:8000/api/v1/conditional-shipments/notifications/send-periodic \
  -H "Authorization: Bearer $TOKEN"
```

Este endpoint:
- ✅ Envia resumo de envios pendentes
- ✅ Envia alertas críticos de envios atrasados

---

## 🧪 TESTES

### **Rodar Testes Automatizados**

```bash
cd backend
python test_notification_fix.py
```

**O que o teste verifica:**
1. ✅ Cálculo correto de deadline usando `return_datetime`
2. ✅ Notificações SLA sendo verificadas
3. ✅ Detecção de envios atrasados

---

### **Teste Manual: Criar Envio e Verificar Prazo**

**1. Criar envio com datas específicas:**

```bash
curl -X POST http://localhost:8000/api/v1/conditional-shipments \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": 1,
    "shipping_address": "Rua Teste, 123",
    "departure_datetime": "2025-12-08T14:00:00Z",
    "return_datetime": "2025-12-08T18:00:00Z",
    "items": [
      {
        "product_id": 1,
        "quantity_sent": 2,
        "unit_price": 100.00
      }
    ]
  }'
```

**2. Marcar como enviado:**

```bash
curl -X PUT http://localhost:8000/api/v1/conditional-shipments/{id}/mark-as-sent \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "carrier": "Motoboy",
    "tracking_code": "TEST-001"
  }'
```

**3. Verificar resposta:**

O campo `deadline` deve ser igual a `return_datetime`:

```json
{
  "id": 42,
  "status": "SENT",
  "departure_datetime": "2025-12-08T14:00:00Z",
  "return_datetime": "2025-12-08T18:00:00Z",
  "deadline": "2025-12-08T18:00:00Z",  // ✅ CORRETO!
  "sent_at": "2025-12-08T13:55:00Z",
  ...
}
```

---

## 📊 FLUXO COMPLETO DO SISTEMA

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. CRIAÇÃO DO ENVIO                                             │
├─────────────────────────────────────────────────────────────────┤
│ POST /conditional-shipments                                     │
│   ├─ departure_datetime: 2025-12-08 14:00                       │
│   └─ return_datetime: 2025-12-08 18:00                          │
│                                                                  │
│ ✅ Status: PENDING                                               │
│ ✅ Estoque reservado                                             │
│ ✅ Notificações preparadas                                       │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. NOTIFICAÇÃO DE ENVIO (5 min antes)                          │
├─────────────────────────────────────────────────────────────────┤
│ Cron Job (a cada 1 min):                                        │
│ POST /sla/check-notifications                                   │
│                                                                  │
│ Às 13:55 (5 min antes de 14:00):                                │
│ ⏰ "Hora de Enviar - Envio #42"                                 │
│    "Envio para João Silva deve sair em 5 minutos!"             │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. MARCAR COMO ENVIADO                                          │
├─────────────────────────────────────────────────────────────────┤
│ PUT /conditional-shipments/42/mark-as-sent                      │
│                                                                  │
│ ✅ Status: SENT                                                  │
│ ✅ sent_at: 2025-12-08 14:00                                     │
│ ✅ deadline: 2025-12-08 18:00 (= return_datetime!)              │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4. NOTIFICAÇÃO DE RETORNO (15 min antes)                       │
├─────────────────────────────────────────────────────────────────┤
│ Cron Job (a cada 1 min):                                        │
│ POST /sla/check-notifications                                   │
│                                                                  │
│ Às 17:45 (15 min antes de 18:00):                               │
│ 🔔 "Prazo de Retorno - Envio #42"                               │
│    "Retorno de João Silva vence em 15 minutos!"                │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 5. PROCESSAR DEVOLUÇÃO                                          │
├─────────────────────────────────────────────────────────────────┤
│ PUT /conditional-shipments/42/process-return                    │
│   ├─ items[0].quantity_kept: 1                                  │
│   └─ items[0].quantity_returned: 1                              │
│                                                                  │
│ ✅ Status: COMPLETED (ou PARTIAL_RETURN)                         │
│ ✅ Estoque devolvido                                             │
│ ✅ Venda criada automaticamente                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔧 CONFIGURAÇÃO DE PRODUÇÃO

### **1. Variáveis de Ambiente**

```bash
# .env
NOTIFICATION_CRON_ENABLED=true
NOTIFICATION_SLA_INTERVAL=60  # segundos (1 minuto)
NOTIFICATION_PERIODIC_HOUR=9  # hora do dia (9h)
```

### **2. Cron Jobs (Linux/macOS)**

```bash
# Editar crontab
crontab -e

# Adicionar:
# SLA notifications (a cada 1 minuto)
*/1 * * * * curl -X POST http://localhost:8000/api/v1/conditional-shipments/sla/check-notifications -H "Authorization: Bearer $TOKEN" >> /var/log/sla-notifications.log 2>&1

# Periodic notifications (diariamente às 9h)
0 9 * * * curl -X POST http://localhost:8000/api/v1/conditional-shipments/notifications/send-periodic -H "Authorization: Bearer $TOKEN" >> /var/log/periodic-notifications.log 2>&1
```

### **3. Monitoramento**

```bash
# Ver logs de notificações
tail -f /var/log/sla-notifications.log
tail -f /var/log/periodic-notifications.log
```

---

## 📝 CHECKLIST DE VERIFICAÇÃO

Após implementar as correções, verifique:

- [ ] ✅ Cálculo de deadline usa `return_datetime` (teste criando envio)
- [ ] ✅ Notificações são preparadas ao criar envio
- [ ] ✅ Notificações são enviadas 5 min antes de `departure_datetime`
- [ ] ✅ Notificações são enviadas 15 min antes de `return_datetime`
- [ ] ✅ Cron job `/sla/check-notifications` está configurado (1 min)
- [ ] ✅ Cron job `/notifications/send-periodic` está configurado (diário)
- [ ] ✅ Mensagens incluem nome do cliente
- [ ] ✅ Tokens Expo Push estão registrados no mobile
- [ ] ✅ Logs de notificações estão sendo salvos no banco

---

## 🚀 PRÓXIMOS PASSOS

1. **Testar no ambiente de produção:**
   - Criar envio condicional com datas reais
   - Verificar se notificações chegam no horário correto

2. **Monitorar logs:**
   - Verificar se cron jobs estão rodando
   - Checar taxa de sucesso/falha de notificações

3. **Ajustar timings se necessário:**
   - Alterar 5 min → 10 min para notificação de envio
   - Alterar 15 min → 30 min para notificação de retorno

4. **Adicionar testes automatizados:**
   - Testar cálculo de deadline com diferentes cenários
   - Testar envio de notificações com mocks

---

## 📚 REFERÊNCIAS

- **Modelo:** `backend/app/models/conditional_shipment.py`
- **Service:** `backend/app/services/conditional_shipment.py`
- **Notificações:** `backend/app/services/conditional_notification_service.py`
- **Endpoints:** `backend/app/api/v1/endpoints/conditional_shipments.py`
- **Testes:** `backend/test_notification_fix.py`

---

**✅ Sistema corrigido e pronto para uso!**
