# Fitness Store - Setup Automatico (Windows PowerShell)
# Execute: .\scripts\setup.ps1

Write-Host "Fitness Store - Setup Automatico" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""

# Verificacoes de Pre-requisitos
Write-Host "Verificando pre-requisitos..." -ForegroundColor Yellow
Write-Host ""

# Verificar Python
Write-Host "Verificando Python..." -ForegroundColor Cyan
if (!(Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host "Erro: Python 3 nao encontrado. Instale: https://python.org" -ForegroundColor Red
    exit 1
}
$pythonVersion = python --version
Write-Host "OK: $pythonVersion" -ForegroundColor Green

# Verificar Node.js
Write-Host "Verificando Node.js..." -ForegroundColor Cyan
$skipMobile = $false
if (!(Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Aviso: Node.js nao encontrado (necessario para mobile)" -ForegroundColor Yellow
    Write-Host "   Instale: https://nodejs.org" -ForegroundColor Yellow
    $skipMobile = $true
} else {
    $nodeVersion = node --version
    Write-Host "OK: Node.js $nodeVersion" -ForegroundColor Green
}

# Verificar npm
if (!$skipMobile) {
    Write-Host "Verificando npm..." -ForegroundColor Cyan
    if (!(Get-Command npm -ErrorAction SilentlyContinue)) {
        Write-Host "Aviso: npm nao encontrado" -ForegroundColor Yellow
        $skipMobile = $true
    } else {
        $npmVersion = npm --version
        Write-Host "OK: npm $npmVersion" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Green
Write-Host "Todos os pre-requisitos verificados!" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Green
Write-Host ""

# Setup do Backend
Write-Host "CONFIGURANDO BACKEND" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

Set-Location backend

# Criar ambiente virtual
if (!(Test-Path "venv")) {
    Write-Host "Criando ambiente virtual..." -ForegroundColor Cyan
    python -m venv venv
    Write-Host "OK: Ambiente virtual criado" -ForegroundColor Green
} else {
    Write-Host "Aviso: Ambiente virtual ja existe" -ForegroundColor Yellow
}

# Ativar ambiente virtual
Write-Host "Ativando ambiente virtual..." -ForegroundColor Cyan
& .\venv\Scripts\Activate.ps1

# Instalar dependencias
Write-Host "Instalando dependencias do backend..." -ForegroundColor Cyan
python -m pip install --upgrade pip | Out-Null
pip install -r requirements.txt
Write-Host "OK: Dependencias instaladas" -ForegroundColor Green

# Criar .env
if (!(Test-Path ".env")) {
    Write-Host "Criando arquivo .env do backend..." -ForegroundColor Cyan
    Copy-Item .env.example .env -ErrorAction SilentlyContinue
    if (!(Test-Path ".env")) {
        @"
DATABASE_URL=sqlite:///./fitness_store.db
SECRET_KEY=your-secret-key-change-this-in-production
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
"@ | Out-File -FilePath ".env" -Encoding UTF8
    }
    Write-Host "OK: backend/.env criado" -ForegroundColor Green
    Write-Host "Aviso: Edite backend/.env se necessario" -ForegroundColor Yellow
} else {
    Write-Host "Aviso: backend/.env ja existe" -ForegroundColor Yellow
}

# Criar banco de dados
if (!(Test-Path "fitness_store.db")) {
    Write-Host "Criando banco de dados..." -ForegroundColor Cyan
    python recreate_db.py
    Write-Host "OK: Banco de dados criado" -ForegroundColor Green
} else {
    Write-Host "Aviso: Banco de dados ja existe" -ForegroundColor Yellow
}

# Criar usuario admin
Write-Host "Criando usuario administrador..." -ForegroundColor Cyan
python create_user.py
Write-Host "OK: Usuario admin criado" -ForegroundColor Green
Write-Host "   Email: admin@fitnessstore.com" -ForegroundColor White
Write-Host "   Senha: admin123" -ForegroundColor White

# Criar categorias
Write-Host "Criando categorias iniciais..." -ForegroundColor Cyan
if (Test-Path "create_categories.py") {
    python create_categories.py
    Write-Host "OK: Categorias criadas" -ForegroundColor Green
}

Set-Location ..

Write-Host ""
Write-Host "OK: Backend configurado com sucesso!" -ForegroundColor Green
Write-Host ""

# Setup do Mobile
if (!$skipMobile) {
    Write-Host "CONFIGURANDO MOBILE" -ForegroundColor Cyan
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host ""
    
    Set-Location mobile
    
    # Instalar dependencias
    Write-Host "Instalando dependencias do mobile (pode demorar)..." -ForegroundColor Cyan
    npm install
    Write-Host "OK: Dependencias instaladas" -ForegroundColor Green
    
    # Criar .env
    if (!(Test-Path ".env")) {
        Write-Host "Criando arquivo .env do mobile..." -ForegroundColor Cyan
        
        # Detectar IP automaticamente
        $ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.InterfaceAlias -like "*Wi-Fi*" -or $_.InterfaceAlias -like "*Ethernet*"} | Select-Object -First 1).IPAddress
        
        if (!$ip) {
            $ip = "192.168.1.100"
        }
        
        Copy-Item .env.example .env -ErrorAction SilentlyContinue
        if (Test-Path ".env") {
            (Get-Content .env) -replace "192.168.1.100", $ip | Set-Content .env
        } else {
            @"
API_BASE_URL=http://${ip}:8000/api/v1
API_TIMEOUT=30000
DEFAULT_WAREHOUSE_ID=1
"@ | Out-File -FilePath ".env" -Encoding UTF8
        }
        
        Write-Host "OK: mobile/.env criado com IP: $ip" -ForegroundColor Green
        Write-Host "Aviso: Verifique se o IP esta correto em mobile/.env" -ForegroundColor Yellow
    } else {
        Write-Host "Aviso: mobile/.env ja existe" -ForegroundColor Yellow
    }
    
    Set-Location ..
    
    Write-Host ""
    Write-Host "OK: Mobile configurado com sucesso!" -ForegroundColor Green
    Write-Host ""
}

# Resumo Final
Write-Host ""
Write-Host "================================================" -ForegroundColor Green
Write-Host "SETUP CONCLUIDO COM SUCESSO!" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Proximos passos:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. Editar arquivos .env (se necessario):" -ForegroundColor White
Write-Host "   - backend/.env" -ForegroundColor Gray
if (!$skipMobile) {
    Write-Host "   - mobile/.env" -ForegroundColor Gray
}
Write-Host ""
Write-Host "2. Iniciar o backend:" -ForegroundColor White
Write-Host "   cd backend" -ForegroundColor Gray
Write-Host "   .\venv\Scripts\Activate.ps1" -ForegroundColor Gray
Write-Host "   python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000" -ForegroundColor Gray
Write-Host ""
if (!$skipMobile) {
    Write-Host "3. Em outro terminal, iniciar o mobile:" -ForegroundColor White
    Write-Host "   cd mobile" -ForegroundColor Gray
    Write-Host "   npx expo start" -ForegroundColor Gray
    Write-Host "   (Pressione 'a' para Android, 'i' para iOS)" -ForegroundColor Gray
    Write-Host ""
}
Write-Host "Documentacao:" -ForegroundColor Yellow
Write-Host "   API: http://localhost:8000/docs" -ForegroundColor Gray
Write-Host "   Setup: docs/SETUP.md" -ForegroundColor Gray
Write-Host "   Arquitetura: docs/ARCHITECTURE.md" -ForegroundColor Gray
Write-Host ""
Write-Host "Credenciais padrao:" -ForegroundColor Yellow
Write-Host "   Email: admin@fitnessstore.com" -ForegroundColor Gray
Write-Host "   Senha: admin123" -ForegroundColor Gray
Write-Host ""
Write-Host "Bom desenvolvimento!" -ForegroundColor Cyan
Write-Host ""
