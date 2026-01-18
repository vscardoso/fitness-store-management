# 🚀 Deploy em Produção GRÁTIS - Instruções Diretas

**Tempo Total**: 15 minutos | **Custo**: R$ 0,00

---

## ⚡ Versão Ultra-Rápida (5 passos)

### 1️⃣ Atualizar Config Mobile

Edite `mobile/constants/Config.ts`:

```typescript
// ANTES:
export const BASE_URL = 'http://localhost:8000/api/v1';

// DEPOIS:
export const BASE_URL = 'https://seu-backend-render.onrender.com/api/v1';
// Trocar "seu-backend" pelo nome do seu serviço
```

### 2️⃣ Fazer Push no GitHub

```powershell
cd C:\Users\Victor\Desktop\fitness-store-management
git add -A
git commit -m "deploy: prepare for production on Render"
git push origin main
```

### 3️⃣ Criar Serviço no Render

1. Acesse: https://render.com
2. Clique: **New Web Service**
3. Selecione seu repo: `fitness-store-management`
4. Preencha:
   - **Name**: `fitness-backend`
   - **Environment**: `Docker`
   - **Dockerfile**: `backend/Dockerfile` ✅ (já existe!)
5. Clique: **Advanced** e adicione variáveis:

```
SECRET_KEY=seu_secret_aleatorio_20_chars_minimo
CORS_ORIGINS=https://expo.dev,https://*.expo.dev,https://seu-backend-render.onrender.com
```

6. Clique: **Deploy** e aguarde 3-5 min

### 4️⃣ Adicionar Database PostgreSQL

1. No Render: **New PostgreSQL**
2. Preencha:
   - **Name**: `fitness-db`
   - **Region**: São Paulo (mesmo do backend!)
   - **Plan**: **Free**
3. Clique: **Create Database** e copie a connection string

### 5️⃣ Conectar Database ao Backend

1. Vá ao seu serviço `fitness-backend`
2. **Environment** > Adicione:
```
DATABASE_URL=postgresql+asyncpg://seu_user:password@host:5432/dbname
```
3. Salve > Render vai redeploy automaticamente

✅ **PRONTO! Seu backend está online!**

---

## ✅ Validar Deploy

### Teste URL
Abra no navegador:
```
https://seu-backend-render.onrender.com/docs
```

Deve aparecer o Swagger UI! 🎉

### Inicializar Database

No dashboard do Render, clique em seu backend > **Shell**:

```bash
# Aplicar migrations
alembic upgrade head

# Criar admin
python create_user.py

# Criar categorias
python create_categories.py
```

### Testar Autenticação

```bash
curl -X POST "https://seu-backend-render.onrender.com/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@fitness.com","password":"admin123"}'
```

Resposta deve ser:
```json
{
  "access_token": "eyJ0eXAi...",
  "token_type": "bearer"
}
```

✅ **Seu backend está 100% funcional!**

---

## 📱 Publicar Mobile

### Opção A: Apenas publicar no Expo Go (recomendado para v1)

```bash
cd mobile
npx expo publish
```

Qualquer um pode escanear QR e usar o app!

### Opção B: Publicar em App Store/Play Store

```bash
# Instale EAS CLI
npm install -g eas-cli
eas login

# Build para Android
eas build --platform android

# Build para iOS (requer Mac)
eas build --platform ios
```

---

## 🔍 Troubleshooting Rápido

| Problema | Solução |
|----------|---------|
| **502 Bad Gateway** | Checar logs (Render dashboard > Logs) |
| **CORS Error** | Adicionar origem em `CORS_ORIGINS` |
| **Database erro** | Verificar `DATABASE_URL` e status do PostgreSQL |
| **Timeout** | Free tier é lento, considere atualizar |
| **Serviço adormeceu** | Normal no free tier, acorda ao receber request |

---

## 💡 Próximas Melhorias (Opcional)

- [ ] Implementar monitoramento (Sentry)
- [ ] Adicionar rate limiting
- [ ] Configurar backups automáticos
- [ ] Implementar caching (Redis)
- [ ] Upgrade para plano pago quando crescer

---

## 📊 Status Atual

| Componente | Status | Local |
|-----------|--------|-------|
| Backend | ✅ Rodando | `https://seu-backend-render.onrender.com` |
| Database | ✅ Conectado | PostgreSQL (Render) |
| Mobile | ✅ Pronto | Expo Go |
| **CUSTO** | **✅ GRÁTIS** | **R$ 0,00/mês** |

---

## 🎯 Você está em PRODUÇÃO! 🎉

Seu app Fitness Store Management está online e funcionando!

**Próximo**: Convide alguns usuários para testar e receba feedback.

---

*Setup completo em 15 minutos | Zero custo inicial*
