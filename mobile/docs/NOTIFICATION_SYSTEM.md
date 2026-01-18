# 📱 Sistema de Notificações

Sistema genérico e profissional de notificações para o app mobile.

## ✨ Features Implementadas

### 1. **In-App Notifications** ✅
- Banners animados no topo da tela
- Tipos: info, success, warning, error, action
- Auto-dismiss configurável
- Suporte a ações (botões)
- Navegação ao clicar

### 2. **Push Notifications** ✅
- Expo Notifications integrado
- Permissões automáticas
- Token registration
- Foreground e background notifications
- Notificações agendadas

### 3. **Histórico Persistente** ✅
- Armazenamento em AsyncStorage
- Filtros (tipo, prioridade, read/unread)
- Contador de não lidas
- Limpeza automática de antigas

### 4. **Notification Manager** ✅
- Zustand store com estado global
- API simples e intuitiva
- Configurações personalizáveis

---

## 🚀 Como Usar

### **Notificação Simples**

```typescript
import { useNotificationStore } from '@/store/notificationStore';

const { quickNotify } = useNotificationStore();

// Info
quickNotify('info', 'Informação', 'Produto atualizado com sucesso');

// Success
quickNotify('success', 'Sucesso!', 'Venda registrada');

// Warning
quickNotify('warning', 'Atenção', 'Estoque baixo');

// Error
quickNotify('error', 'Erro', 'Falha ao salvar');
```

### **Notificação com Ações**

```typescript
import { createNotification } from '@/types/notification';

const notification = createNotification(
  'action',
  'Confirmar Envio',
  'O envio #123 foi realizado?',
  {
    actions: [
      {
        id: 'confirm',
        label: 'Sim, foi enviado',
        onPress: async () => {
          await markShipmentAsSent(123);
        },
      },
      {
        id: 'cancel',
        label: 'Ainda não',
        style: 'cancel',
        onPress: () => {
          // Dismiss
        },
      },
    ],
    autoDismiss: 0,  // Não auto-dismiss (aguarda ação do usuário)
  }
);

addNotification(notification);
```

### **Notificação com Navegação**

```typescript
quickNotify(
  'info',
  'Novo Pedido',
  'Cliente João fez um pedido',
  {
    route: '/orders/123',
    routeParams: { orderId: 123 },
    autoDismiss: 10000,  // 10 segundos
  }
);
```

### **Push Notification Local**

```typescript
import { usePushNotifications } from '@/hooks/usePushNotifications';

const { sendLocalNotification } = usePushNotifications();

await sendLocalNotification(
  'Prazo Próximo',
  'Envio #123 vence em 2 dias',
  { shipmentId: 123 }
);
```

### **Push Agendada**

```typescript
const { scheduleNotification } = usePushNotifications();

// Agendar para daqui 2 horas
await scheduleNotification(
  'Confirmar Envio',
  'O envio #123 já foi realizado?',
  7200,  // segundos
  { shipmentId: 123, type: 'shipment_confirmation' }
);
```

---

## 📊 Casos de Uso Reais

### **1. Confirmação de Envio Condicional**

```typescript
// Quando criar envio condicional (status PENDING):
const notification = createNotification(
  'action',
  'Envio Criado',
  `Envio #${shipmentId} criado. Marque como enviado quando sair da loja.`,
  {
    actions: [
      {
        id: 'mark_sent',
        label: 'Marcar como Enviado',
        onPress: async () => {
          await api.put(`/conditional-shipments/${shipmentId}/mark-as-sent`, {
            carrier: 'Correios',
            tracking_code: 'BR123456789',
          });
          quickNotify('success', 'Enviado!', 'Envio marcado como enviado');
        },
      },
    ],
    priority: 'high',
    autoDismiss: 0,  // Aguarda ação
  }
);

addNotification(notification);

// Agendar lembrete para 4 horas depois
await scheduleNotification(
  'Confirmar Envio',
  `O envio #${shipmentId} já foi enviado?`,
  14400,  // 4 horas
  { shipmentId, type: 'shipment_confirmation' }
);
```

### **2. Avisos de Prazo**

```typescript
// Verificar prazos próximos (rodar periodicamente)
const overdueShipments = await api.get('/conditional-shipments/overdue/check');

overdueShipments.forEach((shipment) => {
  if (shipment.days_remaining <= 2) {
    quickNotify(
      'warning',
      'Prazo Próximo',
      `Envio #${shipment.id} vence em ${shipment.days_remaining} dias`,
      {
        route: `/conditional/${shipment.id}`,
        priority: 'high',
      }
    );
  }
});
```

### **3. Feedback de Operações**

```typescript
// Após criar produto
try {
  await api.post('/products', productData);
  quickNotify('success', 'Produto Criado', 'Produto adicionado com sucesso');
} catch (error) {
  quickNotify('error', 'Erro', 'Falha ao criar produto');
}
```

---

## ⚙️ Configurações

### **Ajustar Comportamento**

```typescript
const { updateConfig } = useNotificationStore();

updateConfig({
  sound: true,
  vibrate: false,
  badge: true,
  banner: true,
});
```

### **Gerenciar Histórico**

```typescript
const {
  getNotifications,
  getUnreadCount,
  markAllAsRead,
  clearOld,
} = useNotificationStore();

// Buscar não lidas
const unread = getNotifications({ read: false });

// Contar não lidas
const count = getUnreadCount();

// Marcar todas como lidas
markAllAsRead();

// Limpar antigas (mais de 30 dias)
clearOld(30);
```

---

## 🎨 Personalização

### **Cores Customizadas**

```typescript
// types/notification.ts
export const NOTIFICATION_COLORS = {
  info: '#2196F3',
  success: '#4CAF50',
  warning: '#FF9800',
  error: '#F44336',
  action: '#9C27B0',
};
```

### **Ícones Customizados**

```typescript
quickNotify('info', 'Título', 'Mensagem', {
  icon: 'rocket-outline',  // Qualquer ícone Ionicons
});
```

---

## 📁 Arquitetura

```
mobile/
├── types/
│   └── notification.ts              # Types e helpers
├── store/
│   └── notificationStore.ts         # Zustand store
├── hooks/
│   └── usePushNotifications.ts      # Push notifications
├── components/
│   └── notifications/
│       ├── NotificationBanner.tsx   # UI Banner
│       └── NotificationContainer.tsx # Container
└── app/
    └── _layout.tsx                  # Integração global
```

---

## 🔔 Backend: Endpoint Mark as Sent

### **PUT /api/v1/conditional-shipments/{id}/mark-as-sent**

```typescript
// mobile/services/conditionalService.ts
export async function markShipmentAsSent(
  shipmentId: number,
  data: {
    carrier?: string;
    tracking_code?: string;
    sent_notes?: string;
  }
) {
  const response = await api.put(
    `/conditional-shipments/${shipmentId}/mark-as-sent`,
    data
  );
  return response.data;
}
```

### **Fluxo Correto**

1. **PENDING** → Envio criado, aguardando saída da loja
2. **SENT** → Marcar manualmente com `mark-as-sent`
3. **PARTIAL_RETURN/COMPLETED** → Processar devolução

---

## 📱 Testando

### **Teste In-App**

```typescript
// Em qualquer tela:
useNotificationStore.getState().quickNotify(
  'success',
  'Teste',
  'Sistema de notificações funcionando!'
);
```

### **Teste Push**

```typescript
const { sendLocalNotification } = usePushNotifications();

await sendLocalNotification(
  'Teste Push',
  'Push notification funcionando!',
  { test: true }
);
```

---

## ✅ Checklist de Implementação

- [✅] Backend: Corrigir fluxo PENDING → SENT
- [✅] Backend: Endpoint `mark-as-sent`
- [✅] Mobile: Sistema de notificações genérico
- [✅] Mobile: Push notifications
- [✅] Mobile: Histórico persistente
- [✅] Mobile: Integração no layout
- [⏳] Mobile: Botão "Marcar como Enviado" na tela de detalhes
- [⏳] Mobile: Notificação automática de confirmação
- [⏳] Mobile: Tela de histórico de notificações

---

## 🚀 Próximos Passos

1. Adicionar botão "Marcar como Enviado" na tela de detalhes do conditional shipment
2. Implementar notificação automática agendada
3. Criar tela de histórico com filtros
4. Adicionar badge de contador no tab de notificações

---

**Feito com ❤️ por Claude Code**
