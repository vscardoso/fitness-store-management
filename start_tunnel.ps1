# ============================================================================
# START TUNNEL - Inicia localtunnel e atualiza Config.ts automaticamente
# ============================================================================
# Como usar:
#   .\start_tunnel.ps1
#
# O que faz:
#   1. Inicia localtunnel na porta 8000
#   2. Captura a URL dinamica gerada (ex: https://xxx-yyy-zzz.loca.lt)
#   3. Atualiza mobile/constants/Config.ts com a URL real
#   4. Seta MODE = 'tunnel' para o app usar o tunnel automaticamente
#   5. Expo hot-reload pega a mudanca instantaneamente
#
# Para voltar ao modo local (mesma rede WiFi):
#   .\use_local.ps1
# ============================================================================

$PORT = 8000
$CONFIG_FILE = "$PSScriptRoot\mobile\constants\Config.ts"

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  FITNESS STORE - TUNNEL SETUP (localtunnel)" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# Verifica se npx esta disponivel
if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
    Write-Host "ERRO: npx nao encontrado. Instale o Node.js em https://nodejs.org" -ForegroundColor Red
    exit 1
}

# Inicia localtunnel em background e captura a URL
Write-Host "Iniciando localtunnel na porta $PORT..." -ForegroundColor Yellow

$stdoutFile = "$env:TEMP\lt_stdout.txt"
if (Test-Path $stdoutFile) { Remove-Item $stdoutFile }

# Usa cmd.exe porque npx é um .cmd no Windows (Start-Process não aceita .cmd diretamente)
$ltProcess = Start-Process -FilePath "cmd.exe" `
    -ArgumentList "/c npx localtunnel --port $PORT > `"$stdoutFile`" 2>&1" `
    -PassThru -WindowStyle Hidden

# Aguardar URL aparecer (timeout 30s)
$maxWait = 30
$waited = 0
$tunnelUrl = $null

Write-Host "Aguardando URL do tunnel..." -ForegroundColor Gray

while ($waited -lt $maxWait) {
    Start-Sleep -Seconds 1
    $waited++

    if (Test-Path $stdoutFile) {
        $content = Get-Content $stdoutFile -Raw -ErrorAction SilentlyContinue
        if ($content -match '(https://[a-zA-Z0-9\-]+\.loca\.lt)') {
            $tunnelUrl = $matches[1]
            break
        }
    }
}

if (-not $tunnelUrl) {
    Write-Host "ERRO: Nao foi possivel obter a URL do tunnel apos ${maxWait}s." -ForegroundColor Red
    Write-Host ""
    if (Test-Path $stdoutFile) {
        Write-Host "Saida do localtunnel:" -ForegroundColor Yellow
        Get-Content $stdoutFile
    }
    if (-not $ltProcess.HasExited) {
        $ltProcess | Stop-Process -Force -ErrorAction SilentlyContinue
    }
    exit 1
}

$apiUrl = "$tunnelUrl/api/v1"

Write-Host ""
Write-Host "Tunnel ativo!" -ForegroundColor Green
Write-Host "URL publica : $tunnelUrl" -ForegroundColor Green
Write-Host "API URL     : $apiUrl" -ForegroundColor Green
Write-Host ""

# Atualiza Config.ts — seta MODE='tunnel' e TUNNEL_URL com a URL real
Write-Host "Atualizando mobile/constants/Config.ts..." -ForegroundColor Yellow

$configContent = Get-Content $CONFIG_FILE -Raw

# Atualiza MODE para 'tunnel'
$configContent = $configContent -replace "let MODE = '[^']*' as 'local' \| 'tunnel'", "let MODE = 'tunnel' as 'local' | 'tunnel'"

# Atualiza TUNNEL_URL com a URL real
$configContent = $configContent -replace "let TUNNEL_URL = '[^']*'", "let TUNNEL_URL = '$tunnelUrl'"

$configContent | Set-Content $CONFIG_FILE -Encoding UTF8 -NoNewline

Write-Host "Config.ts atualizado com URL do tunnel!" -ForegroundColor Green
Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  TUNNEL RODANDO - nao feche esta janela" -ForegroundColor Green
Write-Host "  Expo vai recarregar automaticamente" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Pressione CTRL+C para encerrar o tunnel." -ForegroundColor Gray
Write-Host ""

# Aguardar enquanto o tunnel estiver ativo
try {
    while (-not $ltProcess.HasExited) {
        Start-Sleep -Seconds 5
    }
    Write-Host "Tunnel encerrado inesperadamente." -ForegroundColor Red
} finally {
    if (-not $ltProcess.HasExited) {
        $ltProcess | Stop-Process -Force -ErrorAction SilentlyContinue
    }
    if (Test-Path $stdoutFile) { Remove-Item $stdoutFile -ErrorAction SilentlyContinue }
    Write-Host "Tunnel encerrado." -ForegroundColor Gray
}

