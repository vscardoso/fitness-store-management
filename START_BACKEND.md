# 🚀 Como Iniciar o Backend

## ✅ BACKEND ESTÁ FUNCIONANDO AGORA!

O backend está rodando em **http://localhost:8000**

---

## 📋 O que foi corrigido:

1. ✅ **Instalada dependência faltante:** `apscheduler==3.10.4`
2. ✅ **Processo anterior na porta 8000 foi morto**
3. ✅ **Backend iniciado com sucesso**

---

## 🔄 Para iniciar o backend novamente (quando reiniciar o computador):

### PowerShell (Recomendado):

```powershell
cd backend
.\venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### CMD:

```cmd
cd backend
venv\Scripts\activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

---

## 🌐 URLs de Acesso:

- **API Docs (Swagger):** http://localhost:8000/api/docs
- **ReDoc:** http://localhost:8000/api/redoc
- **OpenAPI JSON:** http://localhost:8000/api/openapi.json

---

## 📱 Para conectar o mobile:

### 1. Descubra o IP da sua máquina:

**PowerShell:**
```powershell
Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.*'} | Select-Object IPAddress
```

**CMD:**
```cmd
ipconfig
```
(Procure por "Adaptador Wi-Fi" → "Endereço IPv4")

### 2. Atualize o mobile:

Edite `mobile/constants/Config.ts`:

```typescript
const API_BASE_URL = 'http://SEU_IP_AQUI:8000/api/v1';
```

Exemplo:
```typescript
const API_BASE_URL = 'http://192.168.1.100:8000/api/v1';
```

### 3. Adicione o IP ao CORS:

Edite `backend/.env` e adicione seu IP às origens permitidas:

```env
CORS_ORIGINS=["http://localhost:3000",...,"http://SEU_IP:8081","exp://SEU_IP:8081"]
```

### 4. Verifique o Firewall do Windows:

Se o mobile ainda não conectar, pode ser o firewall bloqueando. Execute como administrador:

```powershell
New-NetFirewallRule -DisplayName "FastAPI Dev Server" -Direction Inbound -LocalPort 8000 -Protocol TCP -Action Allow
```

---

## ✅ Verificar se está rodando:

```powershell
curl http://localhost:8000/api/docs
```

Deve retornar HTML do Swagger UI.

---

## 🛑 Parar o backend:

No terminal onde está rodando, pressione: **Ctrl+C**

---

## 🐛 Troubleshooting:

### Erro: "Port 8000 already in use"

```powershell
# Encontrar processo:
netstat -ano | findstr :8000

# Matar processo (substitua PID pelo número encontrado):
taskkill /F /PID <PID>
```

### Erro: "ModuleNotFoundError"

```powershell
cd backend
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

---

**Status atual:** ✅ Backend rodando perfeitamente em http://localhost:8000
