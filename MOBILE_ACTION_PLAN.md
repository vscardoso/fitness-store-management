# 🚀 Plano de Estruturação e Validação Mobile

**Objetivo**: Preparar o mobile para produção v1 em 2-3 semanas  
**Data**: 18 de novembro de 2025

---

## 📊 Fase 1: Validação e Testes (Semana 1)

### 🔴 Prioridade CRÍTICA

#### 1.1 Configurar Error Tracking
**Tempo estimado**: 2 horas

```bash
cd mobile
npx expo install sentry-expo
```

**Tasks**:
- [ ] Criar conta no Sentry (ou Bugsnag)
- [ ] Configurar Sentry no `app.json`
- [ ] Adicionar error boundary em `_layout.tsx`
- [ ] Testar captura de erros em dev
- [ ] Validar envio de erros para Sentry

**Código**:
```typescript
// app/_layout.tsx
import * as Sentry from 'sentry-expo';

Sentry.init({
  dsn: 'YOUR_SENTRY_DSN',
  enableInExpoDevelopment: false,
  debug: __DEV__,
});
```

---

#### 1.2 Implementar Testes E2E Básicos
**Tempo estimado**: 8 horas

```bash
# Instalar Detox
npm install --save-dev detox jest
```

**Fluxos críticos para testar**:
- [ ] Login com credenciais válidas
- [ ] Login com credenciais inválidas
- [ ] Criar produto
- [ ] Editar produto
- [ ] Deletar produto
- [ ] Criar cliente
- [ ] Criar venda completa (com 2 produtos)
- [ ] Logout

**Estrutura**:
```
mobile/
  e2e/
    auth.test.ts      # Testes de autenticação
    products.test.ts  # CRUD de produtos
    customers.test.ts # CRUD de clientes
    sales.test.ts     # Fluxo de venda completo
```

---

#### 1.3 Configurar Analytics
**Tempo estimado**: 2 horas

```bash
npx expo install expo-firebase-analytics
```

**Tasks**:
- [ ] Criar projeto no Firebase
- [ ] Configurar Firebase no `app.json`
- [ ] Adicionar tracking em eventos-chave:
  - Login/logout
  - Criação de produto/cliente
  - Finalização de venda
  - Erro de API
- [ ] Testar envio de eventos

---

#### 1.4 Validar Todos os Endpoints
**Tempo estimado**: 4 horas

**Tasks**:
- [ ] Testar todos os services com backend rodando
- [ ] Validar paginação (products, customers)
- [ ] Validar busca e filtros
- [ ] Testar criação de venda com FIFO
- [ ] Validar refresh token automático
- [ ] Testar logout em erro 401

**Checklist**:
```bash
# Backend deve estar rodando em http://localhost:8000
cd backend
uvicorn app.main:app --reload

# Mobile
cd mobile
npx expo start
```

---

### 🟡 Prioridade IMPORTANTE

#### 1.5 Migrar Token para SecureStore
**Tempo estimado**: 1 hora

```typescript
// services/storage.ts
import * as SecureStore from 'expo-secure-store';

export async function saveAccessToken(token: string): Promise<void> {
  await SecureStore.setItemAsync('access_token', token);
}

export async function getAccessToken(): Promise<string | null> {
  return await SecureStore.getItemAsync('access_token');
}
```

**Tasks**:
- [ ] Refatorar `services/storage.ts`
- [ ] Testar persistência entre sessões
- [ ] Validar logout limpa SecureStore

---

#### 1.6 Implementar Biometria (Opcional)
**Tempo estimado**: 2 horas

```bash
npx expo install expo-local-authentication
```

**Tasks**:
- [ ] Adicionar opção "Login com biometria"
- [ ] Armazenar flag no SecureStore
- [ ] Validar Face ID/Touch ID
- [ ] Fallback para senha

---

## 📦 Fase 2: Build e Configuração (Semana 2)

### 2.1 Configurar EAS Build
**Tempo estimado**: 3 horas

```bash
npm install -g eas-cli
eas login
eas build:configure
```

**Tasks**:
- [ ] Criar conta Expo (se não tiver)
- [ ] Configurar `eas.json` com profiles (dev, staging, production)
- [ ] Configurar environment variables
- [ ] Gerar keystore para Android
- [ ] Configurar provisioning profile para iOS (se tiver Mac)

**eas.json**:
```json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "env": {
        "EXPO_PUBLIC_API_URL": "http://localhost:8000/api/v1"
      }
    },
    "staging": {
      "distribution": "internal",
      "env": {
        "EXPO_PUBLIC_API_URL": "https://staging-api.fitness-store.com/api/v1"
      }
    },
    "production": {
      "env": {
        "EXPO_PUBLIC_API_URL": "https://api.fitness-store.com/api/v1"
      }
    }
  },
  "submit": {
    "production": {}
  }
}
```

---

### 2.2 Criar Assets para App Stores
**Tempo estimado**: 4 horas

**Tasks**:
- [ ] **App Icon**: 1024x1024 PNG (sem transparência)
- [ ] **Splash Screen**: 2000x2000 PNG
- [ ] **Screenshots iOS**:
  - 6.5" (iPhone 14 Pro Max): 1284x2778
  - 5.5" (iPhone 8 Plus): 1242x2208
- [ ] **Screenshots Android**:
  - Phone: 1080x1920 ou 720x1280
  - 7" Tablet: 1024x600
- [ ] **Feature Graphic** (Android): 1024x500
- [ ] **Privacy Policy** (página web)
- [ ] **App description** (PT-BR e EN)

**Ferramentas**:
- Figma/Canva para designs
- `npx expo-optimize` para otimizar imagens

---

### 2.3 Atualizar app.json para Produção
**Tempo estimado**: 1 hora

```json
{
  "expo": {
    "name": "Fitness Store",
    "slug": "fitness-store-management",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#1a237e"
    },
    "ios": {
      "bundleIdentifier": "com.fitnessstore.management",
      "buildNumber": "1",
      "supportsTablet": false
    },
    "android": {
      "package": "com.fitnessstore.management",
      "versionCode": 1,
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#1a237e"
      }
    },
    "extra": {
      "eas": {
        "projectId": "YOUR_PROJECT_ID"
      }
    },
    "privacy": "public"
  }
}
```

---

### 2.4 Build de Teste
**Tempo estimado**: 2 horas (+ tempo de build no EAS)

```bash
# Build Android (APK para teste)
eas build --platform android --profile development

# Build iOS (TestFlight)
eas build --platform ios --profile staging
```

**Tasks**:
- [ ] Fazer build Android APK
- [ ] Testar APK em dispositivo físico
- [ ] Validar todas as funcionalidades
- [ ] Testar com backend de staging

---

## 🏪 Fase 3: Deploy em App Stores (Semana 3)

### 3.1 Google Play Console
**Tempo estimado**: 4 horas

**Tasks**:
- [ ] Criar conta Google Play Developer ($25)
- [ ] Criar novo app no Play Console
- [ ] Preencher informações do app:
  - Nome, descrição (PT-BR e EN)
  - Categoria: Business
  - Upload screenshots
  - Feature graphic
  - App icon
- [ ] Configurar política de privacidade
- [ ] Preencher questionário de conteúdo
- [ ] Configurar preço (gratuito)
- [ ] Criar release em **Internal testing track**
- [ ] Upload do AAB via EAS Submit

```bash
eas build --platform android --profile production
eas submit --platform android
```

---

### 3.2 Apple App Store (Opcional - requer Mac)
**Tempo estimado**: 6 horas

**Tasks**:
- [ ] Criar conta Apple Developer ($99/ano)
- [ ] Criar App ID no portal
- [ ] Criar app no App Store Connect
- [ ] Preencher informações do app:
  - Nome, descrição (PT-BR e EN)
  - Categoria: Business
  - Upload screenshots (todas as resoluções)
  - App icon
- [ ] Configurar política de privacidade
- [ ] Preencher Age Rating
- [ ] Configurar preço (gratuito)
- [ ] Upload via EAS Submit
- [ ] Enviar para revisão

```bash
eas build --platform ios --profile production
eas submit --platform ios
```

---

### 3.3 Beta Testing
**Tempo estimado**: 1 semana

**Tasks**:
- [ ] **Android**: Convidar testadores no Internal Track
- [ ] **iOS**: Distribuir via TestFlight
- [ ] Coletar feedback
- [ ] Corrigir bugs críticos
- [ ] Fazer nova build se necessário
- [ ] Validar com usuários reais

---

## 🚀 Fase 4: Launch (Semana 4)

### 4.1 Deploy Backend em Produção
**Tasks**:
- [ ] Provisionar servidor (Render, Railway, AWS, GCP)
- [ ] Configurar PostgreSQL em produção
- [ ] Configurar variáveis de ambiente
- [ ] Fazer deploy do backend
- [ ] Validar migrations
- [ ] Testar todos os endpoints
- [ ] Configurar domínio (api.fitness-store.com)
- [ ] Configurar SSL/TLS (Let's Encrypt)
- [ ] Configurar backup automático do banco

---

### 4.2 Lançamento App Stores
**Tasks**:
- [ ] **Google Play**: Promover do Internal → Production
- [ ] **App Store**: Aguardar aprovação (2-7 dias)
- [ ] Monitorar crash reports (Sentry)
- [ ] Monitorar analytics (Firebase)
- [ ] Preparar marketing (redes sociais, landing page)

---

### 4.3 Monitoramento Pós-Launch
**Tasks**:
- [ ] Configurar alertas no Sentry (crashes > 5/hora)
- [ ] Monitorar Firebase Analytics diariamente
- [ ] Coletar reviews dos usuários
- [ ] Criar backlog de melhorias (v1.1)
- [ ] Planejar próximas features

---

## 📋 Checklist Final Antes do Launch

### Backend
- [ ] ✅ 47% cobertura de testes (mínimo alcançado)
- [ ] ✅ Multi-tenant validado
- [ ] ✅ FIFO de estoque funcional
- [ ] ✅ Soft delete implementado
- [ ] ✅ JWT com refresh token
- [ ] ❌ Backend em produção (pending)
- [ ] ❌ Domínio configurado (pending)
- [ ] ❌ SSL/TLS ativo (pending)
- [ ] ❌ Backup automático (pending)

### Mobile
- [ ] ✅ 95% funcionalidades implementadas
- [ ] ✅ UI/UX polido
- [ ] ✅ React Query configurado
- [ ] ✅ Zustand stores funcionais
- [ ] ❌ Testes E2E (pending)
- [ ] ❌ Error tracking (pending)
- [ ] ❌ Analytics (pending)
- [ ] ❌ SecureStore (pending)
- [ ] ❌ Assets App Store (pending)

### Infraestrutura
- [ ] ❌ Servidor de produção (pending)
- [ ] ❌ Banco de dados PostgreSQL (pending)
- [ ] ❌ Domínio registrado (pending)
- [ ] ❌ SSL/TLS (pending)
- [ ] ❌ CDN para assets (pending - opcional)
- [ ] ❌ Backup strategy (pending)

### Legal
- [ ] ❌ Privacy Policy (pending)
- [ ] ❌ Terms of Service (pending)
- [ ] ❌ LGPD compliance (pending)

---

## 📊 Estimativa de Custos

### Desenvolvimento (Tempo)
- **Fase 1 (Testes)**: 20 horas
- **Fase 2 (Build)**: 12 horas
- **Fase 3 (Deploy)**: 10 horas
- **Fase 4 (Launch)**: 8 horas
- **Total**: ~50 horas (1-2 semanas com 1 dev full-time)

### Infraestrutura (Mensal)
- **Servidor Backend**: $7-25/mês (Render, Railway)
- **PostgreSQL**: $7-15/mês (Render, Railway, Supabase)
- **Domínio**: $10-15/ano
- **SSL**: Gratuito (Let's Encrypt)
- **CDN**: Gratuito (Cloudflare)
- **Total**: ~$15-40/mês

### App Stores (Anual)
- **Apple Developer**: $99/ano (opcional)
- **Google Play**: $25 (taxa única)
- **Total**: $25-124/ano

### SaaS/Tools
- **Sentry** (Error tracking): Gratuito até 5k events/mês
- **Firebase** (Analytics): Gratuito até 10GB/mês
- **Expo EAS**: Gratuito (2 builds/mês) ou $29/mês (ilimitado)
- **Total**: $0-30/mês

### Total Primeiro Ano
**Mínimo**: $180 (sem iOS)  
**Completo**: $700 (com iOS + EAS Pro)

---

## 🎯 Próximos Passos IMEDIATOS

**Hoje**:
1. ✅ Avaliar prontidão backend (DONE)
2. ✅ Avaliar prontidão mobile (DONE)
3. ✅ Criar plano de ação (DONE)
4. ⏭️ Decidir: Implementar testes E2E agora ou deploy direto?

**Esta Semana**:
1. Configurar Sentry (error tracking)
2. Configurar Firebase Analytics
3. Validar todos os endpoints com backend rodando
4. Criar assets básicos (icon, splash)

**Próxima Semana**:
1. Configurar EAS Build
2. Fazer build de teste (Android APK)
3. Testar em dispositivo físico
4. Provisionar servidor de produção

**Semana 3-4**:
1. Deploy backend em produção
2. Submeter app para Google Play (Internal Track)
3. Beta testing com usuários reais
4. Lançamento oficial 🚀

---

**Status**: ✅ **PLANO APROVADO - PRONTO PARA EXECUTAR**

