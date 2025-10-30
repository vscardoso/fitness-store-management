#  Guia de Inicialização - Fitness Store Management

##  Pré-requisitos

### Backend
- Python 3.11+
- pip (gerenciador de pacotes Python)
- SQLite (incluído no Python)

### Mobile
- Node.js 18+ e npm
- Expo CLI
- Expo Go app (para testar em dispositivo físico)
- Android Studio ou Xcode (opcional, para emuladores)

---

##  Configuração Inicial

### 🔧 IMPORTANTE: Configuração de Rede

Antes de começar, escolha como vai testar o app:

#### Opção 1: Emulador (Mais Simples)
- Use `localhost` ou `10.0.2.2` (Android)
- Não precisa de tunnel
- ✅ **Recomendado para desenvolvimento**

#### Opção 2: Dispositivo Físico na Mesma Rede
- Use o IP local da sua máquina (ex: `192.168.100.158`)
- Backend e celular devem estar na **mesma rede WiFi**
- Configure CORS no backend

#### Opção 3: Dispositivo Físico em Rede Diferente
- Use tunnel (localtunnel)
- Funciona em qualquer rede
- Mais lento e instável

---

### 1 Backend (API)

#### Passo 1: Navegar até a pasta do backend
```powershell
cd backend
```

#### Passo 2: Criar ambiente virtual
```powershell
python -m venv venv
```

#### Passo 3: Ativar o ambiente virtual
```powershell
# Windows PowerShell
.\venv\Scripts\Activate.ps1

# Se houver erro de execução de scripts, execute:
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

#### Passo 4: Instalar dependências
```powershell
pip install -r requirements.txt
```

#### Passo 5: Descobrir seu IP local (para dispositivo físico)
```powershell
ipconfig | Select-String "IPv4"
# Anote o IP da sua rede WiFi (ex: 192.168.100.158)
```

#### Passo 6: Configurar variáveis de ambiente
```powershell
# Copiar arquivo de exemplo
copy .env.example .env

# Editar .env (use notepad ou VS Code)
notepad .env
```

**Conteúdo do .env (escolha sua opção):**

**🟢 Opção 1 - Emulador (localhost):**
```env
# Database
DATABASE_URL=sqlite:///./fitness_store.db

# Security
SECRET_KEY=sua-chave-secreta-muito-segura-aqui-123456789
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# CORS - Emulador
CORS_ORIGINS=["http://localhost:8000","http://localhost:19006","http://10.0.2.2:8000"]

# App
APP_NAME=Fitness Store Management API
DEBUG=True
ENVIRONMENT=development
```

**🟡 Opção 2 - Dispositivo Físico (mesmo WiFi):**
```env
# Database
DATABASE_URL=sqlite:///./fitness_store.db

# Security
SECRET_KEY=sua-chave-secreta-muito-segura-aqui-123456789
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# CORS - Substitua 192.168.100.158 pelo SEU IP
CORS_ORIGINS=["http://localhost:8000","http://192.168.100.158:8000","http://192.168.100.158:8081","http://192.168.100.158:19006","exp://192.168.100.158:8081"]

# App
APP_NAME=Fitness Store Management API
DEBUG=True
ENVIRONMENT=development
```

**🔴 Opção 3 - Tunnel (qualquer rede):**
```env
# Database
DATABASE_URL=sqlite:///./fitness_store.db

# Security
SECRET_KEY=sua-chave-secreta-muito-segura-aqui-123456789
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# CORS - Adicione a URL do tunnel quando criar
CORS_ORIGINS=["http://localhost:8000","https://seu-tunnel.loca.lt"]

# App
APP_NAME=Fitness Store Management API
DEBUG=True
ENVIRONMENT=development
```

#### Passo 6: Criar banco de dados
```powershell
python recreate_db.py
```

#### Passo 7: Criar usuário administrador
```powershell
python create_user.py
```

**Preencha:**
- Email: admin@fitness.com
- Senha: admin123 (ou sua preferência)
- Nome: Administrador
- Role: admin

#### Passo 8: Criar categorias iniciais
```powershell
python create_categories.py
```

#### Passo 9: Iniciar servidor backend
```powershell
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

✅ **Backend rodando em:** http://localhost:8000  
📚 **Documentação da API:** http://localhost:8000/docs

---

### 2 Mobile (App)

**Abra um NOVO terminal PowerShell** (deixe o backend rodando)

#### Passo 1: Navegar até a pasta mobile
```powershell
cd mobile
```

#### Passo 2: Instalar dependências
```powershell
npm install
```

#### Passo 3: Configurar a URL da API
**⚠️ IMPORTANTE:** Edite o arquivo `mobile/constants/Config.ts` com a URL correta:

**🟢 Opção 1 - Emulador Android:**
```typescript
export const API_CONFIG = {
  BASE_URL: __DEV__ 
    ? 'http://10.0.2.2:8000/api/v1'  // ✅ Android Emulator
    : 'https://api.sualoja.com/api/v1',
  TIMEOUT: 30000,
};
```

**🟢 Opção 2 - Emulador iOS:**
```typescript
export const API_CONFIG = {
  BASE_URL: __DEV__ 
    ? 'http://localhost:8000/api/v1'  // ✅ iOS Simulator
    : 'https://api.sualoja.com/api/v1',
  TIMEOUT: 30000,
};
```

**🟡 Opção 3 - Dispositivo Físico (mesma rede WiFi):**
```typescript
export const API_CONFIG = {
  BASE_URL: __DEV__ 
    ? 'http://192.168.100.158:8000/api/v1'  // ✅ Substitua pelo SEU IP
    : 'https://api.sualoja.com/api/v1',
  TIMEOUT: 30000,
};
```

**🔴 Opção 4 - Tunnel (se não funcionar nada acima):**

**Terminal 3 - Criar tunnel:**
```powershell
# Instalar localtunnel globalmente (primeira vez)
npm install -g localtunnel

# Criar tunnel (deixe rodando)
lt --port 8000 --subdomain meu-fitness-app
# Anote a URL gerada (ex: https://meu-fitness-app.loca.lt)
```

**Atualizar Config.ts:**
```typescript
export const API_CONFIG = {
  BASE_URL: __DEV__ 
    ? 'https://meu-fitness-app.loca.lt/api/v1'  // ✅ URL do tunnel
    : 'https://api.sualoja.com/api/v1',
  TIMEOUT: 30000,
};
```

**⚠️ IMPORTANTE:** Sempre que usar tunnel:
1. Atualize o CORS no backend `.env` com a nova URL
2. Reinicie o backend para aplicar mudanças
3. Acesse a URL do tunnel no navegador e confirme o tunnel bypass

#### Passo 4: Iniciar o app
```powershell
npx expo start

# Ou com cache limpo se tiver problemas
npx expo start -c
```

#### Passo 5: Escolher onde rodar
- **a** - Android Emulator
- **i** - iOS Simulator (Mac)
- **w** - Web browser
- **QR Code** - Expo Go no celular (física device)

---

##  Primeiro Acesso

**Credenciais:**
- Email: admin@fitness.com
- Senha: admin123

---

##  Comandos Úteis

### Backend
```powershell
# Ativar ambiente
.\venv\Scripts\Activate.ps1

# Iniciar servidor
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Recriar banco ( apaga dados)
python recreate_db.py

# Listar usuários
python list_users.py
```

### Mobile
```powershell
# Iniciar
npx expo start

# Limpar cache
npx expo start -c

# Android
npx expo start --android
```

---

##  Problemas Comuns

### ❌ "Network Error" ou "Erro de conexão"

**Causa:** Mobile não consegue acessar o backend

**Solução passo a passo:**

1. **Verifique se o backend está rodando:**
```powershell
# Abra navegador em: http://localhost:8000/docs
# Se carregar a documentação → Backend OK ✅
```

2. **Descubra seu IP:**
```powershell
ipconfig | Select-String "IPv4"
# Anote o IP da sua rede WiFi (não o 172.x)
```

3. **Teste o backend pelo IP:**
```powershell
# Substitua pelo seu IP
# Abra navegador em: http://192.168.100.158:8000/docs
# Se carregar → Firewall OK ✅
```

4. **Se não carregar, libere o firewall:**
```powershell
# Execute como Administrador
New-NetFirewallRule -DisplayName "Python Backend" -Direction Inbound -Program "C:\Users\Victor\Desktop\fitness-store-management\backend\venv\Scripts\python.exe" -Action Allow
```

5. **Atualize o Config.ts com o IP correto:**
```typescript
// mobile/constants/Config.ts
BASE_URL: 'http://192.168.100.158:8000/api/v1'  // ✅ SEU IP
```

6. **Adicione o IP no CORS do backend:**
```env
# backend/.env
CORS_ORIGINS=["http://localhost:8000","http://192.168.100.158:8000","http://192.168.100.158:8081","http://192.168.100.158:19006","exp://192.168.100.158:8081"]
```

7. **Reinicie TUDO:**
```powershell
# Terminal 1 - Backend (Ctrl+C e reiniciar)
cd backend
.\venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Terminal 2 - Mobile (Ctrl+C e reiniciar)
cd mobile
npx expo start -c
```

### ❌ "Token inválido" ou "401 Unauthorized"

**Solução:**
```powershell
# No app mobile, faça logout e login novamente
# Ou limpe os dados do app no Expo Go
```

### ❌ Tunnel não funciona

**Causa:** Tunnel expirou ou mudou de URL

**Solução:**
1. No terminal do tunnel (Ctrl+C para parar)
2. Criar novo tunnel:
```powershell
lt --port 8000
# Anote a NOVA URL
```
3. Atualize `Config.ts` com a nova URL
4. Atualize `backend/.env` CORS com a nova URL
5. Reinicie backend e mobile

### ❌ Expo não abre

```powershell
# Limpar cache
npx expo start -c

# Se persistir, reinstalar dependências
rm -r node_modules
npm install
```

### ❌ Backend dá erro ao iniciar

```powershell
# Reativar ambiente virtual
cd backend
.\venv\Scripts\Activate.ps1

# Reinstalar dependências
pip install -r requirements.txt

# Verificar se banco existe
python recreate_db.py
```

---

##  Verificação

✅ **Use o script de verificação automática:**
```powershell
.\scripts\check-connection.ps1
```

Este script irá:
- ✅ Verificar se o backend está rodando
- ✅ Descobrir todos os IPs da sua máquina
- ✅ Testar conectividade em cada IP
- ✅ Verificar a URL configurada no mobile
- ✅ Mostrar configuração CORS do backend
- ✅ Dar recomendações de configuração

**Verificação manual:**

- [ ] Backend rodando (http://localhost:8000/docs abre)
- [ ] Banco criado (fitness_store.db existe)
- [ ] Usuário admin criado
- [ ] Categorias criadas
- [ ] Mobile rodando (QR code aparece)
- [ ] Config.ts atualizado com IP/URL correto
- [ ] CORS configurado no backend/.env
- [ ] Login funciona
- [ ] Dashboard carrega

---

##  Pronto!

**Backend:** http://localhost:8000
**Docs:** http://localhost:8000/docs
**Mobile:** Expo Go

**Bom desenvolvimento! **
