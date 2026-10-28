# Guia de Deploy - Fitness Store Management

**Última atualização:** 2026-02-12

---

## 📋 Índice

1. [Teste Local](#1-teste-local)
2. [Deploy Mobile (Expo/EAS)](#2-deploy-mobile-expoeas)
3. [Deploy Backend (Render)](#3-deploy-backend-render)
4. [Configuração de Produção](#4-configuração-de-produção)

---

## 1. Teste Local

### 1.1 Backend (FastAPI)

```powershell
# Navegar para pasta do backend
cd C:\Users\Victor\Desktop\fitness-store-management\backend

# Ativar ambiente virtual
.\venv\Scripts\Activate.ps1

# Instalar dependências (se necessário)
pip install -r requirements.txt

# Iniciar servidor
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Verificar se está funcionando:**
- Acesse: http://localhost:8000/docs (Swagger UI)
- Deve mostrar a documentação da API

### 1.2 Mobile (Expo)

```powershell
# Navegar para pasta do mobile
cd C:\Users\Victor\Desktop\fitness-store-management\mobile

# Instalar dependências (se necessário)
npm install

# Iniciar Expo (método recomendado - evita travamentos)
.\expo-dev.ps1

# OU método padrão
npx expo start
```

**Opções de teste:**
- **Emulador Android:** Pressione `a` no terminal
- **Simulador iOS:** Pressione `i` no terminal (apenas macOS)
- **Dispositivo físico:** Escaneie o QR Code com Expo Go

### 1.3 Testar em Dispositivo Físico (Mesma Rede)

1. Descubra seu IP local:
```powershell
ipconfig
# Procure por "IPv4 Address" (ex: 192.168.100.158)
```

2. Atualize `mobile/constants/Config.ts`:
```typescript
export const API_URL = 'http://192.168.100.158:8000/api/v1';
```

3. Certifique-se que o backend está rodando com `--host 0.0.0.0`

### 1.4 Testar com Tunnel (Fora da Rede Local)

```powershell
# Terminal 1: Backend com localtunnel
npx localtunnel --port 8000
# Copie a URL gerada (ex: https://warm-fish-42.loca.lt)

# Terminal 2: Mobile
npx expo start --tunnel
```

Atualize `mobile/constants/Config.ts` com a URL do tunnel.

---

## 2. Deploy Mobile (Expo/EAS)

### 2.1 Pré-requisitos

```powershell
# Instalar EAS CLI globalmente
npm install -g eas-cli

# Fazer login na conta Expo
eas login
```

### 2.2 Configurar Projeto

```powershell
cd C:\Users\Victor\Desktop\fitness-store-management\mobile

# Inicializar EAS (se ainda não fez)
eas init

# Configurar build
eas build:configure
```

### 2.3 Arquivo `eas.json`

Verifique/atualize o arquivo `mobile/eas.json`:

```json
{
  "cli": {
    "version": ">= 5.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      }
    },
    "production": {
      "android": {
        "buildType": "app-bundle"
      }
    }
  },
  "submit": {
    "production": {}
  }
}
```

### 2.4 Atualizar app.config.js / app.json

```javascript
// mobile/app.config.js
export default {
  expo: {
    name: "Fitness Store",
    slug: "fitness-store",
    version: "1.0.0",
    // ... outras configs
    extra: {
      eas: {
        projectId: "seu-project-id-aqui"
      },
      // URL de produção do backend
      apiUrl: process.env.API_URL || "https://seu-backend.onrender.com/api/v1"
    }
  }
};
```

### 2.5 Build de Preview (APK para testes)

```powershell
# Gerar APK para Android (testes internos)
eas build --platform android --profile preview

# Acompanhe o build em: https://expo.dev
# Quando terminar, baixe o APK e instale no dispositivo
```

### 2.6 Build de Produção

```powershell
# Build para Google Play Store
eas build --platform android --profile production

# Build para Apple App Store (requer macOS)
eas build --platform ios --profile production
```

### 2.7 Publicar Update (OTA - Over The Air)

Para atualizações rápidas sem novo build:

```powershell
# Publicar update para preview
eas update --branch preview --message "Descrição da atualização"

# Publicar update para produção
eas update --branch production --message "Descrição da atualização"
```

### 2.8 Submeter para Lojas

```powershell
# Submeter para Google Play
eas submit --platform android

# Submeter para App Store
eas submit --platform ios
```

---

## 3. Deploy Backend (Render)

### 3.1 Preparar Projeto

#### Criar `render.yaml` na raiz do projeto:

```yaml
# render.yaml
services:
  - type: web
    name: fitness-store-api
    env: python
    region: oregon
    plan: free
    buildCommand: |
      cd backend && pip install -r requirements.txt
    startCommand: |
      cd backend && uvicorn app.main:app --host 0.0.0.0 --port $PORT
    envVars:
      - key: DATABASE_URL
        value: sqlite+aiosqlite:///./fitness_store.db
      - key: SECRET_KEY
        generateValue: true
      - key: ALGORITHM
        value: HS256
      - key: ACCESS_TOKEN_EXPIRE_MINUTES
        value: 30
      - key: CORS_ORIGINS
        value: "*"
```

#### Criar `backend/Procfile` (alternativa):

```
web: cd backend && uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

### 3.2 Subir para GitHub

```powershell
cd C:\Users\Victor\Desktop\fitness-store-management

# Verificar status
git status

# Adicionar arquivos
git add .

# Commit
git commit -m "feat: prepare for render deployment"

# Push para GitHub
git push origin main
```

### 3.3 Conectar ao Render

1. Acesse [render.com](https://render.com) e faça login
2. Clique em **"New +"** → **"Web Service"**
3. Conecte sua conta GitHub
4. Selecione o repositório `fitness-store-management`
5. Configure:

| Campo | Valor |
|-------|-------|
| **Name** | fitness-store-api |
| **Region** | Oregon (US West) |
| **Branch** | main |
| **Root Directory** | backend |
| **Runtime** | Python 3 |
| **Build Command** | `pip install -r requirements.txt` |
| **Start Command** | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
| **Plan** | Free |

### 3.4 Configurar Variáveis de Ambiente no Render

No painel do Render, vá em **Environment** e adicione:

```
DATABASE_URL=sqlite+aiosqlite:///./fitness_store.db
SECRET_KEY=sua-chave-secreta-muito-longa-e-segura-aqui
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440
CORS_ORIGINS=*
```

> **Nota:** Para produção real, use PostgreSQL ao invés de SQLite:
> ```
> DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/dbname
> ```

### 3.5 Deploy Automático

Após configurar, o Render fará deploy automático a cada push no branch `main`.

**URL do seu backend:** `https://fitness-store-api.onrender.com`

### 3.6 Verificar Deploy

```powershell
# Testar se API está online
curl https://fitness-store-api.onrender.com/docs
```

---

## 4. Configuração de Produção

### 4.1 Atualizar URL no Mobile

Após deploy do backend, atualize `mobile/constants/Config.ts`:

```typescript
// Produção
export const API_URL = 'https://fitness-store-api.onrender.com/api/v1';

// Desenvolvimento (comentar em produção)
// export const API_URL = 'http://192.168.100.158:8000/api/v1';
```

### 4.2 Variáveis de Ambiente (Recomendado)

Use variáveis de ambiente para alternar entre dev/prod:

```typescript
// mobile/constants/Config.ts
const DEV_API_URL = 'http://192.168.100.158:8000/api/v1';
const PROD_API_URL = 'https://fitness-store-api.onrender.com/api/v1';

export const API_URL = __DEV__ ? DEV_API_URL : PROD_API_URL;
```

### 4.3 Checklist Pré-Deploy

- [ ] Testar todas as funcionalidades localmente
- [ ] Verificar se não há console.log desnecessários
- [ ] Atualizar versão no app.json/app.config.js
- [ ] Fazer backup do banco de dados
- [ ] Atualizar variáveis de ambiente
- [ ] Testar build de preview antes de produção

---

## 📝 Comandos Rápidos

### Desenvolvimento Local
```powershell
# Backend
cd backend && .\venv\Scripts\Activate.ps1 && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Mobile
cd mobile && .\expo-dev.ps1
```

### Build e Deploy
```powershell
# Build APK preview
cd mobile && eas build --platform android --profile preview

# Build produção
cd mobile && eas build --platform android --profile production

# Update OTA
cd mobile && eas update --branch production --message "v1.0.1 - correções"

# Push para GitHub (trigger deploy no Render)
git add . && git commit -m "deploy: update" && git push origin main
```

---

## 🔧 Troubleshooting

### Backend não inicia no Render
- Verifique logs no painel do Render
- Confirme que `requirements.txt` está atualizado
- Verifique variáveis de ambiente

### Mobile não conecta ao backend
- Confirme URL correta em Config.ts
- Verifique CORS_ORIGINS no backend
- Teste a URL diretamente no navegador

### Build falha no EAS
- Verifique logs do build em expo.dev
- Confirme que todas dependências estão em package.json
- Limpe cache: `npx expo start --clear`

### Plano Free do Render "dorme"
O plano free do Render "dorme" após 15min sem requests. Primeira request pode demorar ~30s.

**Solução:** Use um serviço de ping (UptimeRobot) ou upgrade para plano pago.
