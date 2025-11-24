# 🔍 Guia de Configuração do Sentry

**Status**: ✅ Instalado e configurado (DSN pendente)

---

## 📋 O que foi feito?

### ✅ Instalações
```bash
✓ npx expo install sentry-expo
✓ Plugin sentry-expo adicionado ao app.json
```

### ✅ Configurações Implementadas

1. **Inicialização do Sentry** (`app/_layout.tsx`):
   - Sentry.init() configurado
   - DSN centralizado em `constants/Config.ts`
   - Desabilitado em desenvolvimento (apenas em produção)

2. **Error Boundary** (`components/ErrorBoundary.tsx`):
   - Captura erros React não tratados
   - Envia automaticamente para Sentry
   - Mostra tela amigável de erro
   - Botão "Tentar Novamente"

3. **Interceptor de API** (`services/api.ts`):
   - Captura erros de rede (timeout, sem conexão)
   - Captura erros 400 (bad request)
   - Captura erros 403 (forbidden)
   - Captura erros 500+ (server errors)
   - Inclui contexto: URL, método, status, dados

---

## 🚀 Como Configurar o DSN (5 minutos)

### 1. Criar Conta no Sentry (Gratuito)

1. Acesse: https://sentry.io/signup/
2. Crie conta gratuita (GitHub, Google ou email)
3. Confirme email

### 2. Criar Novo Projeto

1. Clique em **"Create Project"**
2. Selecione plataforma: **React Native**
3. Nome do projeto: `fitness-store-mobile`
4. Team: (padrão)
5. Clique **"Create Project"**

### 3. Copiar o DSN

Após criar, você verá uma tela com instruções. Procure por:

```javascript
Sentry.init({
  dsn: "https://XXXXXXXXXXXX@o0000000.ingest.sentry.io/1111111",
  ...
});
```

**Copie apenas o DSN** (a string completa entre aspas).

### 4. Colar no Config.ts

Abra `mobile/constants/Config.ts` e substitua:

```typescript
// De:
DSN: 'https://example@o0.ingest.sentry.io/0', // ⚠️ SUBSTITUIR!

// Para:
DSN: 'https://XXXXXXXXXXXX@o0000000.ingest.sentry.io/1111111', // ✅ SEU DSN REAL
```

### 5. Pronto! 🎉

Agora todos os erros serão capturados automaticamente quando o app estiver em produção.

---

## 🧪 Como Testar

### 1. Testar Error Boundary

Crie um componente que lança erro de propósito:

```typescript
// Em qualquer tela, adicione temporariamente:
<Button onPress={() => { throw new Error('Erro de teste!'); }}>
  Testar Error Boundary
</Button>
```

**Resultado esperado**:
- Tela de erro amigável aparece
- Erro é enviado para Sentry
- Botão "Tentar Novamente" funciona

### 2. Testar Erro de API

```typescript
// Fazer requisição para endpoint inexistente:
api.get('/endpoint/que/nao/existe');
```

**Resultado esperado**:
- Erro 404 ou 500
- Enviado para Sentry com contexto completo

### 3. Testar Erro de Rede

1. Desligue WiFi/dados móveis
2. Tente fazer qualquer requisição
3. Erro de rede será capturado e enviado quando reconectar

---

## 📊 O que o Sentry vai capturar?

### 🔴 Erros Capturados Automaticamente

**1. Crashes de JavaScript**:
```
TypeError: Cannot read property 'id' of undefined
  at ProductCard.tsx:45:12
  
Contexto:
- User: victor@email.com
- Device: iPhone 14 Pro, iOS 17.1
- Breadcrumbs: User opened products → clicked product #123
```

**2. Erros de API**:
```
POST /api/v1/sales → 500 Internal Server Error

Contexto:
- Request: {"customer_id": 123, "items": [...]}
- Response: "Estoque insuficiente"
- User: admin@loja.com
```

**3. Erros de Rede**:
```
Network Error: ECONNABORTED

Contexto:
- URL: http://localhost:8000/api/v1/products
- Reason: Timeout after 30s
- User: online
```

**4. Erros de Componentes React**:
```
Error: Element type is invalid

Contexto:
- Component: <ProductList>
- Props: {category: 1, search: "whey"}
```

---

## 🎯 O que você verá no Sentry

### Dashboard

```
┌─────────────────────────────────────────────
│ 📊 Últimas 24h
│ 
│ 🔴 12 erros
│ 👥 8 usuários afetados
│ 📱 Devices: iPhone (5), Android (3)
│ 
│ Top Issues:
│ 1. TypeError: Cannot read 'id' of undefined (5x)
│    📍 ProductCard.tsx:45
│    
│ 2. Network Error: Timeout (4x)
│    🌐 POST /api/v1/sales
│    
│ 3. ValidationError: SKU já existe (3x)
│    📍 ProductForm.tsx:120
└─────────────────────────────────────────────
```

### Detalhes de um Erro

```
┌─────────────────────────────────────────────
│ TypeError: Cannot read property 'id' of undefined
│ 
│ 📍 Stack Trace:
│   at ProductCard (ProductCard.tsx:45:12)
│   at ProductList (ProductList.tsx:89:5)
│   at TabsScreen (products.tsx:120:8)
│ 
│ 👤 User:
│   ID: 123
│   Email: victor@email.com
│   Role: ADMIN
│ 
│ 📱 Device:
│   Model: iPhone 14 Pro
│   OS: iOS 17.1.2
│   App Version: 1.0.0
│ 
│ 🌐 Network:
│   Status: Online
│   Last API Call: GET /products (200 OK)
│ 
│ 🍞 Breadcrumbs (últimas ações):
│   1. 10:30:45 - User logged in
│   2. 10:31:12 - Navigated to Products
│   3. 10:31:20 - Searched for "whey"
│   4. 10:31:25 - Clicked product (ID: null) ← PROBLEMA
│   5. 10:31:26 - CRASH
│ 
│ 🔧 Como Reproduzir:
│   1. Buscar por "whey"
│   2. Clicar no produto sem ID
│   3. App crasha
│ 
│ ✅ Solução:
│   Adicionar validação: if (!product?.id) return null;
└─────────────────────────────────────────────
```

---

## ⚙️ Configurações Avançadas (Opcional)

### Identificar Usuários

```typescript
// Após login, identificar usuário no Sentry
import * as Sentry from 'sentry-expo';

Sentry.Native.setUser({
  id: user.id.toString(),
  email: user.email,
  username: user.name,
});

// Após logout, limpar
Sentry.Native.setUser(null);
```

**Onde adicionar**: `store/authStore.ts` após login bem-sucedido.

### Tags Customizadas

```typescript
// Adicionar contexto extra
Sentry.Native.setTag('tenant_id', user.tenant_id);
Sentry.Native.setTag('user_role', user.role);
```

### Capturar Eventos Customizados

```typescript
// Capturar evento específico (não erro)
Sentry.Native.captureMessage('Usuário finalizou venda de R$ 1000', 'info');

// Capturar erro manualmente
try {
  processPayment();
} catch (error) {
  Sentry.Native.captureException(error, {
    tags: { payment_method: 'credit_card' },
    extra: { amount: 100.00 }
  });
}
```

---

## 💰 Planos e Limites

### Plano Gratuito (✅ Suficiente para começar)
- **5.000 erros/mês**
- 1 projeto
- 7 dias de retenção
- Alertas por email
- Performance monitoring básico

**Quando ultrapassar 5k erros/mês**: Upgrade para Developer ($26/mês, 50k erros).

### Exemplo de Consumo

| App Status | Erros/dia | Erros/mês | Plano |
|-----------|-----------|-----------|-------|
| Beta (50 usuários) | ~20 | 600 | Gratuito ✅ |
| Lançamento (500 usuários) | ~100 | 3.000 | Gratuito ✅ |
| Crescimento (2k usuários) | ~200 | 6.000 | Pago ($26) |

---

## 🔔 Configurar Alertas

1. Vá em **Settings** → **Alerts**
2. Clique **Create Alert**
3. Configure:
   - **When**: Issues appear
   - **Filter**: All issues
   - **Then notify**: Email
4. Adicione condição: **More than 5 events in 1 hour** (opcional)
5. Salvar

**Resultado**: Você receberá email sempre que um erro novo aparecer.

---

## ✅ Checklist de Configuração

- [ ] Conta no Sentry criada
- [ ] Projeto React Native criado
- [ ] DSN copiado
- [ ] DSN colado em `constants/Config.ts`
- [ ] App testado (erro de propósito)
- [ ] Erro apareceu no dashboard do Sentry
- [ ] Alertas por email configurados
- [ ] Identificação de usuário implementada (opcional)

---

## 🚀 Próximos Passos

Após configurar o Sentry:

1. ✅ **Testar** - Gerar erro de propósito e ver no Sentry
2. ✅ **Configurar alertas** - Receber email em erros críticos
3. ⏭️ **Firebase Analytics** - Próxima etapa (métricas de uso)
4. ⏭️ **Build de produção** - Fazer build com EAS

---

**Dúvidas?** O Sentry está capturando tudo automaticamente. Você só precisa configurar o DSN! 🎯

**Última atualização**: 18/11/2025
