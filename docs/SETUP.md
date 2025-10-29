# Setup Guide - Fitness Store Management

## 📋 Índice

- [Pré-requisitos](#pré-requisitos)
- [Instalação](#instalação)
  - [Backend (FastAPI)](#backend-fastapi)
  - [Mobile (React Native)](#mobile-react-native)
- [Configuração](#configuração)
- [Executando o Projeto](#executando-o-projeto)
- [Testes](#testes)
- [Troubleshooting](#troubleshooting)

---

## 🔧 Pré-requisitos

### Backend
- **Python:** 3.11 ou superior
- **pip:** gerenciador de pacotes Python
- **SQLite:** banco de dados (já incluído no Python)

### Mobile
- **Node.js:** 18 ou superior
- **npm** ou **yarn:** gerenciador de pacotes
- **Expo CLI:** framework React Native
- **Android Studio** (para emulador Android) ou **Xcode** (para iOS/macOS)
- **Expo Go App** (para testar em dispositivo físico)

### Opcionais
- **Docker & Docker Compose:** para containerização
- **Git:** controle de versão
- **VS Code:** editor recomendado

---

## 📥 Instalação

### 1. Clonar o Repositório

```bash
git clone https://github.com/seu-usuario/fitness-store-management.git
cd fitness-store-management
```

---

## 🐍 Backend (FastAPI)

### 1. Criar Ambiente Virtual

**Windows:**
```powershell
cd backend
python -m venv venv
.\venv\Scripts\activate
```

**Linux/Mac:**
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
```

### 2. Instalar Dependências

```bash
pip install -r requirements.txt
```

### 3. Configurar Variáveis de Ambiente

Copie o arquivo de exemplo:

```bash
cp .env.example .env
```

Edite o arquivo `.env`:

```env
# Database
DATABASE_URL=sqlite+aiosqlite:///./fitness_store.db

# Security
SECRET_KEY=sua-chave-secreta-super-segura-aqui
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7

# CORS
BACKEND_CORS_ORIGINS=["http://localhost:19006", "exp://192.168.1.100:8081"]

# App
APP_NAME=Fitness Store API
DEBUG=True
```

### 4. Criar Banco de Dados

```bash
# Criar tabelas via Alembic
alembic upgrade head

# Ou usar script direto
python recreate_db.py
```

### 5. Criar Usuário Administrador

```bash
python create_user.py
```

**Credenciais padrão:**
- Email: `admin@fitnessstore.com`
- Senha: `admin123`

### 6. Criar Categorias Iniciais (Opcional)

```bash
python create_categories.py
```

### 7. Executar Backend

```bash
# Modo desenvolvimento (com hot reload)
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Ou simplesmente
uvicorn app.main:app --reload
```

**Backend rodando em:** `http://localhost:8000`

**Documentação da API:**
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

---

## 📱 Mobile (React Native)

### 1. Navegar para a pasta mobile

```bash
cd mobile
```

### 2. Instalar Dependências

```bash
npm install

# ou com yarn
yarn install
```

### 3. Configurar Variáveis de Ambiente

Copie o arquivo de exemplo:

```bash
cp .env.example .env
```

Edite o arquivo `.env`:

```env
# API Configuration
API_BASE_URL=http://localhost:8000/api/v1

# Para dispositivo físico, use o IP da sua máquina
# API_BASE_URL=http://192.168.1.100:8000/api/v1

# App Configuration
APP_NAME=Fitness Store
APP_VERSION=1.0.0
NODE_ENV=development
```

### 4. Atualizar Config.ts (se necessário)

Edite `mobile/constants/Config.ts`:

```typescript
export const API_CONFIG = {
  BASE_URL: __DEV__ 
    ? 'http://192.168.1.100:8000/api/v1'  // Troque pelo seu IP
    : 'https://api.fitnessstore.com/api/v1',
  TIMEOUT: 30000,
};
```

### 5. Executar Aplicativo

**Com Expo (Recomendado):**

```bash
npx expo start

# Ou em modo tunnel (para dispositivos em redes diferentes)
npx expo start --tunnel
```

**Opções:**
- Pressione `a` para abrir no emulador Android
- Pressione `i` para abrir no simulador iOS
- Escaneie o QR Code com o app **Expo Go** (dispositivo físico)

---

## 🐳 Usando Docker (Alternativa)

### 1. Build e Start

```bash
docker-compose up -d --build
```

### 2. Verificar Logs

```bash
docker-compose logs -f backend
```

### 3. Parar Containers

```bash
docker-compose down
```

**Serviços:**
- Backend: `http://localhost:8000`

---

## 🧪 Testes

### Backend

```bash
cd backend

# Executar todos os testes
pytest

# Com cobertura
pytest --cov=app --cov-report=html

# Teste específico
pytest tests/test_products.py

# Ver relatório de cobertura
open htmlcov/index.html
```

### Testes Manuais da API

```bash
# Teste simples dos repositórios
python test_simple_repos.py

# Teste completo do sistema
python test_complete_system.py

# Teste dos endpoints da API
python test_api_endpoints.py
```

---

## 🌐 Acessando de Dispositivo Físico

### Opção 1: Mesma Rede Wi-Fi

1. Descubra o IP da sua máquina:

**Windows:**
```powershell
ipconfig
# Procure por "Endereço IPv4" (ex: 192.168.1.100)
```

**Linux/Mac:**
```bash
ifconfig
# ou
ip addr show
```

2. Inicie o backend com `--host 0.0.0.0`:

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

3. Atualize a URL no mobile para usar o IP:

```typescript
// mobile/constants/Config.ts
BASE_URL: 'http://192.168.1.100:8000/api/v1'
```

4. Inicie o Expo e escaneie o QR Code

### Opção 2: Localtunnel (Redes Diferentes)

**Terminal 1 - Backend:**
```bash
cd backend
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Terminal 2 - Tunnel:**
```bash
npx localtunnel --port 8000
```

**Output:**
```
your url is: https://seu-tunnel.loca.lt
```

**Atualizar Config no Mobile:**
```typescript
BASE_URL: 'https://seu-tunnel.loca.lt/api/v1'
```

**Terminal 3 - Mobile:**
```bash
cd mobile
npx expo start --tunnel
```

---

## 🔍 Verificação de Instalação

### Backend

Teste o endpoint de health check:

```bash
curl http://localhost:8000/api/v1/health
```

Ou abra no navegador:
```
http://localhost:8000/docs
```

### Mobile

O aplicativo deve:
1. ✅ Abrir a tela de login
2. ✅ Conectar ao backend
3. ✅ Permitir login com credenciais padrão

---

## 🛠 Troubleshooting

### Backend não inicia

**Erro: "ModuleNotFoundError"**
```bash
# Reinstalar dependências
pip install -r requirements.txt
```

**Erro: "Port 8000 already in use"**
```bash
# Windows
netstat -ano | findstr :8000
taskkill /PID <PID> /F

# Linux/Mac
lsof -ti:8000 | xargs kill -9
```

### Mobile não conecta ao backend

**1. Verificar se o backend está rodando:**
```bash
curl http://localhost:8000/api/v1/health
```

**2. Verificar URL no Config.ts:**
- Usar IP da máquina (não localhost)
- Backend deve estar com `--host 0.0.0.0`

**3. Verificar firewall:**
- Permitir conexões na porta 8000

**4. Limpar cache do Expo:**
```bash
npx expo start -c
```

### Erros de CORS

Adicione a origem do mobile no `.env` do backend:

```env
BACKEND_CORS_ORIGINS=["http://localhost:19006", "exp://192.168.1.100:8081"]
```

### Banco de dados corrompido

```bash
cd backend
rm fitness_store.db
python recreate_db.py
python create_user.py
```

### Problemas com Expo

```bash
# Limpar cache
npx expo start -c

# Reinstalar node_modules
rm -rf node_modules
npm install

# Atualizar Expo
npm install expo@latest
```

---

## 📚 Recursos Adicionais

- [FastAPI Docs](https://fastapi.tiangolo.com/)
- [React Native Docs](https://reactnative.dev/)
- [Expo Docs](https://docs.expo.dev/)
- [SQLAlchemy Docs](https://docs.sqlalchemy.org/)
- [React Query Docs](https://tanstack.com/query/latest)

---

## 🆘 Suporte

Se encontrar problemas:

1. Verifique os logs do backend e mobile
2. Consulte a seção [Troubleshooting](#troubleshooting)
3. Abra uma issue no GitHub
4. Entre em contato com a equipe de desenvolvimento

---

## ✅ Checklist de Instalação

- [ ] Python 3.11+ instalado
- [ ] Node.js 18+ instalado
- [ ] Dependências do backend instaladas
- [ ] Dependências do mobile instaladas
- [ ] Arquivo .env configurado no backend
- [ ] Arquivo .env configurado no mobile
- [ ] Banco de dados criado
- [ ] Usuário admin criado
- [ ] Backend rodando em http://localhost:8000
- [ ] API acessível (testar /docs)
- [ ] Mobile conectando ao backend
- [ ] Login funcionando
- [ ] Dashboard carregando dados

🎉 **Pronto! Seu ambiente está configurado!**
