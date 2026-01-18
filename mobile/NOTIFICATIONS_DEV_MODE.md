# 🔔 Sistema de Notificações Push - Modo Desenvolvimento

## ⚠️ Limitação em DEV

**Push Notifications remotas NÃO funcionam em dev sem um projectId real do Expo.**

### Por quê?

O Expo precisa de um `projectId` válido para gerar tokens push. O placeholder em `app.json:38` (`"your-expo-project-id-here"`) bloqueia push tokens remotos.

## ✅ O que FUNCIONA em DEV:

1. **Notificações Locais** - Funcionam 100%
2. **Notificações Agendadas** - Funcionam 100%
3. **Sistema de Notificações In-App** (banners) - Funciona 100%
4. **Registro de tokens** - Gracefully fails (app continua normal)

## ❌ O que NÃO funciona em DEV:

- **Push Notifications remotas** (enviadas pelo backend via Expo Push API)
- **Notificações de SLA** (enviadas pelo backend)
- **Notificações periódicas** (enviadas pelo backend)

## 🚀 Para testar Push Notifications COMPLETO:

### Opção 1: Usar Expo EAS (Produção/Staging)

```bash
# 1. Criar conta no Expo (se não tiver)
npx expo login

# 2. Criar projeto EAS
npx eas build:configure

# 3. O projectId real será gerado automaticamente
```

### Opção 2: Testar Notificações Locais (DEV)

```typescript
// Usar o hook em qualquer tela
const { sendLocalNotification, scheduleNotification } = usePushNotifications();

// Enviar notificação local imediata
await sendLocalNotification(
  'Teste de Notificação',
  'Isso funciona em DEV!',
  { route: '/(tabs)/conditional' }
);

// Agendar notificação para daqui a 10 segundos
await scheduleNotification(
  'Lembrete',
  'Notificação agendada!',
  10,
  { custom: 'data' }
);
```

## 📱 Como o código trata isso

O hook `usePushNotifications.ts` já trata gracefully o erro de `projectId`:

```typescript
// Linhas 163-172
try {
  token = (await Notifications.getExpoPushTokenAsync()).data;
} catch (error: any) {
  // Gracefully handle - app continua sem push token remoto
  console.warn('⚠️ Push token não disponível (modo desenvolvimento)');
  return undefined; // App continua normalmente
}
```

## 🔥 Resumo

| Tipo de Notificação | DEV (sem projectId) | PROD (com projectId) |
|---------------------|---------------------|----------------------|
| Notificações Locais | ✅ Funciona | ✅ Funciona |
| Notificações Agendadas | ✅ Funciona | ✅ Funciona |
| Banners In-App | ✅ Funciona | ✅ Funciona |
| Push Remoto (backend) | ❌ Não funciona | ✅ Funciona |

**Conclusão:** O sistema está **funcionando corretamente** em dev mode (com notificações locais). Para testar push remoto, use Expo EAS ou configure um projectId real.
