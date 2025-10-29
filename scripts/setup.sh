#!/bin/bash

echo "🏋️ Fitness Store - Setup Automático"
echo "===================================="
echo ""

# Cores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

set -e  # Exit on error

# ============================================
# VERIFICAÇÕES DE PRÉ-REQUISITOS
# ============================================

echo "🔍 Verificando pré-requisitos..."
echo ""

# Verificar Python
echo "🐍 Verificando Python..."
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}❌ Python 3 não encontrado. Instale: https://python.org${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Python $(python3 --version)${NC}"

# Verificar Node.js
echo "📱 Verificando Node.js..."
if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}⚠️  Node.js não encontrado (necessário para mobile)${NC}"
    echo "   Instale: https://nodejs.org"
    SKIP_MOBILE=true
else
    echo -e "${GREEN}✅ Node.js $(node -v)${NC}"
    SKIP_MOBILE=false
fi

# Verificar npm
if [ "$SKIP_MOBILE" = false ]; then
    echo "📦 Verificando npm..."
    if ! command -v npm &> /dev/null; then
        echo -e "${YELLOW}⚠️  npm não encontrado${NC}"
        SKIP_MOBILE=true
    else
        echo -e "${GREEN}✅ npm $(npm -v)${NC}"
    fi
fi

# Verificar Docker (opcional)
echo "🐳 Verificando Docker..."
if command -v docker &> /dev/null; then
    echo -e "${GREEN}✅ Docker $(docker --version)${NC}"
    HAS_DOCKER=true
else
    echo -e "${YELLOW}⚠️  Docker não encontrado (opcional)${NC}"
    HAS_DOCKER=false
fi

# Verificar Docker Compose (opcional)
if [ "$HAS_DOCKER" = true ]; then
    echo "📦 Verificando Docker Compose..."
    if command -v docker-compose &> /dev/null; then
        echo -e "${GREEN}✅ Docker Compose $(docker-compose --version)${NC}"
        HAS_DOCKER_COMPOSE=true
    else
        echo -e "${YELLOW}⚠️  Docker Compose não encontrado${NC}"
        HAS_DOCKER_COMPOSE=false
    fi
fi

echo ""
echo -e "${GREEN}================================================${NC}"
echo -e "${GREEN}Todos os pré-requisitos verificados!${NC}"
echo -e "${GREEN}================================================${NC}"
echo ""

# ============================================
# SETUP DO BACKEND
# ============================================

echo "🐍 CONFIGURANDO BACKEND"
echo "============================================"
echo ""

cd backend

# Criar ambiente virtual
if [ ! -d "venv" ]; then
    echo "📦 Criando ambiente virtual..."
    python3 -m venv venv
    echo -e "${GREEN}✅ Ambiente virtual criado${NC}"
else
    echo -e "${YELLOW}⚠️  Ambiente virtual já existe${NC}"
fi

# Ativar ambiente virtual
echo "🔌 Ativando ambiente virtual..."
source venv/bin/activate

# Instalar dependências
echo "📥 Instalando dependências do backend..."
pip install --upgrade pip > /dev/null
pip install -r requirements.txt > /dev/null
echo -e "${GREEN}✅ Dependências instaladas${NC}"

# Criar .env
if [ ! -f ".env" ]; then
    echo "🔧 Criando arquivo .env do backend..."
    cp .env.example .env
    echo -e "${GREEN}✅ backend/.env criado${NC}"
    echo -e "${YELLOW}⚠️  Edite backend/.env se necessário${NC}"
else
    echo -e "${YELLOW}⚠️  backend/.env já existe${NC}"
fi

# Criar banco de dados
if [ ! -f "fitness_store.db" ]; then
    echo "🗄️  Criando banco de dados..."
    python recreate_db.py > /dev/null 2>&1
    echo -e "${GREEN}✅ Banco de dados criado${NC}"
else
    echo -e "${YELLOW}⚠️  Banco de dados já existe${NC}"
fi

# Criar usuário admin
echo "👤 Criando usuário administrador..."
python create_user.py > /dev/null 2>&1 || true
echo -e "${GREEN}✅ Usuário admin criado${NC}"
echo "   Email: admin@fitnessstore.com"
echo "   Senha: admin123"

# Criar categorias
echo "📁 Criando categorias iniciais..."
if [ -f "create_categories.py" ]; then
    python create_categories.py > /dev/null 2>&1 || true
    echo -e "${GREEN}✅ Categorias criadas${NC}"
fi

cd ..

echo ""
echo -e "${GREEN}✅ Backend configurado com sucesso!${NC}"
echo ""

# ============================================
# SETUP DO MOBILE
# ============================================

if [ "$SKIP_MOBILE" = false ]; then
    echo "📱 CONFIGURANDO MOBILE"
    echo "============================================"
    echo ""
    
    cd mobile
    
    # Instalar dependências
    echo "📥 Instalando dependências do mobile (pode demorar)..."
    npm install > /dev/null 2>&1
    echo -e "${GREEN}✅ Dependências instaladas${NC}"
    
    # Criar .env
    if [ ! -f ".env" ]; then
        echo "🔧 Criando arquivo .env do mobile..."
        
        # Detectar IP automaticamente
        if [[ "$OSTYPE" == "darwin"* ]]; then
            # macOS
            IP=$(ipconfig getifaddr en0 2>/dev/null || echo "192.168.1.100")
        elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
            # Linux
            IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "192.168.1.100")
        else
            # Fallback
            IP="192.168.1.100"
        fi
        
        cp .env.example .env
        
        # Substituir IP no arquivo
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "s/192.168.1.100/$IP/g" .env
        else
            sed -i "s/192.168.1.100/$IP/g" .env
        fi
        
        echo -e "${GREEN}✅ mobile/.env criado com IP: $IP${NC}"
        echo -e "${YELLOW}⚠️  Verifique se o IP está correto em mobile/.env${NC}"
    else
        echo -e "${YELLOW}⚠️  mobile/.env já existe${NC}"
    fi
    
    cd ..
    
    echo ""
    echo -e "${GREEN}✅ Mobile configurado com sucesso!${NC}"
    echo ""
fi

# ============================================
# DOCKER (OPCIONAL)
# ============================================

if [ "$HAS_DOCKER_COMPOSE" = true ]; then
    echo ""
    echo "🐳 Deseja iniciar os containers Docker? (s/n)"
    read -r start_docker
    
    if [ "$start_docker" = "s" ] || [ "$start_docker" = "S" ]; then
        echo "🚀 Iniciando containers Docker..."
        docker-compose up -d
        
        echo "⏳ Aguardando serviços iniciarem..."
        sleep 5
        
        echo -e "${GREEN}✅ Containers Docker iniciados${NC}"
        echo ""
        echo "🌐 Serviços Docker:"
        echo "  PostgreSQL: localhost:5432"
        echo "  Redis: localhost:6379"
    fi
fi

# ============================================
# RESUMO FINAL
# ============================================

echo ""
echo -e "${GREEN}================================================${NC}"
echo -e "${GREEN}✅ SETUP CONCLUÍDO COM SUCESSO!${NC}"
echo -e "${GREEN}================================================${NC}"
echo ""
echo "📝 Próximos passos:"
echo ""
echo "1️⃣  Editar arquivos .env (se necessário):"
echo "   - backend/.env"
if [ "$SKIP_MOBILE" = false ]; then
    echo "   - mobile/.env"
fi
echo ""
echo "2️⃣  Iniciar o backend:"
echo "   cd backend"
echo "   source venv/bin/activate"
echo "   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"
echo ""
if [ "$SKIP_MOBILE" = false ]; then
    echo "3️⃣  Em outro terminal, iniciar o mobile:"
    echo "   cd mobile"
    echo "   npx expo start"
    echo "   (Pressione 'a' para Android, 'i' para iOS)"
    echo ""
fi
echo "📚 Documentação:"
echo "   API: http://localhost:8000/docs"
echo "   Setup: docs/SETUP.md"
echo "   Arquitetura: docs/ARCHITECTURE.md"
echo ""
echo "🔐 Credenciais padrão:"
echo "   Email: admin@fitnessstore.com"
echo "   Senha: admin123"
echo ""
if [ "$HAS_DOCKER_COMPOSE" = true ]; then
    echo "🛑 Para parar containers Docker:"
    echo "   docker-compose down"
    echo ""
fi
echo -e "${GREEN}Bom desenvolvimento! 🚀${NC}"
echo ""
