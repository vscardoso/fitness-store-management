# Expo Development - Inicia Expo sem travamentos
# Este script garante ambiente limpo antes de iniciar

param(
    [switch]$Tunnel,     # Usa --tunnel (para device fisico)
    [switch]$NoClear,    # Nao limpa cache
    [switch]$Verbose     # Mostra logs detalhados
)

function Write-Step {
    param([string]$Message, [string]$Color = "Cyan")
    Write-Host "`n>>> $Message" -ForegroundColor $Color
}

function Write-Success {
    param([string]$Message)
    Write-Host "  [OK] $Message" -ForegroundColor Green
}

function Write-Error {
    param([string]$Message)
    Write-Host "  [ERRO] $Message" -ForegroundColor Red
}

function Write-Warning {
    param([string]$Message)
    Write-Host "  [AVISO] $Message" -ForegroundColor Yellow
}

# Banner
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  EXPO DEVELOPMENT - Anti-Freeze Mode" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Passo 1: Verificar se ha processos rodando
Write-Step "Verificando processos existentes..." "Yellow"
$existingNodes = Get-Process node -ErrorAction SilentlyContinue
$port8081 = Get-NetTCPConnection -LocalPort 8081 -State Listen -ErrorAction SilentlyContinue
$port19000 = Get-NetTCPConnection -LocalPort 19000 -State Listen -ErrorAction SilentlyContinue

if ($existingNodes -or $port8081 -or $port19000) {
    Write-Warning "Processos ou portas ja em uso! Limpando automaticamente..."

    if ($existingNodes) {
        Write-Host "    * $($existingNodes.Count) processo(s) Node rodando" -ForegroundColor Gray
    }
    if ($port8081) {
        Write-Host "    * Porta 8081 (Metro) em uso" -ForegroundColor Gray
    }
    if ($port19000) {
        Write-Host "    * Porta 19000 (Expo) em uso" -ForegroundColor Gray
    }

    Write-Host "`n  [AUTO-LIMPEZA] Executando kill-all.ps1..." -ForegroundColor Cyan
    & "$PSScriptRoot\kill-all.ps1"
    Write-Host "`n  Aguardando 3 segundos para garantir limpeza..." -ForegroundColor Gray
    Start-Sleep -Seconds 3
    Write-Success "Ambiente limpo!"
} else {
    Write-Success "Ambiente limpo! Nenhum processo conflitante"
}

# Passo 2: Verificar node_modules
Write-Step "Verificando node_modules..." "Cyan"
if (-not (Test-Path "node_modules")) {
    Write-Warning "node_modules nao encontrado!"
    Write-Host "  Executando npm install..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Falha no npm install. Abortando."
        exit 1
    }
    Write-Success "npm install concluido"
} else {
    Write-Success "node_modules OK"
}

# Passo 3: Limpar cache (opcional)
if (-not $NoClear) {
    Write-Step "Limpando cache Metro/Expo..." "Cyan"
    $cacheCleared = $false

    if (Test-Path ".expo") {
        Remove-Item .expo -Recurse -Force -ErrorAction SilentlyContinue
        Write-Success "Cache .expo limpo"
        $cacheCleared = $true
    }

    if (Test-Path "node_modules\.cache") {
        Remove-Item "node_modules\.cache" -Recurse -Force -ErrorAction SilentlyContinue
        Write-Success "Cache node_modules limpo"
        $cacheCleared = $true
    }

    if (-not $cacheCleared) {
        Write-Host "  * Nenhum cache para limpar" -ForegroundColor Gray
    }
}

# Passo 4: Preparar comando Expo
Write-Step "Preparando comando Expo..." "Cyan"
$expoArgs = @("start")

# Adicionar --offline para evitar prompts de login
$expoArgs += "--offline"
Write-Host "  * Flag --offline ativada (sem prompts de login)" -ForegroundColor Gray

if (-not $NoClear) {
    $expoArgs += "--clear"
    Write-Host "  * Flag --clear ativada" -ForegroundColor Gray
}

if ($Tunnel) {
    $expoArgs += "--tunnel"
    Write-Host "  * Flag --tunnel ativada" -ForegroundColor Gray
}

# Sempre usar max-workers para evitar sobrecarga
$expoArgs += "--max-workers"
$expoArgs += "2"
Write-Host "  * Max workers: 2 (evita travamentos)" -ForegroundColor Gray

if ($Verbose) {
    $expoArgs += "--verbose"
    Write-Host "  * Modo verbose ativado" -ForegroundColor Gray
}

# Passo 5: Instrucoes
Write-Host "`n========================================" -ForegroundColor Green
Write-Host "  INICIANDO EXPO COM PROTECOES" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "`n  Comando: npx expo $($expoArgs -join ' ')" -ForegroundColor Cyan
Write-Host "`n  PROTECOES ATIVAS:" -ForegroundColor Yellow
Write-Host "    * Ambiente limpo automaticamente" -ForegroundColor Gray
Write-Host "    * Cache limpo antes de iniciar" -ForegroundColor Gray
Write-Host "    * Max workers limitado (menos sobrecarga)" -ForegroundColor Gray
Write-Host "    * Modo offline (sem prompts de login)" -ForegroundColor Gray
Write-Host "    * Portas liberadas" -ForegroundColor Gray
Write-Host "`n  COMO USAR:" -ForegroundColor Yellow
Write-Host "    * Aperte 'r' para reload" -ForegroundColor Gray
Write-Host "    * Aperte 'j' para abrir debugger" -ForegroundColor Gray
Write-Host "    * Aperte 'Ctrl+C DUAS VEZES' para sair (se travar)" -ForegroundColor Red
Write-Host "`n  SE TRAVAR:" -ForegroundColor Yellow
Write-Host "    1. Feche este terminal (X ou Alt+F4)" -ForegroundColor Gray
Write-Host "    2. Abra novo terminal" -ForegroundColor Gray
Write-Host "    3. Execute: .\kill-all.ps1" -ForegroundColor Gray
Write-Host "    4. Execute: .\expo-dev.ps1" -ForegroundColor Gray
Write-Host "`n  NOTA: Push notifications remotas nao funcionam em modo offline" -ForegroundColor DarkGray
Write-Host "        (Notificacoes locais e in-app continuam funcionando)" -ForegroundColor DarkGray
Write-Host "`n========================================`n" -ForegroundColor Green

Start-Sleep -Seconds 2

# Passo 6: Iniciar Expo
Write-Host "[INICIANDO] EXPO...`n" -ForegroundColor Green
npx expo $expoArgs

# Se chegou aqui, Expo foi encerrado normalmente
Write-Host "`n[OK] Expo encerrado normalmente" -ForegroundColor Green
