# ============================================================================
# START ALL - Sobe Backend + Tunnel + Expo em um comando so
# ============================================================================
# Como usar:
#   .\start_all.ps1              # Com tunnel (redes diferentes)
#   .\start_all.ps1 -Local       # Sem tunnel (mesma rede WiFi)
#
# O que faz:
#   1. Inicia o backend (uvicorn) em background
#   2. Inicia o localtunnel e atualiza Config.ts (modo tunnel)
#      OU configura IP local (modo local)
#   3. Inicia o Expo no terminal principal
#
# Para encerrar tudo: CTRL+C (mata Expo) + os processos background morrem sozinhos
# ============================================================================

param(
    [switch]$Local
)

$ROOT = $PSScriptRoot
$BACKEND_DIR = "$ROOT\backend"
$CONFIG_FILE = "$ROOT\mobile\constants\Config.ts"
$PORT = 8000

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  FITNESS STORE - INICIANDO TUDO" -ForegroundColor Cyan
if ($Local) {
    Write-Host "  Modo: LOCAL (mesma rede WiFi)" -ForegroundColor Green
} else {
    Write-Host "  Modo: TUNNEL (redes diferentes)" -ForegroundColor Green
}
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# ── 1. BACKEND ───────────────────────────────────────────────────────
Write-Host "[1/3] Iniciando backend (uvicorn)..." -ForegroundColor Yellow

# Detecta venv
$venvPython = $null
foreach ($candidate in @("$BACKEND_DIR\venv\Scripts\python.exe", "$ROOT\.venv\Scripts\python.exe")) {
    if (Test-Path $candidate) { $venvPython = $candidate; break }
}
if (-not $venvPython) {
    Write-Host "ERRO: venv nao encontrado em backend\venv ou .venv" -ForegroundColor Red
    exit 1
}

$backendProc = Start-Process -FilePath $venvPython `
    -ArgumentList "-m uvicorn app.main:app --reload --host 0.0.0.0 --port $PORT" `
    -WorkingDirectory $BACKEND_DIR `
    -PassThru -WindowStyle Minimized

Start-Sleep -Seconds 2

if ($backendProc.HasExited) {
    Write-Host "ERRO: Backend falhou ao iniciar. Verifique os logs." -ForegroundColor Red
    exit 1
}

Write-Host "Backend rodando (PID $($backendProc.Id)) em http://localhost:$PORT" -ForegroundColor Green
Write-Host ""

# ── 2. REDE (Tunnel ou Local) ───────────────────────────────────────
$ltProcess = $null

if ($Local) {
    Write-Host "[2/3] Configurando modo LOCAL..." -ForegroundColor Yellow

    # Detecta IP
    $ip = (Get-NetIPAddress -AddressFamily IPv4 |
        Where-Object { $_.InterfaceAlias -match 'Wi-Fi|Ethernet|LAN' -and $_.IPAddress -notlike '127.*' } |
        Select-Object -First 1).IPAddress

    if (-not $ip) {
        $ip = (ipconfig | Select-String 'IPv4.*: (\d+\.\d+\.\d+\.\d+)' |
            Where-Object { $_ -notmatch '127.0.0.1' } |
            ForEach-Object { $_.Matches[0].Groups[1].Value } |
            Select-Object -First 1)
    }

    if (-not $ip) { $ip = "192.168.1.100"; Write-Host "IP nao detectado, usando fallback $ip" -ForegroundColor Yellow }

    $configContent = Get-Content $CONFIG_FILE -Raw
    $configContent = $configContent -replace "let MODE = '[^']*' as 'local' \| 'tunnel'", "let MODE = 'local' as 'local' | 'tunnel'"
    $configContent = $configContent -replace "let LOCAL_IP = '[^']*'", "let LOCAL_IP = '$ip'"
    $configContent | Set-Content $CONFIG_FILE -Encoding UTF8 -NoNewline

    Write-Host "Config.ts → LOCAL ($ip):$PORT" -ForegroundColor Green
    Write-Host ""

} else {
    Write-Host "[2/3] Iniciando tunnel (localtunnel)..." -ForegroundColor Yellow

    if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
        Write-Host "ERRO: npx nao encontrado. Instale Node.js." -ForegroundColor Red
        $backendProc | Stop-Process -Force -ErrorAction SilentlyContinue
        exit 1
    }

    $stdoutFile = "$env:TEMP\lt_stdout.txt"
    if (Test-Path $stdoutFile) { Remove-Item $stdoutFile }

    $ltProcess = Start-Process -FilePath "cmd.exe" `
        -ArgumentList "/c npx localtunnel --port $PORT > `"$stdoutFile`" 2>&1" `
        -PassThru -WindowStyle Hidden

    $maxWait = 30; $waited = 0; $tunnelUrl = $null

    while ($waited -lt $maxWait) {
        Start-Sleep -Seconds 1; $waited++
        if (Test-Path $stdoutFile) {
            $content = Get-Content $stdoutFile -Raw -ErrorAction SilentlyContinue
            if ($content -match '(https://[a-zA-Z0-9\-]+\.loca\.lt)') {
                $tunnelUrl = $matches[1]; break
            }
        }
    }

    if (-not $tunnelUrl) {
        Write-Host "ERRO: Tunnel nao iniciou em ${maxWait}s." -ForegroundColor Red
        if (Test-Path $stdoutFile) { Get-Content $stdoutFile }
        $ltProcess | Stop-Process -Force -ErrorAction SilentlyContinue
        $backendProc | Stop-Process -Force -ErrorAction SilentlyContinue
        exit 1
    }

    $configContent = Get-Content $CONFIG_FILE -Raw
    $configContent = $configContent -replace "let MODE = '[^']*' as 'local' \| 'tunnel'", "let MODE = 'tunnel' as 'local' | 'tunnel'"
    $configContent = $configContent -replace "let TUNNEL_URL = '[^']*'", "let TUNNEL_URL = '$tunnelUrl'"
    $configContent | Set-Content $CONFIG_FILE -Encoding UTF8 -NoNewline

    Write-Host "Tunnel ativo: $tunnelUrl" -ForegroundColor Green
    Write-Host "Config.ts → TUNNEL ($tunnelUrl/api/v1)" -ForegroundColor Green
    Write-Host ""
}

# ── 3. EXPO ──────────────────────────────────────────────────────────
Write-Host "[3/3] Iniciando Expo..." -ForegroundColor Yellow
Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  TUDO RODANDO!" -ForegroundColor Green
Write-Host "  Backend : http://localhost:$PORT (PID $($backendProc.Id))" -ForegroundColor White
if ($Local) {
    Write-Host "  Mobile  : http://${ip}:$PORT/api/v1 (local)" -ForegroundColor White
} else {
    Write-Host "  Tunnel  : $tunnelUrl (PID $($ltProcess.Id))" -ForegroundColor White
    Write-Host "  Mobile  : $tunnelUrl/api/v1" -ForegroundColor White
}
Write-Host "  Expo    : iniciando abaixo..." -ForegroundColor White
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "CTRL+C para encerrar tudo." -ForegroundColor Gray
Write-Host ""

# Expo roda em foreground (o terminal fica aqui)
try {
    Push-Location "$ROOT\mobile"
    npx expo start
} finally {
    Pop-Location

    # Cleanup: mata backend e tunnel ao sair
    Write-Host ""
    Write-Host "Encerrando processos..." -ForegroundColor Yellow

    if ($backendProc -and -not $backendProc.HasExited) {
        $backendProc | Stop-Process -Force -ErrorAction SilentlyContinue
        Write-Host "Backend encerrado." -ForegroundColor Gray
    }
    if ($ltProcess -and -not $ltProcess.HasExited) {
        $ltProcess | Stop-Process -Force -ErrorAction SilentlyContinue
        if (Test-Path "$env:TEMP\lt_stdout.txt") { Remove-Item "$env:TEMP\lt_stdout.txt" -ErrorAction SilentlyContinue }
        Write-Host "Tunnel encerrado." -ForegroundColor Gray
    }

    Write-Host "Tudo encerrado." -ForegroundColor Green
}
