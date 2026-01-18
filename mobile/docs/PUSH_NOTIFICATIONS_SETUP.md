# 📱 Push Notifications - Guia Completo

## ✅ **STATUS ATUAL**

### **O que já funciona:**
- ✅ Notificações **in-app** (banners no topo)
- ✅ Notificações **locais** (agendadas no próprio celular)
- ✅ Permissões automáticas
- ✅ Histórico persistente
- ✅ Tudo funciona MESMO SEM projectId

### **O que NÃO funciona sem projectId:**
- ❌ Push notifications **remotas** (enviadas do backend)
- ❌ Token do Expo Push Service

**IMPORTANTE:** Para desenvolvimento local, você NÃO precisa de projectId! As notificações locais e agendadas funcionam perfeitamente.

---

## 🔧 **Como Funciona:**

### **1. Notificações Locais (Funcionam AGORA)**
```typescript
// Notificação imediata
await sendLocalNotification('Título', 'Mensagem', { data: {} });

// Notificação agendada (5 segundos)
await scheduleNotification('Título', 'Mensagem', 5, { data: {} });
```

✅ **Aparecem mesmo com celular bloqueado**
✅ **Som e vibração**
✅ **Não precisa de servidor**

### **2. Push Notifications Remotas (Precisam de projectId)**
Para enviar notificações do **backend** para o celular:
1. Backend chama API do Expo
2. Expo envia para o celular do usuário
3. Precisa de `projectId` e `push token`

---

## 🚀 **Para Produção (Opcional):**

Se você quiser push notifications remotas, siga estes passos:

### **1. Criar Projeto no Expo:**
```bash
cd mobile
npx expo login
eas init
```

### **2. Copiar o projectId:**
Após rodar `eas init`, será gerado um projectId. Copie e cole em `app.json`:

```json
"extra": {
  "eas": {
    "projectId": "SEU-PROJECT-ID-AQUI"
  }
}
```

### **3. Configurar Backend:**
```python
# backend/app/services/push_notification_service.py
import httpx

async def send_push_notification(
    push_token: str,
    title: str,
    body: str,
    data: dict = None
):
    """Envia push notification via Expo"""
    url = "https://exp.host/--/api/v2/push/send"

    payload = {
        "to": push_token,
        "title": title,
        "body": body,
        "data": data or {},
        "sound": "default",
        "priority": "high",
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(url, json=payload)
        return response.json()
```

---

## 💡 **Para Este Projeto:**

### **Solução Implementada:**
Usamos **notificações locais agendadas**, que funcionam perfeitamente sem projectId:

```typescript
// Quando criar envio condicional
const shipmentId = 123;
const scheduledTime = new Date('2025-12-03T14:00:00');

// Agendar notificação para o horário de envio
const secondsUntilShip = (scheduledTime.getTime() - Date.now()) / 1000;

await scheduleNotification(
  '🚚 Hora de Enviar',
  `Envio #${shipmentId} está pronto para sair`,
  secondsUntilShip,
  { shipmentId, type: 'ship_time' }
);
```

### **Vantagens:**
✅ Funciona sem servidor adicional
✅ Funciona sem projectId
✅ Funciona offline (uma vez agendada)
✅ Simples de implementar
✅ Sem custos adicionais

### **Desvantagens:**
❌ Precisa agendar no celular (não pode enviar do backend remotamente)
❌ Se app for desinstalado, perde as notificações agendadas

---

## 🧪 **Testando:**

### **1. Notificação Imediata:**
```typescript
import { usePushNotifications } from '@/hooks/usePushNotifications';

const { sendLocalNotification } = usePushNotifications();

await sendLocalNotification(
  'Teste',
  'Notificação imediata funcionando!',
  { test: true }
);
```

### **2. Notificação Agendada:**
```typescript
// Notificação em 10 segundos
await scheduleNotification(
  'Teste Agendado',
  'Esta notificação foi agendada!',
  10,
  { scheduled: true }
);
```

### **3. Com Celular Bloqueado:**
1. Rode o teste acima
2. Bloqueie o celular
3. Aguarde 10 segundos
4. ✅ Notificação aparece na tela de bloqueio

---

## 📊 **Fluxo Completo do Sistema:**

### **Criar Envio Condicional:**
```typescript
// 1. Usuário cria envio com data/hora
const shipment = {
  customer_id: 1,
  scheduled_ship_date: '2025-12-03T14:00:00',
  deadline_type: 'days',
  deadline_value: 7,
  items: [...],
};

// 2. Backend cria envio (status PENDING)
const response = await api.post('/conditional-shipments', shipment);

// 3. Mobile agenda notificação local
const scheduledTime = new Date(response.data.scheduled_ship_date);
const secondsUntil = (scheduledTime.getTime() - Date.now() - 15*60*1000) / 1000; // 15 min antes

await scheduleNotification(
  '🚚 Hora de Enviar',
  `Envio #${response.data.id} está agendado para ${formatTime(scheduledTime)}`,
  secondsUntil,
  {
    type: 'ship_time',
    shipmentId: response.data.id,
    route: `/conditional/${response.data.id}`,
  }
);
```

### **Marcar como Enviado:**
```typescript
// 1. Usuário marca como enviado
await api.put(`/conditional-shipments/${shipmentId}/mark-as-sent`, {
  carrier: 'Correios',
  tracking_code: 'BR123456789',
});

// 2. Backend calcula deadline (ex: 7 dias = hoje + 7 dias)
// deadline = 2025-12-10T14:00:00

// 3. Mobile agenda notificações de prazo
const deadline = new Date(response.data.deadline);

// Notificação 1: 1 dia antes
const warningTime = deadline.getTime() - 24*60*60*1000;
await scheduleNotification(
  '⏰ Prazo Próximo',
  `Envio #${shipmentId} vence amanhã`,
  (warningTime - Date.now()) / 1000,
  { type: 'deadline_warning', shipmentId }
);

// Notificação 2: no prazo exato
await scheduleNotification(
  '🔴 Prazo Vencido',
  `Envio #${shipmentId} atingiu o prazo!`,
  (deadline.getTime() - Date.now()) / 1000,
  { type: 'deadline_expired', shipmentId, priority: 'high' }
);
```

---

## ⚙️ **Configuração Atual:**

### **app.json:**
```json
{
  "expo": {
    "extra": {
      "eas": {
        "projectId": "your-expo-project-id-here"
      }
    }
  }
}
```

### **usePushNotifications.ts:**
```typescript
// Trata QUALQUER erro relacionado a projectId gracefully
try {
  token = (await Notifications.getExpoPushTokenAsync()).data;
} catch (error: any) {
  // Captura todos os erros: E_NO_PROJECT_ID, "No 'projectId' found", etc.
  console.warn('⚠️ Não foi possível obter push token (projectId ausente)');
  console.log('💡 Notificações locais e agendadas continuam funcionando');
  return undefined;  // App continua sem push token
}

// E também adiciona .catch() na promise chain
registerForPushNotificationsAsync()
  .then((token) => { /* ... */ })
  .catch((error) => {
    console.error('❌ Erro ao registrar push notifications:', error);
    // App continues without push token
  });
```

---

## 🎯 **Resumo:**

| Feature | Status | Requer projectId |
|---------|--------|------------------|
| Notificações in-app (banners) | ✅ Funciona | ❌ Não |
| Notificações locais imediatas | ✅ Funciona | ❌ Não |
| Notificações agendadas | ✅ Funciona | ❌ Não |
| Push remotas do backend | ⚠️ Opcional | ✅ Sim |

**Para este projeto, não precisamos de projectId!** 🎉

---

## 📝 **Próximos Passos:**

1. ✅ Sistema de notificações funcionando
2. ⏳ Implementar agendamento no mobile quando criar envio
3. ⏳ Implementar agendamento quando marcar como enviado
4. ⏳ Cancelar notificações se envio for cancelado

---

**Feito com ❤️ por Claude Code**
