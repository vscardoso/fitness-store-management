
# 🚀 Alternativas de Hospedagem Gratuitas para Produção

**Data de Análise**: 18 de janeiro de 2026  
**Projeto**: Fitness Store Management  
**Status do Projeto**: v1.0 - Pronto para Produção

---

## 📊 Resumo Executivo

Seu projeto é um **Full-Stack** composto por:

- ✅ **Backend**: FastAPI (Python 3.11+) + PostgreSQL/SQLite
- ✅ **Mobile**: React Native + Expo
- ✅ **Arquitetura**: 3-layer (API → Service → Repository)
- ✅ **Autenticação**: JWT com refresh tokens
- ✅ **Funcionalidades**: CRUD, FIFO, Dashboards Analytics

**Opções Gratuitas Viáveis**: 4 alternativas recomendadas

---

## 🎯 Alternativa 1: Render.com (MAIS RECOMENDADO)

### ✅ Vantagens
- **Grátis para backend**: 750 horas/mês (suficiente)
- **PostgreSQL gratuito**: 90 dias com limite
- **Deployments automáticos**: via GitHub
- **SSL/HTTPS**: Incluído
- **Fácil configuração**: 5 minutos
- **Já tem arquivo config**: `render.yaml` no projeto

### ⚠️ Limitações
- Serviço adormece após 15 min de inatividade (plano free)
- Banco PostgreSQL: limite 256 MB (suficiente para v1)
- Limite 750 horas/mês (sempre online = ~1095 horas)

### 📋 Passos para Deploy

#### 1. Conectar ao GitHub
```bash
# 1. Faça push do projeto ao GitHub
git push origin main

# 2. Acesse https://render.com
# 3. Sign up com GitHub
# 4. Clique em "New Service"
```

#### 2. Deploy Backend
```yaml
# O arquivo render.yaml já existe! Use:
# render.com/dashboard → New Web Service → GitHub
# Branch: main
# Build command: pip install -r backend/requirements.txt
# Start command: uvicorn app.main:app --host 0.0.0.0 --port 8000
# Root directory: backend
```

#### 3. Configurar Variáveis de Ambiente
```bash
# No dashboard do Render:
Environment > Add Environment Variables

SECRET_KEY=seu-secret-aleatorio-aqui
DATABASE_URL=postgresql://...  # Render fornece
CORS_ORIGINS=https://seu-tunnel.expo.dev,https://expo.dev
ACCESS_TOKEN_EXPIRE_MINUTES=60
```

#### 4. Deploy Mobile
```bash
# O mobile roda em Expo gratuitamente
# Apenas atualize a URL da API no arquivo:
# mobile/constants/Config.ts

export const BASE_URL = 'https://seu-backend-render.onrender.com/api/v1';
```

### 💰 Custo Anual
- **Backend**: R$ 0,00 (free tier)
- **Database**: R$ 0,00 (90 dias free, depois ~R$ 15/mês)
- **TOTAL**: R$ 0,00 inicialmente

### ✅ Setup Render (Passo a Passo)

```powershell
# 1. No projeto, update render.yaml (já existe):
# backend/Dockerfile precisa existir (cria um):

# 2. Crie backend/Dockerfile:
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

# 3. Push para GitHub:
git add .
git commit -m "Add Render config for production"
git push origin main

# 4. Em https://render.com/dashboard:
# - New Service > Connect GitHub repo
# - Select: fitness-store-management
# - Name: fitness-backend
# - Environment: Docker
# - Region: São Paulo (ou mais próximo)
# - Build from Dockerfile: backend/Dockerfile

# 5. Clique Deploy
```

---

## 🎯 Alternativa 2: Railway.app

### ✅ Vantagens
- **$5 crédito inicial gratuito**: + renovação mensal
- **PostgreSQL incluído**: Não dorme
- **Deploy simples**: GitHub integration
- **CLI ferramentas**: Muito boas
- **Suporte ativo**: Comunidade grande

### ⚠️ Limitações
- Crédito de $5/mês (pode não ser suficiente)
- Depois do crédito, paga conforme usa (~$0.50/GB)
- Pode demorar mais que Render

### 💰 Custo Anual
- **Year 1**: R$ 0,00 (crédito $5/mês)
- **Year 2+**: ~R$ 100-150/ano (conforme uso)

### ✅ Setup Railway

```bash
# 1. Acesse https://railway.app
# 2. Login com GitHub
# 3. Click "New Project"
# 4. Deploy from GitHub repo
# 5. Configure em railway.json (criar):
```

**railway.json**:
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "dockerfile",
    "dockerfile": "backend/Dockerfile"
  },
  "deploy": {
    "startCommand": "uvicorn app.main:app --host 0.0.0.0 --port $PORT"
  }
}
```

---

## 🎯 Alternativa 3: Fly.io

### ✅ Vantagens
- **Máquina virtual grátis**: 3 shared-cpu-1x nano-1GB
- **Sem restrição de dormência**: Sempre rodando!
- **PostgreSQL incluído**: ~$5/mês (pago)
- **Deploy via CLI**: Muito rápido

### ⚠️ Limitações
- Depois do free tier, começa a cobrar
- Database não é grátis (mas backend sim)
- Requer CLI setup

### 💰 Custo Anual
- **Backend grátis**: R$ 0,00
- **Database**: ~R$ 30/ano (PostgreSQL mínimo)
- **TOTAL**: ~R$ 30/ano

### ✅ Setup Fly.io

```bash
# 1. Instale CLI:
brew install flyctl  # macOS
# ou: choco install flyctl (Windows)

# 2. Autentique:
flyctl auth login

# 3. Configure fly.toml (criar):
```

**fly.toml**:
```toml
app = "fitness-backend"
primary_region = "syd"

[build]
  builder = "dockerfile"
  dockerfile = "backend/Dockerfile"

[[services]]
  protocol = "tcp"
  internal_port = 8000
  processes = ["app"]

  [[services.ports]]
    port = 80
    handlers = ["http"]
```

```bash
# 4. Deploy:
flyctl launch
flyctl deploy
```

---

## 🎯 Alternativa 4: Supabase (Backend + Database)

### ✅ Vantagens
- **PostgreSQL grátis**: 500 MB storage, 2GB bandwidth
- **Auth incluído**: JWT pronto para usar
- **Realtime**: WebSockets grátis
- **API automática**: PostgREST (gera API de BD)

### ⚠️ Limitações
- FastAPI precisa rodar em outro lugar
- Supabase é mais para APIs serverless (não FastAPI)
- Não é a melhor opção para seu projeto

### 💰 Custo Anual
- **Database**: R$ 0,00
- **API Backend**: Precisa host separado (~R$ 100-200/ano)
- **TOTAL**: ~R$ 100-200/ano

---

## 📱 Alternativas para Mobile (Expo)

### Expo Go (GRÁTIS 100%)
- ✅ Publicar app para todos os usuários
- ✅ Sem App Store/Play Store
- ✅ Updates OTA automáticos
- ✅ Build na nuvem (EAS Build)

```bash
# Publicar:
cd mobile
npx expo publish

# Gerar builds para App Store/Play Store:
# EAS Build: https://eas.dev (free tier: 30 min compilação/mês)
```

---

## 🏆 RECOMENDAÇÃO FINAL

### Para v1.0 em Produção Grátis:

| Componente | Serviço | Custo | Tempo Setup |
|-----------|---------|-------|------------|
| **Backend** | Render.com | R$ 0 | 5 min |
| **Database** | PostgreSQL (Render) | R$ 0* | Automático |
| **Mobile** | Expo | R$ 0 | Já funciona |
| **TOTAL** | - | **R$ 0** | **10 min** |

*Grátis por 90 dias, depois R$ ~15/mês

---

## ⚡ Setup Rápido (10 minutos)

### Passo 1: Preparar Backend

```bash
# No projeto, crie backend/Dockerfile:
# (Se não existir)
```

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Passo 2: Atualizar Config

Edite `mobile/constants/Config.ts`:

```typescript
// export const BASE_URL = 'http://localhost:8000/api/v1'; // LOCAL
export const BASE_URL = 'https://seu-backend-render.onrender.com/api/v1'; // PRODUÇÃO
```

### Passo 3: Fazer Push

```bash
git add .
git commit -m "feat: prepare for production deployment"
git push origin main
```

### Passo 4: Deploy no Render

1. Acesse: https://render.com
2. Clique: "New Web Service"
3. Conecte seu GitHub
4. Selecione: fitness-store-management
5. Preencha:
   - **Name**: fitness-backend
   - **Dockerfile path**: backend/Dockerfile
   - **Port**: 8000
6. Clique: "Deploy"

### Passo 5: Configurar Variáveis

No dashboard do Render, adicione:

```
SECRET_KEY=seu-secret-aleatorio-64-chars
CORS_ORIGINS=https://expo.dev,https://*.expo.dev
ACCESS_TOKEN_EXPIRE_MINUTES=60
```

### Passo 6: Publicar Mobile

```bash
cd mobile
npx expo publish

# Ou fazer build para App Store/Play Store:
npm install -g eas-cli
eas build --platform android  # ou ios
```

---

## 🚨 Principais Considerações

### Banco de Dados
- **SQLite**: Ok para desenvolvimento, não recomendado produção
- **PostgreSQL**: Melhor opção (Render fornece grátis)
- **Atualizar string conexão**:

```python
# backend/.env para produção
DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/dbname
```

### Autenticação Mobile
- JWT com refresh tokens ✅ (já implementado)
- Tokens armazenados em AsyncStorage ✅
- Interceptor automático ✅

### SSL/HTTPS
- Render fornece SSL automático ✅
- Certificado renovado automaticamente ✅
- Expo requer HTTPS para APK ✅

### Rate Limiting
- **Recomendado**: Implementar no backend
- **Alternativa**: Cloudflare (grátis)

---

## 📋 Checklist Antes de Deploy

- [ ] Banco de dados atualizado (PostgreSQL)
- [ ] Variáveis de ambiente configuradas
- [ ] URL da API atualizada no mobile
- [ ] CORS configurado corretamente
- [ ] JWT SECRET_KEY alterado
- [ ] Testes rodando localmente
- [ ] Migrations aplicadas
- [ ] Admin user criado
- [ ] Push para GitHub

---

## 🔍 Monitoramento Gratuito

### Logs
- **Render**: Dashboard com logs em tempo real
- **Railway**: Logs automáticos
- **Fly.io**: `flyctl logs`

### Erros
- **Sentry** (grátis): https://sentry.io
  ```python
  # backend/app/main.py
  import sentry_sdk
  sentry_sdk.init("seu-dsn-aqui")
  ```

### Performance
- **New Relic** (free tier): https://newrelic.com

---

## 📞 Próximos Passos Recomendados

1. **Imediato**: Deploy no Render (10 min, grátis)
2. **1 semana**: Testar em produção com usuários reais
3. **1 mês**: Considerar upgrade para database pago ($15/mês)
4. **3 meses**: Avaliar custos reais e escalar se necessário

---

## 💡 Dicas Produção

### Performance
- [ ] Adicionar caching (Redis - grátis em Render)
- [ ] Compactar respostas (gzip)
- [ ] Implementar paginação
- [ ] Indexes no banco de dados

### Segurança
- [ ] HTTPS em tudo ✅
- [ ] CSRF tokens (se form HTML)
- [ ] Rate limiting
- [ ] Input validation ✅
- [ ] SQL injection protection ✅ (SQLAlchemy)

### DevOps
- [ ] CI/CD (GitHub Actions - grátis)
- [ ] Backups automáticos (Render faz)
- [ ] Monitoring (Sentry, New Relic)
- [ ] Alertas

---

## 🎯 Conclusão

**Melhor opção para você**: **Render.com**

✅ Grátis  
✅ Fácil de usar  
✅ Já tem config (render.yaml)  
✅ Database incluído  
✅ Suporte ativo  
✅ Deploy automático via GitHub  

**Tempo para colocar em produção**: ~10 minutos

---

## 📚 Recursos Adicionais

- [Render.com Docs](https://render.com/docs)
- [Railway Docs](https://docs.railway.app)
- [Fly.io Docs](https://fly.io/docs)
- [Expo Docs](https://docs.expo.dev)
- [FastAPI Production](https://fastapi.tiangolo.com/deployment)

---

**Pronto para produção! 🚀**

*Documento gerado em 18 de janeiro de 2026*
