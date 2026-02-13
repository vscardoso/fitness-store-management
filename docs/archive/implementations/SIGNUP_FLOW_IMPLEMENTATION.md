# Implementação do Fluxo de Signup Completo

## ✅ Status: TASK #8 COMPLETA

Integração completa entre mobile e backend para signup multi-tenant com assinatura.

---

## 📋 Resumo da Implementação

### Backend (Já Completo - Tasks #1 e #2)
- ✅ Modelo `Subscription` com planos e trial tracking
- ✅ Endpoint `POST /auth/signup` (cria Store + User + Subscription atomicamente)
- ✅ Endpoint `POST /auth/check-email` (verifica disponibilidade de email)
- ✅ Endpoint `POST /auth/check-slug` (verifica disponibilidade de slug)
- ✅ Migration 005 aplicada com sucesso
- ✅ Testes do SignupService passando

### Mobile (Task #8 - NOVA)
- ✅ Tipos TypeScript: `SignupData`, `SignupResponse`, `CheckEmailResponse`, `CheckSlugResponse`
- ✅ Método `authService.signup()` implementado
- ✅ Método `authService.checkEmailAvailability()` implementado
- ✅ Método `authService.checkSlugAvailability()` implementado
- ✅ Método `authStore.signup()` implementado
- ✅ SignupScreen atualizado para passar dados via navigation params
- ✅ CreateStoreScreen atualizado para combinar dados e chamar signup
- ✅ Integração com Sentry para tracking de usuário após signup

---

## 🔄 Fluxo Completo de Signup

```
┌─────────────────────────────────────────────────────────────┐
│ 1. ONBOARDING (Primeira Vez)                               │
│    - 3 slides de apresentação                               │
│    - Marca como concluído no AsyncStorage                   │
│    - Redireciona para Login                                 │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. LOGIN SCREEN                                             │
│    - Usuário clica em "Criar Conta"                         │
│    - Navega para SignupScreen                               │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. SIGNUP SCREEN (Dados do Usuário)                        │
│    - Nome Completo (min 3 chars)                            │
│    - Email (validação regex)                                │
│    - Telefone (opcional, min 10 chars)                      │
│    - Senha (8+ chars, maiúscula, minúscula, número)        │
│    - Confirmar Senha (deve coincidir)                       │
│                                                              │
│    → Validação OK → Navega para CreateStoreScreen           │
│    → Passa userData via navigation params (JSON.stringify)  │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. CREATE STORE SCREEN (Dados da Loja)                     │
│    - Nome da Loja                                            │
│    - CEP (busca automática via ViaCEP)                      │
│    - Rua (auto-preenchido)                                  │
│    - Número                                                  │
│    - Complemento (opcional)                                 │
│    - Bairro (auto-preenchido)                               │
│    - Cidade (auto-preenchido)                               │
│    - Estado (auto-preenchido)                               │
│                                                              │
│    → Recupera userData dos params                           │
│    → Combina com storeData                                  │
│    → Chama authService.signup(signupData)                   │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. AUTH SERVICE (authService.signup)                       │
│    → POST /auth/signup com dados completos                  │
│    → Recebe SignupResponse do backend                       │
│    → Salva access_token em AsyncStorage                     │
│    → Salva refresh_token em AsyncStorage                    │
│    → Busca dados completos do usuário (GET /auth/me)        │
│    → Salva usuário em AsyncStorage                          │
│    → Retorna User para a tela                               │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. BACKEND (SignupService)                                  │
│    ┌──────────────────────────────────────────────┐        │
│    │ TRANSAÇÃO ATÔMICA (rollback se erro)         │        │
│    │                                               │        │
│    │ 1. Valida email único                         │        │
│    │ 2. Normaliza slug da loja                     │        │
│    │ 3. Gera subdomain único                       │        │
│    │ 4. Cria Store                                 │        │
│    │ 5. Cria Subscription (trial 30 dias)         │        │
│    │ 6. Cria User (role ADMIN)                    │        │
│    │ 7. Gera JWT tokens                            │        │
│    │                                               │        │
│    │ → Retorna SignupResponse completo             │        │
│    └──────────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 7. CREATE STORE SCREEN (Resposta)                          │
│    → Recebe User do authService                             │
│    → Atualiza authStore.setUser(user)                       │
│    → Identifica usuário no Sentry                           │
│    → Redireciona para Dashboard: router.replace('/(tabs)') │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 8. DASHBOARD (Usuário Autenticado)                         │
│    - Token salvo e válido                                   │
│    - Interceptor Axios adiciona token automaticamente       │
│    - Usuário pode usar todas as funcionalidades             │
│    - Subscription ativa (trial 30 dias)                     │
└─────────────────────────────────────────────────────────────┘
```

---

## 📄 Arquivos Modificados

### 1. **mobile/types/index.ts**
Adicionados tipos:
```typescript
export interface SignupData {
  full_name: string;
  email: string;
  password: string;
  phone?: string;
  store_name: string;
  store_slug?: string;
  plan?: string;
  zip_code: string;
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
}

export interface SignupResponse {
  user_id: number;
  user_email: string;
  user_full_name: string;
  user_role: string;
  store_id: number;
  store_name: string;
  store_slug: string;
  store_subdomain: string;
  subscription_plan: string;
  subscription_status: string;
  is_trial: boolean;
  trial_ends_at?: string;
  trial_days_remaining?: number;
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface CheckEmailResponse {
  available: boolean;
  message: string;
}

export interface CheckSlugResponse {
  available: boolean;
  message: string;
  subdomain?: string;
}
```

### 2. **mobile/services/authService.ts**
Adicionados métodos:
```typescript
// Verificar disponibilidade de email
export const checkEmailAvailability = async (email: string): Promise<CheckEmailResponse>

// Verificar disponibilidade de slug
export const checkSlugAvailability = async (slug: string): Promise<CheckSlugResponse>

// Realizar signup completo (usuário + loja + assinatura)
export const signup = async (signupData: SignupData): Promise<User>
```

### 3. **mobile/store/authStore.ts**
Adicionado método:
```typescript
signup: async (signupData: SignupData) => Promise<void>
```
- Chama `authService.signup()`
- Atualiza estado com usuário autenticado
- Identifica usuário no Sentry
- Gerencia loading e erros

### 4. **mobile/app/(auth)/signup.tsx**
Alterado `handleSignup()`:
```typescript
const handleSignup = async () => {
  if (!validateForm()) return;
  
  // Navegar para CreateStoreScreen passando userData via params
  router.push({
    pathname: '/(auth)/create-store',
    params: {
      userData: JSON.stringify({
        full_name: form.fullName.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        phone: form.phone.trim() || undefined,
      })
    }
  });
};
```

### 5. **mobile/app/(auth)/create-store.tsx**
Alterado `handleCreateStore()`:
```typescript
const handleCreateStore = async () => {
  if (!validateForm()) return;
  
  // 1. Recuperar userData dos params
  const userDataString = params.userData as string;
  const userData = JSON.parse(userDataString);
  
  // 2. Combinar com storeData
  const signupData: SignupData = {
    ...userData,
    store_name: form.storeName.trim(),
    plan: 'trial',
    zip_code: form.cep.replace(/\D/g, ''),
    street: form.street.trim(),
    number: form.number.trim(),
    complement: form.complement.trim() || undefined,
    neighborhood: form.neighborhood.trim(),
    city: form.city.trim(),
    state: form.state.trim(),
  };
  
  // 3. Realizar signup
  const user = await authService.signup(signupData);
  
  // 4. Atualizar store
  setUser(user);
  
  // 5. Identificar no Sentry
  Sentry.Native.setUser({...});
  
  // 6. Redirecionar
  router.replace('/(tabs)');
};
```

---

## 🧪 Como Testar

### 1. Iniciar Backend
```powershell
cd backend
.\venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 2. Expor para rede local (se testar em dispositivo físico)
```powershell
# Terminal separado
npx localtunnel --port 8000

# Copiar URL (ex: https://your-tunnel.loca.lt)
# Atualizar mobile/constants/Config.ts:
# BASE_URL: 'https://your-tunnel.loca.lt/api/v1'
```

### 3. Iniciar Mobile
```powershell
cd mobile
npx expo start
```

### 4. Fluxo de Teste
1. Abrir app → Ver Onboarding (primeira vez)
2. Clicar "Começar" → Login screen
3. Clicar "Criar Conta" → Signup screen
4. Preencher dados do usuário (validação em tempo real)
5. Clicar "Continuar" → Create Store screen
6. Preencher CEP → Dados auto-preenchidos via ViaCEP
7. Preencher número e complemento
8. Clicar "Criar Loja"
9. **Backend cria**: Store + User + Subscription (trial 30 dias)
10. **Mobile recebe**: JWT tokens + dados do usuário
11. **Redireciona**: Dashboard autenticado

### 5. Validações a Verificar
- ✅ Email duplicado → Erro
- ✅ Senha fraca → Erro de validação
- ✅ CEP inválido → Erro na busca
- ✅ Tokens salvos no AsyncStorage
- ✅ Usuário identificado no Sentry
- ✅ Subscription criada com trial de 30 dias
- ✅ Requisições subsequentes incluem JWT automaticamente

---

## 🔍 Endpoints Utilizados

### POST /api/v1/auth/signup
**Request:**
```json
{
  "full_name": "João Silva",
  "email": "joao@example.com",
  "password": "Senha123",
  "phone": "11987654321",
  "store_name": "Fitness Store SP",
  "plan": "trial",
  "zip_code": "01310100",
  "street": "Avenida Paulista",
  "number": "1578",
  "complement": "Loja 10",
  "neighborhood": "Bela Vista",
  "city": "São Paulo",
  "state": "SP"
}
```

**Response (200):**
```json
{
  "user_id": 1,
  "user_email": "joao@example.com",
  "user_full_name": "João Silva",
  "user_role": "admin",
  "store_id": 1,
  "store_name": "Fitness Store SP",
  "store_slug": "fitness-store-sp",
  "store_subdomain": "fitness-store-sp-ab12",
  "subscription_plan": "trial",
  "subscription_status": "active",
  "is_trial": true,
  "trial_ends_at": "2024-02-15T10:30:00",
  "trial_days_remaining": 30,
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer"
}
```

**Response (400 - Email Duplicado):**
```json
{
  "detail": "Email já cadastrado"
}
```

### POST /api/v1/auth/check-email
**Request:**
```json
{
  "email": "teste@example.com"
}
```

**Response:**
```json
{
  "available": true,
  "message": "Email disponível"
}
```

### POST /api/v1/auth/check-slug
**Request:**
```json
{
  "slug": "fitness-store"
}
```

**Response:**
```json
{
  "available": true,
  "message": "Slug disponível",
  "subdomain": "fitness-store-xy99"
}
```

### GET /api/v1/auth/me
**Headers:**
```
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "id": 1,
  "email": "joao@example.com",
  "full_name": "João Silva",
  "role": "admin",
  "phone": "11987654321",
  "is_active": true,
  "created_at": "2024-01-15T10:30:00"
}
```

---

## 🎯 Próximos Passos (Tasks Pendentes)

### Task #3: Email Service
- Configurar Resend ou SendGrid
- Criar templates de email
- Enviar email de boas-vindas após signup

### Task #4: Email Confirmation
- Adicionar campo `email_verified` no User
- Criar endpoint `POST /auth/verify-email`
- Enviar token de confirmação por email
- Bloquear algumas ações até confirmar email

### Task #9: Backend Signup Tests
- Testar signup endpoint com pytest
- Testar validações (duplicatas, dados inválidos)
- Testar rollback em caso de erro
- Testar criação atômica Store + User + Subscription

### Task #10: Tutorial Screens
- Criar telas de tutorial após primeiro login
- Mostrar funcionalidades principais
- Usar AsyncStorage para controlar exibição única

---

## 📊 Banco de Dados (Após Signup)

### Tabela: stores
```sql
INSERT INTO stores (
  name, slug, subdomain, plan, trial_ends_at,
  address, zip_code, city, state
) VALUES (
  'Fitness Store SP',
  'fitness-store-sp',
  'fitness-store-sp-ab12',
  'trial',
  '2024-02-15 10:30:00',
  'Av Paulista, 1578 Loja 10, Bela Vista',
  '01310100',
  'São Paulo',
  'SP'
);
```

### Tabela: subscriptions
```sql
INSERT INTO subscriptions (
  tenant_id, plan, status, is_trial, trial_ends_at, trial_started_at,
  max_products, max_users, max_sales_per_month,
  feature_advanced_reports, feature_multi_store, feature_api_access
) VALUES (
  1,  -- tenant_id (store_id)
  'trial',
  'active',
  true,
  '2024-02-15 10:30:00',
  '2024-01-16 10:30:00',
  100,  -- max_products
  1,    -- max_users
  1000, -- max_sales_per_month
  false, -- advanced_reports
  false, -- multi_store
  false  -- api_access
);
```

### Tabela: users
```sql
INSERT INTO users (
  tenant_id, email, full_name, hashed_password, role, phone
) VALUES (
  1,  -- tenant_id
  'joao@example.com',
  'João Silva',
  '$2b$12$...',  -- bcrypt hash
  'admin',
  '11987654321'
);
```

---

## ⚠️ Tratamento de Erros

### No Mobile (CreateStoreScreen)
```typescript
try {
  const user = await authService.signup(signupData);
  // sucesso
} catch (error) {
  // Registrar no Sentry
  Sentry.Native.captureException(error);
  
  // Extrair mensagem
  let errorMessage = 'Não foi possível criar sua conta. Tente novamente.';
  if (error instanceof Error) {
    errorMessage = error.message;
  }
  
  // Exibir alerta
  Alert.alert('Erro no Cadastro', errorMessage);
}
```

### No Backend (SignupService)
```python
async def signup(self, db, signup_data):
    async with db.begin():  # Transação atômica
        try:
            # ... criar store, subscription, user
            await db.commit()
            return response
        except IntegrityError as e:
            await db.rollback()
            if 'email' in str(e):
                raise ValueError("Email já cadastrado")
            elif 'slug' in str(e):
                raise ValueError("Nome da loja já em uso")
            raise
        except Exception as e:
            await db.rollback()
            raise
```

---

## 📝 Notas Importantes

1. **Transação Atômica**: Backend usa transação para garantir que Store, User e Subscription são criados juntos ou nenhum é criado

2. **Trial Automático**: Todo signup começa com plano trial de 30 dias

3. **Subdomain Único**: Backend gera subdomain único adicionando sufixo aleatório ao slug

4. **JWT Auto-Injection**: Interceptor Axios adiciona token automaticamente após signup

5. **Sentry Integration**: Usuário é identificado no Sentry após signup para tracking de erros

6. **AsyncStorage Keys**:
   - `@fitness_store:access_token`
   - `@fitness_store:refresh_token`
   - `@fitness_store:user`
   - `@fitness_store:onboarding_completed`

7. **Validações Mobile**: Todas as validações acontecem antes de chamar o backend (melhor UX)

8. **ViaCEP Integration**: Busca automática de endereço por CEP no Brasil

9. **Navigation**: Usa `router.replace()` para evitar voltar às telas de signup após autenticação

10. **Error Recovery**: Todos os erros são tratados e exibidos de forma user-friendly

---

## ✅ Checklist de Validação

- [x] Tipos TypeScript criados
- [x] authService.signup() implementado
- [x] authService.checkEmailAvailability() implementado
- [x] authService.checkSlugAvailability() implementado
- [x] authStore.signup() implementado
- [x] SignupScreen passa dados via params
- [x] CreateStoreScreen combina dados e chama signup
- [x] Integração com Sentry após signup
- [x] Tratamento de erros completo
- [x] Tokens salvos em AsyncStorage
- [x] Redirecionamento para dashboard
- [x] Sem erros de TypeScript
- [x] Todo list atualizada

---

**Status Final**: ✅ **TASK #8 COMPLETA - Signup Integration Funcional**

**Próximo**: Task #3 (Email Service) ou Task #9 (Backend Tests)
