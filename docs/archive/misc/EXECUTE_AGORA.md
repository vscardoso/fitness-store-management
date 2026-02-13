# 🚀 EXECUTE AGORA: Deploy em 15 Minutos

**Seu roadmap final para colocar em produção**

Abra este arquivo e siga. Ponto.

---

## ⏱️ Timeline

```
00:00 - 02:00  Ler este arquivo
02:00 - 04:00  Setup Render.com
04:00 - 10:00  Deploy backend
10:00 - 12:00  Configurar database
12:00 - 13:00  Validar endpoints
13:00 - 15:00  Publicar mobile
```

---

## 📋 Checklist Pre-Deploy

Antes de começar, verifique:

- [ ] Você tem conta no GitHub? ✅
- [ ] Seu código está no GitHub main branch?
- [ ] Você tem email para registrar no Render.com?
- [ ] Seu backend/Dockerfile existe? ✅
- [ ] Seu backend/requirements.txt existe? ✅

Se sim em todos, siga para o passo 1.

---

## 🎯 PASSO 1: Atualizar Config Mobile (2 minutos)

### Arquivo: `mobile/constants/Config.ts`

Abra e mude:

```typescript
// ANTES (local):
export const BASE_URL = 'http://localhost:8000/api/v1';

// DEPOIS (produção):
export const BASE_URL = 'https://seu-backend-render.onrender.com/api/v1';
```

**Onde colocar a URL?**
- Você criará o serviço em alguns minutos
- Render vai fornecer: `https://fitness-backend-[RANDOM].onrender.com`
- Copie essa URL e use aqui

**Ou**, coloque um placeholder e atualize depois:
```typescript
export const BASE_URL = 'https://fitness-backend.onrender.com/api/v1';
```

✅ Pronto! Passe ao passo 2.

---

## 🎯 PASSO 2: Fazer Push no GitHub (2 minutos)

### No terminal PowerShell:

```powershell
# Navegar ao projeto
cd C:\Users\Victor\Desktop\fitness-store-management

# Status
git status

# Adicionar tudo
git add -A

# Commit
git commit -m "deploy: prepare v1.0 for production

- Update Config.ts for production URL
- Ready for Render deployment"

# Push
git push origin main
```

### Validar:
Abra seu GitHub repo no navegador e veja se aparece seu commit.

✅ Pronto! Passe ao passo 3.

---

## 🎯 PASSO 3: Criar Serviço no Render (5 minutos)

### 3.1 - Acessar Render

1. Acesse: https://render.com
2. Clique: **"Sign up"**
3. Escolha: **"Continue with GitHub"**
4. Autorize Render acessar seu GitHub

### 3.2 - Criar Web Service

1. Na dashboard, clique: **"New +"**
2. Selecione: **"Web Service"**
3. Procure por: `fitness-store-management`
4. Clique: **"Connect"**

### 3.3 - Configurar

Preencha os campos:

| Campo | Valor |
|-------|-------|
| **Name** | `fitness-backend` |
| **Region** | `São Paulo (Latam)` |
| **Branch** | `main` |
| **Build Command** | `docker build -t fitness .` (deixar padrão) |
| **Start Command** | vazio (Docker usará CMD) |
| **Plan** | **Free** (grátis!) |

### 3.4 - Environment Variables

Clique: **"Advanced"** > **"Add Environment Variable"**

Adicione CADA UMA (5 variáveis):

```
KEY: SECRET_KEY
VALUE: seu_secret_aleatorio_32_chars_aqui_123456789

---

KEY: CORS_ORIGINS
VALUE: https://seu-backend-render.onrender.com,https://expo.dev,https://*.expo.dev

---

KEY: ACCESS_TOKEN_EXPIRE_MINUTES
VALUE: 60

---

KEY: ENV
VALUE: production

---

KEY: LOG_LEVEL
VALUE: info
```

**Como gerar SECRET_KEY?**
- Acesse: https://generate-random.org/
- Copie uma string aleatória de 32+ caracteres

### 3.5 - Deploy

1. Clique: **"Create Web Service"**
2. Render vai começar a fazer build automaticamente
3. Aguarde 2-3 minutos
4. Status mudará para "Live"

✅ Seu backend está ONLINE! Passe ao passo 4.

---

## 🎯 PASSO 4: Adicionar Database PostgreSQL (3 minutos)

### 4.1 - Criar Database

1. No Render dashboard, clique: **"New +"**
2. Selecione: **"PostgreSQL"**

### 4.2 - Configurar

Preencha:

| Campo | Valor |
|-------|-------|
| **Name** | `fitness-db` |
| **Database** | deixar padrão |
| **User** | deixar padrão |
| **Region** | `São Paulo (Latam)` (MESMO do backend!) |
| **PostgreSQL Version** | `15` |
| **Plan** | **Free** |

### 4.3 - Criar

Clique: **"Create Database"**

Render vai criar e mostrar a connection string:
```
postgresql://user:password@host.render.com:5432/dbname
```

Copie TODA essa string!

### 4.4 - Conectar ao Backend

1. Vá ao seu serviço: **fitness-backend**
2. Clique: **"Environment"**
3. Clique: **"Add Environment Variable"**
4. Adicione:
```
KEY: DATABASE_URL
VALUE: postgresql+asyncpg://user:password@host:5432/dbname
```

(Cole a string que copiou, mas mude `postgresql://` para `postgresql+asyncpg://`)

5. Clique: **"Save"**

Render vai redeploy automaticamente (~1 min).

✅ Database está conectado! Passe ao passo 5.

---

## 🎯 PASSO 5: Validar e Testar (3 minutos)

### 5.1 - Testar URL

Abra no navegador:
```
https://seu-backend-render.onrender.com/docs
```

Você deve ver o **Swagger UI** funcionando! 🎉

Se der erro 502/503, aguarde mais 1 min (backend ainda está iniciando).

### 5.2 - Testar Login

Na página Swagger, procure por `/api/v1/auth/login`

Clique em "Try it out" e envie:
```json
{
  "email": "admin@fitness.com",
  "password": "admin123"
}
```

**Erro?** Significa que o admin user não foi criado ainda. Vamos criar no passo 6.

✅ Backend validado! Passe ao passo 6.

---

## 🎯 PASSO 6: Inicializar Database (3 minutos)

### 6.1 - Acessar Console

1. No Render, vá ao seu serviço **fitness-backend**
2. Clique: **"Shell"**

### 6.2 - Executar Comandos

No shell que abrir, execute UM POR UM:

```bash
# Aplicar migrations
alembic upgrade head

# Criar admin user
python create_user.py

# Criar categorias
python create_categories.py
```

Cada comando vai executar e mostrar sucesso.

### 6.3 - Validar Novamente

Vá ao Swagger UI novamente:
```
https://seu-backend-render.onrender.com/docs
```

Teste login com:
- Email: `admin@fitness.com`
- Password: `admin123`

Deve retornar um token JWT! ✅

---

## 🎯 PASSO 7: Publicar Mobile (2 minutos)

### 7.1 - Update Config (se ainda não fez)

Edite `mobile/constants/Config.ts`:

```typescript
export const BASE_URL = 'https://seu-backend-render.onrender.com/api/v1';
```

### 7.2 - Publicar no Expo Go

```bash
cd mobile

# Publicar
npx expo publish
```

Comando vai gerar um link que qualquer um pode abrir no Expo Go.

### 7.3 - Testar no App

1. Abra Expo Go no seu telefone
2. Escaneie o QR code gerado
3. Teste login e navegação

✅ Seu app está ONLINE e FUNCIONANDO!

---

## ✅ VALIDAÇÃO FINAL

Verificar:

- [ ] Swagger UI acessível em https://seu-backend-render.onrender.com/docs
- [ ] Login funciona (admin@fitness.com / admin123)
- [ ] GET /products retorna lista
- [ ] Mobile consegue conectar (se já atualizou Config)
- [ ] Expo Go mostra o app quando escaneia QR

Se todos OK → **PARABÉNS! VOCÊ ESTÁ EM PRODUÇÃO! 🚀**

---

## 🆘 Se Tiver Problemas

### "502 Bad Gateway"
**Solução**: Aguarde 2-3 minutos, backend ainda está iniciando

### "Connection Refused"
**Solução**: Verificar se DATABASE_URL está correto em Environment

### "CORS Error no Mobile"
**Solução**: Adicionar seu domínio em CORS_ORIGINS

### "Admin user não existe"
**Solução**: Executar `python create_user.py` no Shell do Render

### Outro erro?
**Solução**: 
1. Vá ao Render dashboard
2. Clique em seu serviço
3. Vá para "Logs"
4. Procure por `Error` ou `Exception`
5. Procure solução online ou em GUIA_DEPLOY_RENDER.md

---

## 📊 Resumo do Que Foi Criado

| Componente | URL | Status |
|-----------|-----|--------|
| Backend API | https://seu-backend-render.onrender.com | ✅ Online |
| Swagger UI | https://seu-backend-render.onrender.com/docs | ✅ Online |
| Database | PostgreSQL (Render) | ✅ Conectado |
| Mobile | Expo Go | ✅ Publicado |

---

## 💰 Custos

- **Render Backend**: R$ 0,00/mês (forever free)
- **PostgreSQL**: R$ 0,00 (90 dias), depois R$ 15/mês
- **Expo**: R$ 0,00/mês (forever free)
- **TOTAL MÊS 1**: **R$ 0,00**

---

## 🎬 Próximas Ações

### Hoje (Depois de online):
- [ ] Teste com algumas pessoas
- [ ] Recolha feedback
- [ ] Documente bugs encontrados

### Essa semana:
- [ ] Implementar Sentry (error tracking grátis)
- [ ] Publicar no Expo (link permanente)
- [ ] Começar beta testing

### Próximo mês:
- [ ] Google Play Store
- [ ] Apple App Store
- [ ] Analytics

---

## 🎉 PARABÉNS!

Você acabou de fazer o deploy do seu projeto em produção.

Seu app Fitness Store Management está agora **ONLINE** e **FUNCIONANDO**.

Aproximadamente 15 minutos de trabalho.

Zero reais gastos.

**Você merece isso!** 🏆

---

## 📞 Documentação Adicional

Se tiver dúvidas, veja:

- **DEPLOY_RAPIDO_RENDER.md** - Mais detalhado que isto
- **GUIA_DEPLOY_RENDER.md** - Explicações profundas
- **COMPARACAO_HOSPEDAGEM_GRATUITA.md** - Se quer outras opções
- **INDICE_HOSPEDAGEM.md** - Índice de todos documentos

---

**Estamos online! 🚀**

*Seu sucesso começa agora.*

---

**Timestamp**: 18 de janeiro de 2026  
**Status**: Em Produção  
**Custo**: Grátis  
**Tempo**: 15 minutos
