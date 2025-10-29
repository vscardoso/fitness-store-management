<p align="center">
  <img src="https://img.shields.io/badge/Python-3.11+-blue.svg" alt="Python">
  <img src="https://img.shields.io/badge/FastAPI-0.104+-green.svg" alt="FastAPI">
  <img src="https://img.shields.io/badge/React%20Native-0.72+-61DAFB.svg" alt="React Native">
  <img src="https://img.shields.io/badge/Expo-SDK%2054-000020.svg" alt="Expo">
  <img src="https://img.shields.io/badge/TypeScript-5.0+-blue.svg" alt="TypeScript">
  <img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License">
</p>

<h1 align="center">🏋️ Fitness Store Management System</h1>

<p align="center">
  <strong>Sistema completo de gestão para lojas de artigos esportivos</strong><br>
  Backend Python FastAPI + Mobile React Native com Expo
</p>

<p align="center">
  <a href="#-sobre">Sobre</a> •
  <a href="#-funcionalidades">Funcionalidades</a> •
  <a href="#-tecnologias">Tecnologias</a> •
  <a href="#-instalação">Instalação</a> •
  <a href="#-documentação">Documentação</a> •
  <a href="#-screenshots">Screenshots</a> •
  <a href="#-licença">Licença</a>
</p>

---

## 📋 Sobre

O **Fitness Store Management** é um sistema completo de gestão desenvolvido especificamente para lojas de artigos esportivos e fitness. Oferece controle total sobre produtos, estoque, vendas e clientes através de um aplicativo mobile moderno e intuitivo.

### ✨ Destaques

- 📱 **App Mobile Nativo** com React Native e Expo
- 🚀 **API REST Assíncrona** com FastAPI (Python)
- 🎨 **Interface Moderna** com Material Design 3
- 🔐 **Autenticação Segura** com JWT
- 📊 **Dashboard com Métricas** em tempo real
- 💾 **Soft Delete** para auditoria de dados
- 🔄 **Pull-to-Refresh** em todas as telas
- 📱 **Funciona Offline** (em desenvolvimento)

---

## 🎯 Funcionalidades

### Produtos
- ✅ CRUD completo de produtos
- ✅ Busca e filtros avançados (nome, SKU, categoria, marca)
- ✅ Gestão de categorias
- ✅ Controle de preços (custo e venda)
- ✅ Cálculo automático de margem de lucro
- ✅ Cadastro de códigos (SKU e código de barras)
- ✅ Soft delete (exclusão lógica)

### Estoque
- ✅ Controle de inventário por produto
- ✅ Movimentações de entrada e saída
- ✅ Histórico de movimentações
- ✅ Alertas de estoque baixo
- ✅ Estoque mínimo configurável
- ✅ Relatórios de estoque

### Dashboard
- ✅ Total de produtos cadastrados
- ✅ Valor total do estoque
- ✅ Ganhos potenciais (lucro estimado)
- ✅ Produtos com estoque baixo
- ✅ Total de vendas
- ✅ Número de clientes
- ✅ Métricas atualizadas em tempo real

### Vendas
- 🚧 PDV (Ponto de Venda) - em desenvolvimento
- 🚧 Carrinho de compras
- 🚧 Múltiplas formas de pagamento
- 🚧 Emissão de cupom fiscal
- 🚧 Histórico de vendas

### Clientes
- ✅ Cadastro de clientes
- ✅ Histórico de compras
- ✅ Busca e filtros
- ✅ Gestão de dados pessoais

### Autenticação
- ✅ Login com email e senha
- ✅ JWT com refresh tokens
- ✅ Controle de sessão
- ✅ Logout seguro

---

## 🛠 Tecnologias

### Backend (API)

| Tecnologia | Versão | Descrição |
|-----------|--------|-----------|
| Python | 3.11+ | Linguagem principal |
| FastAPI | 0.104+ | Framework web assíncrono |
| SQLAlchemy | 2.0+ | ORM com suporte async |
| SQLite | - | Banco de dados (dev) |
| PostgreSQL | 15+ | Banco de dados (prod) |
| Pydantic | 2.0+ | Validação de dados |
| JWT | - | Autenticação |
| Alembic | - | Migrations de banco |
| Pytest | - | Testes unitários |
| Uvicorn | - | ASGI server |

### Mobile (App Principal)

| Tecnologia | Versão | Descrição |
|-----------|--------|-----------|
| React Native | 0.72+ | Framework mobile |
| Expo | SDK 54 | Plataforma de desenvolvimento |
| TypeScript | 5.0+ | Tipagem estática |
| React Query | 5.0+ | Gerenciamento de estado do servidor |
| Zustand | 4.0+ | Gerenciamento de estado local |
| React Native Paper | 5.0+ | Componentes Material Design |
| Expo Router | 3.0+ | Navegação file-based |
| Axios | - | Cliente HTTP |

### DevOps & Tools

- **Docker & Docker Compose:** Containerização
- **Git:** Controle de versão
- **GitHub Actions:** CI/CD
- **Localtunnel:** Teste em dispositivos físicos
- **ESLint & Prettier:** Code quality
- **Black & Flake8:** Python linting

---

## 📦 Estrutura do Projeto

```
fitness-store-management/
│
├── backend/                    # 🐍 API Python FastAPI
│   ├── app/
│   │   ├── api/v1/            # Endpoints REST
│   │   ├── core/              # Config, database, security
│   │   ├── models/            # SQLAlchemy models
│   │   ├── schemas/           # Pydantic schemas
│   │   ├── repositories/      # Repository pattern
│   │   ├── services/          # Business logic
│   │   └── main.py            # Application entry
│   ├── tests/                 # Unit & integration tests
│   ├── alembic/               # Database migrations
│   ├── requirements.txt       # Python dependencies
│   ├── Dockerfile             # Docker build
│   └── .env.example           # Environment template
│
├── mobile/                     # 📱 React Native (APP PRINCIPAL)
│   ├── app/                   # Expo Router (screens)
│   │   ├── (auth)/           # Login screens
│   │   ├── (tabs)/           # Main app with tabs
│   │   └── products/         # Product screens
│   ├── components/            # Reusable components
│   ├── services/              # API clients
│   ├── store/                 # Zustand stores
│   ├── hooks/                 # Custom React hooks
│   ├── types/                 # TypeScript types
│   ├── utils/                 # Utilities
│   ├── constants/             # App constants
│   ├── package.json
│   └── .env.example
│
├── docs/                       # 📚 Documentation
│   ├── API.md                 # API endpoints reference
│   ├── SETUP.md               # Setup guide
│   ├── ARCHITECTURE.md        # Architecture documentation
│   └── screenshots/           # App screenshots
│
├── scripts/                    # 🛠 Utility scripts
│   ├── setup.sh               # Setup automation
│   ├── seed_db.py             # Seed database with data
│   └── test.sh                # Test runner
│
├── .github/workflows/          # 🤖 CI/CD
│   ├── backend-tests.yml      # Backend CI
│   └── mobile-tests.yml       # Mobile CI
│
├── docker-compose.yml          # Docker orchestration
├── .gitignore                  # Git ignore rules
├── README.md                   # This file
├── LICENSE                     # MIT License
└── CHANGELOG.md                # Version history
```

---

## 🚀 Instalação

### Opção 1: Setup Automático (Recomendado)

```bash
# Clone o repositório
git clone https://github.com/seu-usuario/fitness-store-management.git
cd fitness-store-management

# Execute o script de setup (Linux/Mac)
chmod +x scripts/setup.sh
./scripts/setup.sh

# Siga as instruções na tela
```

### Opção 2: Setup Manual

#### 1️⃣ Backend

```bash
cd backend

# Criar ambiente virtual
python -m venv venv

# Ativar ambiente virtual
# Windows:
venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

# Instalar dependências
pip install -r requirements.txt

# Configurar ambiente
cp .env.example .env
# Edite o arquivo .env

# Criar banco de dados
python recreate_db.py

# Criar usuário admin
python create_user.py

# Criar categorias
python create_categories.py

# Iniciar backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Backend rodando em:** `http://localhost:8000`

#### 2️⃣ Mobile

```bash
cd mobile

# Instalar dependências
npm install

# Configurar ambiente
cp .env.example .env
# Edite o arquivo .env

# Iniciar app
npx expo start

# Opções:
# a - Android emulator
# i - iOS simulator
# Scan QR - Expo Go app (device)
```

### 📱 Testando em Dispositivo Físico

**Usando Localtunnel:**

```bash
# Terminal 1 - Backend
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Terminal 2 - Tunnel
npx localtunnel --port 8000
# Copie a URL gerada (ex: https://seu-tunnel.loca.lt)

# Terminal 3 - Mobile
cd mobile
# Atualize constants/Config.ts com a URL do tunnel
npx expo start --tunnel
```

---

## 📚 Documentação

- **[Setup Guide](docs/SETUP.md)** - Guia completo de instalação
- **[API Documentation](docs/API.md)** - Referência da API REST
- **[Architecture](docs/ARCHITECTURE.md)** - Arquitetura do sistema
- **[Swagger UI](http://localhost:8000/docs)** - API interativa (backend rodando)
- **[ReDoc](http://localhost:8000/redoc)** - Documentação alternativa

---

## 📸 Screenshots

<p align="center">
  <em>Screenshots do aplicativo em breve...</em><br>
  <sub>Veja a pasta <a href="docs/screenshots/">docs/screenshots/</a> para capturas de tela</sub>
</p>

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

# Ver relatório
open htmlcov/index.html
```

### Script de Teste Completo

```bash
# Linux/Mac
./scripts/test.sh

# Executa:
# - Testes unitários
# - Análise de cobertura
# - Linting (flake8, black)
# - Type checking (mypy)
```

---

## 🔐 Segurança

- ✅ Senhas hasheadas com **bcrypt**
- ✅ Autenticação **JWT** (access + refresh tokens)
- ✅ **CORS** configurado adequadamente
- ✅ Validação de dados com **Pydantic**
- ✅ Proteção contra **SQL Injection** (SQLAlchemy)
- ✅ **Soft delete** para auditoria
- ✅ **HTTPS** obrigatório em produção

---

## 🗺 Roadmap

### ✅ Concluído (v1.0.0)

- [x] Backend API com FastAPI
- [x] Autenticação JWT
- [x] CRUD de produtos completo
- [x] Controle de estoque
- [x] Mobile app com Expo
- [x] Dashboard com métricas
- [x] Pull-to-refresh
- [x] Soft delete
- [x] Documentação completa

### 🚧 Em Desenvolvimento

- [ ] Sistema de vendas (PDV)
- [ ] Carrinho de compras
- [ ] Checkout completo
- [ ] Impressão de cupom
- [ ] Relatórios PDF

### 🔮 Futuro

- [ ] Sincronização offline
- [ ] Múltiplos estoques (warehouse)
- [ ] Dashboard web administrativo
- [ ] Integrações com pagamentos
- [ ] App para iOS (App Store)
- [ ] Notificações push
- [ ] Backup automático
- [ ] IA para previsão de demanda

---

## 🤝 Contribuindo

Contribuições são bem-vindas! Veja como ajudar:

1. Fork o projeto
2. Crie uma branch para sua feature (`git checkout -b feature/NovaFuncionalidade`)
3. Commit suas mudanças (`git commit -m 'feat: adiciona nova funcionalidade'`)
4. Push para a branch (`git push origin feature/NovaFuncionalidade`)
5. Abra um Pull Request

### Padrões de Commit

Seguimos o [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: nova funcionalidade
fix: correção de bug
docs: documentação
style: formatação
refactor: refatoração
test: testes
chore: tarefas gerais
```

---

## 📄 Licença

Este projeto está sob a licença **MIT**. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

---

## 👨‍💻 Autor

**Victor**

- 📧 Email: [seu-email@example.com](mailto:seu-email@example.com)
- 🐙 GitHub: [@seu-usuario](https://github.com/seu-usuario)

---

## 🙏 Agradecimentos

- [FastAPI](https://fastapi.tiangolo.com/) - Framework incrível
- [Expo](https://expo.dev/) - Plataforma React Native
- [React Native Paper](https://reactnativepaper.com/) - Componentes Material Design
- Comunidade open source 💙

---

## 📊 Status do Projeto

**Status:** ✅ **Versão 1.0.0 Lançada!**

- Backend: ✅ Estável
- Mobile: ✅ Estável  
- Vendas (PDV): 🚧 Em desenvolvimento
- Documentação: ✅ Completa

---

<p align="center">
  <sub>Desenvolvido com ❤️ para a comunidade fitness</sub>
</p>

<p align="center">
  <a href="#-sobre">⬆ Voltar ao topo</a>
</p>
