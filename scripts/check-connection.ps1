# Script para verificar conectividade entre backend e frontend
Write-Host "=================================" -ForegroundColor Cyan
Write-Host "   Verificação de Conectividade" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan
Write-Host ""

# 1. Verificar se backend está rodando
Write-Host "1. Verificando backend local..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:8000/health" -Method Get -TimeoutSec 5 -ErrorAction Stop
    Write-Host "   OK Backend rodando em localhost:8000" -ForegroundColor Green
} catch {
    Write-Host "   ERRO Backend nao esta respondendo em localhost:8000" -ForegroundColor Red
    Write-Host "   Execute: uvicorn app.main:app --reload --host 0.0.0.0 --port 8000" -ForegroundColor Yellow
    Write-Host ""
}

# 2. Descobrir IPs locais
Write-Host ""
Write-Host "2. Descobrindo IPs da máquina..." -ForegroundColor Yellow
$ips = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notmatch '^127\.' -and $_.IPAddress -notmatch '^169\.254\.' } | Select-Object -ExpandProperty IPAddress

if ($ips) {
    Write-Host "   IPs encontrados:" -ForegroundColor Green
    foreach ($ip in $ips) {
        Write-Host "      $ip" -ForegroundColor Cyan
        
        # Testar backend em cada IP
        try {
            $testUri = "http://" + $ip + ":8000/health"
            $response = Invoke-WebRequest -Uri $testUri -Method Get -TimeoutSec 3 -ErrorAction Stop
            Write-Host "        OK Backend acessivel em http://$ip:8000" -ForegroundColor Green
        } catch {
            Write-Host "        ERRO Backend NAO acessivel em http://$ip:8000" -ForegroundColor Red
        }
    }
} else {
    Write-Host "   ERRO Nenhum IP encontrado" -ForegroundColor Red
}

# 3. Verificar Config.ts
Write-Host ""
Write-Host "3. Verificando configuração do mobile..." -ForegroundColor Yellow
$configPath = "mobile\constants\Config.ts"
if (Test-Path $configPath) {
    $configContent = Get-Content $configPath -Raw
    
    # Extrair URL (regex simples)
    $pattern = "const API_BASE_URL = '(.+?)'"
    if ($configContent -match $pattern) {
        $configuredUrl = $matches[1]
        Write-Host "   URL configurada: $configuredUrl" -ForegroundColor Cyan
        
        # Verificar se é acessível
        $testUrl = $configuredUrl -replace "/api/v1", "/health"
        try {
            $response = Invoke-WebRequest -Uri $testUrl -Method Get -TimeoutSec 5 -ErrorAction Stop
            Write-Host "   OK Backend acessivel na URL configurada" -ForegroundColor Green
        } catch {
            Write-Host "   ERRO Backend NAO acessivel na URL configurada" -ForegroundColor Red
            Write-Host "   Atualize mobile/constants/Config.ts com um dos IPs acima" -ForegroundColor Yellow
        }
    } else {
        Write-Host "   AVISO Nao foi possivel extrair URL do Config.ts" -ForegroundColor Yellow
    }
} else {
    Write-Host "   ERRO Arquivo Config.ts nao encontrado" -ForegroundColor Red
}

# 4. Verificar CORS no backend
Write-Host ""
Write-Host "4. Verificando CORS do backend..." -ForegroundColor Yellow
$envPath = "backend\.env"
if (Test-Path $envPath) {
    $corsLine = Get-Content $envPath | Select-String "CORS_ORIGINS"
    if ($corsLine) {
        Write-Host "   CORS configurado:" -ForegroundColor Cyan
        Write-Host "      $corsLine" -ForegroundColor Gray
    } else {
        Write-Host "   AVISO CORS_ORIGINS nao encontrado no .env" -ForegroundColor Yellow
    }
} else {
    Write-Host "   ERRO Arquivo backend/.env nao encontrado" -ForegroundColor Red
}

# 5. Recomendações
Write-Host ""
Write-Host "=================================" -ForegroundColor Cyan
Write-Host "   Recomendacoes" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan
Write-Host ""

if ($ips) {
    $mainIp = $ips | Where-Object { $_ -match "^192\.168\." } | Select-Object -First 1
    if ($mainIp) {
        Write-Host "Use este IP no Config.ts:" -ForegroundColor Green
        Write-Host "   const API_BASE_URL = 'http://$mainIp:8000/api/v1';" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "Adicione ao CORS no backend/.env:" -ForegroundColor Green
        $cors1 = "`"http://localhost:8000`""
        $cors2 = "`"http://$mainIp:8000`""
        $cors3 = "`"http://$mainIp:8081`""
        $cors4 = "`"http://$mainIp:19006`""
        $cors5 = "`"exp://$mainIp:8081`""
        Write-Host "   CORS_ORIGINS=[$cors1,$cors2,$cors3,$cors4,$cors5]" -ForegroundColor Cyan
    }
}

Write-Host ""
Write-Host "Se nada funcionar, use tunnel:" -ForegroundColor Yellow
Write-Host "   lt --port 8000" -ForegroundColor Cyan
Write-Host ""
