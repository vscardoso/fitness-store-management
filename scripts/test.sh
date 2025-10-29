#!/bin/bash

# Fitness Store Management - Test Runner
# Script para executar todos os testes do projeto

set -e

echo "🧪 Fitness Store Management - Test Suite"
echo "========================================="
echo ""

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

# Verificar se está no diretório correto
if [ ! -f "docker-compose.yml" ]; then
    print_error "Execute este script na raiz do projeto!"
    exit 1
fi

# ========================================
# TESTES DO BACKEND
# ========================================
echo ""
print_info "========================================="
print_info "Executando testes do Backend (Python)"
print_info "========================================="
echo ""

cd backend

# Verificar ambiente virtual
if [ ! -d "venv" ]; then
    print_error "Ambiente virtual não encontrado! Execute scripts/setup.sh primeiro"
    exit 1
fi

# Ativar ambiente virtual
source venv/bin/activate

# Verificar pytest
if ! command -v pytest &> /dev/null; then
    print_warning "pytest não encontrado. Instalando..."
    pip install pytest pytest-cov pytest-asyncio > /dev/null
fi

# Executar testes unitários
print_info "Executando testes unitários..."
if pytest tests/ -v --tb=short; then
    print_success "Testes unitários passaram!"
else
    print_error "Testes unitários falharam!"
    exit 1
fi

echo ""

# Executar testes com cobertura
print_info "Executando testes com cobertura..."
if pytest tests/ --cov=app --cov-report=term-missing --cov-report=html; then
    print_success "Relatório de cobertura gerado em htmlcov/"
else
    print_warning "Alguns testes falharam na análise de cobertura"
fi

echo ""

# Testes manuais da API
print_info "Executando testes manuais da API..."
if [ -f "test_api_endpoints.py" ]; then
    if python test_api_endpoints.py; then
        print_success "Testes manuais da API passaram!"
    else
        print_warning "Alguns testes manuais falharam (não crítico)"
    fi
fi

cd ..

# ========================================
# TESTES DO MOBILE (Se configurado)
# ========================================
echo ""
print_info "========================================="
print_info "Verificando testes do Mobile"
print_info "========================================="
echo ""

cd mobile

if [ -f "package.json" ]; then
    # Verificar se tem scripts de teste
    if grep -q "\"test\"" package.json; then
        print_info "Executando testes do mobile..."
        if npm test; then
            print_success "Testes do mobile passaram!"
        else
            print_warning "Alguns testes do mobile falharam"
        fi
    else
        print_warning "Nenhum teste configurado no mobile"
    fi
else
    print_warning "package.json não encontrado no mobile"
fi

cd ..

# ========================================
# LINTING E FORMATAÇÃO
# ========================================
echo ""
print_info "========================================="
print_info "Verificando qualidade de código"
print_info "========================================="
echo ""

cd backend

# Python - flake8
if command -v flake8 &> /dev/null; then
    print_info "Executando flake8 (linting Python)..."
    if flake8 app/ --count --select=E9,F63,F7,F82 --show-source --statistics; then
        print_success "Linting Python passou!"
    else
        print_warning "Problemas encontrados no linting Python"
    fi
else
    print_warning "flake8 não instalado (pip install flake8)"
fi

# Python - black (formatação)
if command -v black &> /dev/null; then
    print_info "Verificando formatação Python (black)..."
    if black --check app/ tests/; then
        print_success "Código Python está bem formatado!"
    else
        print_warning "Código Python precisa de formatação (execute: black app/ tests/)"
    fi
else
    print_warning "black não instalado (pip install black)"
fi

cd ..

# TypeScript/JavaScript - ESLint (se configurado)
cd mobile

if [ -f ".eslintrc.js" ] || [ -f ".eslintrc.json" ]; then
    if command -v eslint &> /dev/null; then
        print_info "Executando ESLint..."
        if npx eslint . --ext .ts,.tsx,.js,.jsx; then
            print_success "Linting TypeScript/JavaScript passou!"
        else
            print_warning "Problemas encontrados no linting TypeScript/JavaScript"
        fi
    fi
else
    print_warning "ESLint não configurado"
fi

cd ..

# ========================================
# RESUMO
# ========================================
echo ""
print_success "========================================="
print_success "Testes concluídos!"
print_success "========================================="
echo ""

print_info "📊 Relatórios gerados:"
echo "  • Cobertura: backend/htmlcov/index.html"
echo ""

print_info "🔧 Comandos úteis:"
echo "  • Backend tests: cd backend && pytest"
echo "  • Backend coverage: cd backend && pytest --cov=app"
echo "  • Backend linting: cd backend && flake8 app/"
echo "  • Format Python: cd backend && black app/ tests/"
echo ""

print_info "📚 Documentação:"
echo "  • API: http://localhost:8000/docs"
echo "  • Setup: docs/SETUP.md"
echo "  • Architecture: docs/ARCHITECTURE.md"
echo ""
