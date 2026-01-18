# 📦 Guia Completo: Deploy no Render.com

**Tempo Estimado**: 15 minutos  
**Custo**: R$ 0,00 (grátis)  
**Dificuldade**: ⭐⭐☆☆☆ (Fácil)

---

## ✅ Pré-requisitos

- [ ] Conta no GitHub com o projeto
- [ ] Conta do Render.com (grátis)
- [ ] Projeto foi feito push no GitHub
- [ ] Python 3.11+ (verificar localmente)

---

## 🎯 Passo 1: Preparar Dockerfile

### Verificar se existe
```bash
ls -la backend/Dockerfile
# Se não existir: arquivo não encontrado
```

### Se não existir, criar:

**Arquivo**: `backend/Dockerfile`

```dockerfile
# Use Python 3.11 slim (menor tamanho)
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Copy requirements
COPY backend/requirements.txt .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy entire backend directory
COPY backend/ .

# Expose port
EXPOSE 8000

# Start FastAPI server
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**Salvar em**: `c:\Users\Victor\Desktop\fitness-store-management\backend\Dockerfile`

---

## 🎯 Passo 2: Configurar Variáveis de Ambiente

### Atualizar `.env` do backend

**Arquivo**: `backend/.env`

```bash
# Database - Será fornecido pelo Render
DATABASE_URL=sqlite:///./app.db  # Inicialmente (depois muda para PostgreSQL)

# Security - GERE UMA CHAVE NOVA!!!
# Gere aqui: https://generate-random.org/ (32+ caracteres)
SECRET_KEY=seu_secret_aleatorio_muito_longo_aqui_20_chars_min

# CORS - Adicione seu domínio do Render
CORS_ORIGINS=http://localhost:8000,http://localhost:19006,http://10.0.2.2:8000,https://seu-backend-render.onrender.com

# JWT
ACCESS_TOKEN_EXPIRE_MINUTES=60
REFRESH_TOKEN_EXPIRE_DAYS=30

# Logs
LOG_LEVEL=info
```

### Criar `.env.production`

**Arquivo**: `backend/.env.production`

```bash
# Produção
ENV=production

# Database - Será configurado no Render
DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/db

# Security - GERADO ALEATORIAMENTE
SECRET_KEY=seu_secret_aleatorio_muito_longo_aqui

# CORS - Seus domínios
CORS_ORIGINS=https://seu-backend-render.onrender.com,https://expo.dev,https://*.expo.dev

# JWT
ACCESS_TOKEN_EXPIRE_MINUTES=60

# Logs
LOG_LEVEL=warning
```

---

## 🎯 Passo 3: Atualizar Mobile Config

### Arquivo: `mobile/constants/Config.ts`

```typescript
// LOCAL DEVELOPMENT
// export const BASE_URL = 'http://localhost:8000/api/v1';

// PRODUÇÃO - Render.com
export const BASE_URL = 'https://seu-backend-render.onrender.com/api/v1';

// Configurações gerais
export const API_TIMEOUT = 30000;
export const ENABLE_NOTIFICATIONS = true;
```

---

## 🎯 Passo 4: Fazer Push no GitHub

### Terminal PowerShell

```powershell
# Navegar ao projeto
cd C:\Users\Victor\Desktop\fitness-store-management

# Adicionar arquivos
git add -A
git status  # Verificar o que vai fazer push

# Commit
git commit -m "chore: prepare for Render production deployment

- Add Dockerfile for backend
- Update environment variables
- Configure CORS for production
- Add production config for mobile"

# Push
git push origin main

# Verificar no GitHub (abra seu repo)
```

---

## 🚀 Passo 5: Deploy no Render.com

### 5.1 Acessar Render

1. Acesse: https://render.com
2. Clique: **"Sign up"** ou **"Sign in"**
3. Escolha: **"Continue with GitHub"**
4. Autorize o Render acessar seus repos

### 5.2 Criar Web Service

1. No dashboard, clique: **"New +"**
2. Selecione: **"Web Service"**

![Captura: New Web Service](https://render.com/docs/static/deploy-guide-web-service.png)

### 5.3 Conectar Repositório

1. Em **"Connect a repository"**:
   - Procure: `fitness-store-management`
   - Clique: **"Connect"**

2. Se não aparecer:
   - Clique: **"Configure account"**
   - Authorize Render em seu GitHub
   - Repita o passo 1

### 5.4 Configurar Serviço

Preencha os campos:

| Campo | Valor | Descrição |
|-------|-------|-----------|
| **Name** | `fitness-backend` | Nome do serviço |
| **Region** | `São Paulo` ou `São Paulo (Latam)` | Mais próximo do Brasil |
| **Branch** | `main` | Branch do GitHub |
| **Runtime** | `Docker` | Usar Dockerfile |
| **Build Command** | `docker build -t fitness-backend .` | Será preenchido automaticamente |
| **Start Command** | Deixar em branco | Docker CMD será usado |
| **Plan** | **Free** | Grátis! |

### 5.5 Variáveis de Ambiente

Clique: **"Advanced"** > **"Add Environment Variable"**

Adicione cada uma:

```
SECRET_KEY = seu_secret_aleatorio_32_chars
CORS_ORIGINS = https://seu-backend-render.onrender.com,https://expo.dev,https://*.expo.dev
ACCESS_TOKEN_EXPIRE_MINUTES = 60
LOG_LEVEL = info
ENV = production
```

**⚠️ IMPORTANTE**: Não adicione `DATABASE_URL` ainda (Render cria automaticamente)

### 5.6 Deploy

Clique: **"Create Web Service"**

✅ Render vai:
1. Fazer clone do repo
2. Bulidar Docker image
3. Fazer deploy automaticamente
4. Gerar URL: `https://fitness-backend-abc123.onrender.com`

---

## 🎯 Passo 6: Configurar Database (PostgreSQL)

### 6.1 Criar Banco PostgreSQL

No dashboard do Render:

1. Clique: **"New +"**
2. Selecione: **"PostgreSQL"**
3. Preencha:
   - **Name**: `fitness-db`
   - **Region**: `São Paulo (Latam)` (mesmo do backend!)
   - **PostgreSQL Version**: `15` (mais recente)
   - **Plan**: **Free** (500 MB, suficiente)

4. Clique: **"Create Database"**

### 6.2 Obter Connection String

Render vai criar e mostrar a URL, ex:
```
postgresql://user:password@host.render.com:5432/dbname
```

### 6.3 Atualizar Backend

1. Vá ao seu serviço **fitness-backend**
2. Clique: **"Environment"**
3. Adicione variável:
   ```
   DATABASE_URL = postgresql+asyncpg://seu_user:seu_password@host:5432/dbname
   ```

4. **Importante**: Mude o `DATABASE_URL` que você colocou antes
5. Clique: **"Save Changes"**

Render vai fazer redeploy automaticamente ✅

---

## 🎯 Passo 7: Inicializar Database

### 7.1 Acessar Console do Render

No dashboard do seu serviço **fitness-backend**:

1. Clique: **"Shell"**
2. Execute:

```bash
# Aplicar migrations
alembic upgrade head

# Criar admin user
python create_user.py
# Email: admin@fitness.com
# Password: admin123

# Criar categorias
python create_categories.py

# Criar dados de teste (opcional)
python seed_products.py
```

### 7.2 Verificar API

Acesse no navegador:
```
https://seu-backend-render.onrender.com/docs
```

Você deve ver o Swagger UI funcionando! 🎉

---

## 🎯 Passo 8: Atualizar Mobile

### 8.1 Update Config

Edite: `mobile/constants/Config.ts`

```typescript
export const BASE_URL = 'https://seu-backend-render.onrender.com/api/v1';
```

### 8.2 Testar

```bash
cd mobile
npx expo start

# Escaneie QR code com Expo Go
# Teste login e funcionalidades
```

### 8.3 Publicar (Opcional)

```bash
# Publicar versão para todos
npx expo publish

# Ou fazer build para App Store/Play Store
npm install -g eas-cli
eas build --platform all
```

---

## ✅ Verificação Final

### Checklist

- [ ] URL do Render funcionando (https://seu-backend-render.onrender.com/docs)
- [ ] Swagger UI respondendo
- [ ] Login funcionando na API
- [ ] Banco de dados conectado
- [ ] Mobile consegue fazer requisições
- [ ] Dados aparecem no mobile

### Testar Endpoints

```bash
# No terminal ou Postman:

# Login
curl -X POST "https://seu-backend-render.onrender.com/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@fitness.com", "password": "admin123"}'

# Pegar produtos (sem auth)
curl "https://seu-backend-render.onrender.com/api/v1/products"

# Pegar dashboard (com token)
curl -H "Authorization: Bearer {seu_token}" \
  "https://seu-backend-render.onrender.com/api/v1/dashboard/metrics"
```

---

## 🚨 Troubleshooting

### Problema: Serviço está lento/dormindo

**Solução**: Render free adormece após 15 min sem requisições

```bash
# Mantenha ativo com verificação periodicamente:
# Adicione em seu app mobile:
setInterval(() => {
  fetch(`${BASE_URL}/health`)
}, 600000)  // A cada 10 min
```

### Problema: Database fora do espaço

**Solução**: Limpar dados antigos ou upgrade para paid

```bash
# No shell do Render:
DELETE FROM inventory_movements WHERE created_at < NOW() - INTERVAL '90 days';
DELETE FROM sales WHERE created_at < NOW() - INTERVAL '1 year';
```

### Problema: Erro 502 Bad Gateway

**Causas**:
1. Backend não iniciou (check logs)
2. Database não configurada
3. Variáveis de ambiente faltando

**Solução**:
1. Clique em seu serviço
2. Vá para "Logs"
3. Procure por `Error` ou `Exception`
4. Corrija no código e faça novo push

### Problema: CORS Error no Mobile

**Solução**: Atualizar CORS_ORIGINS:

```bash
# No dashboard do Render:
Environment > CORS_ORIGINS

# Adicione todos os possíveis:
https://seu-backend-render.onrender.com,https://expo.dev,https://*.expo.dev,https://seu-dominio.com
```

---

## 📊 Monitoramento

### Logs em Tempo Real

1. Dashboard > seu serviço > **"Logs"**
2. Ver erros, warnings, info em tempo real

### Métricas

Dashboard > seu serviço > **"Metrics"**
- CPU usage
- Memory usage
- Requests per second
- Response time

### Alertas

Configurar notificações (plano Free tem limitações)

---

## 💰 Custos

| Item | Plano | Custo |
|------|-------|-------|
| Web Service (Backend) | Free | R$ 0,00 |
| PostgreSQL | Free | R$ 0,00* |
| **Total** | - | **R$ 0,00*** |

*Free por 90 dias, depois ~R$ 15/mês  
**Primeira versão é completamente grátis

---

## 🔄 Atualizações Contínuas

### Deploy Nova Versão

Fazer push no main:

```bash
git add -A
git commit -m "feat: add new feature"
git push origin main
```

Render faz deploy automaticamente! ✅

---

## 🎓 Próximos Passos

1. ✅ Deploy no Render
2. ⏳ Testar em produção com usuários reais
3. ⏳ Implementar monitoramento (Sentry)
4. ⏳ Configurar backups automáticos
5. ⏳ Avaliar upgrade para database pago

---

## 📞 Suporte

- **Render Docs**: https://render.com/docs
- **FastAPI Docs**: https://fastapi.tiangolo.com
- **Expo Docs**: https://docs.expo.dev

---

**Parabéns! Seu projeto está em produção! 🚀**

*Atualizado em: 18 de janeiro de 2026*
