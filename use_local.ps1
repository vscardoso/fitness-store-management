# ============================================================================
# USE LOCAL - Configura o app para conectar via rede WiFi local
# ============================================================================
# Como usar:
#   .\use_local.ps1           # Detecta IP automaticamente
#   .\use_local.ps1 -ip 10.0.0.5   # Usa IP especifico
#
# O que faz:
#   1. Detecta o IP local da maquina (ou usa o fornecido)
#   2. Atualiza mobile/constants/Config.ts com o IP
#   3. Seta MODE = 'local' para o app usar a rede WiFi
#   4. Expo hot-reload pega a mudanca instantaneamente
#
# Para usar tunnel (redes diferentes):
#   .\start_tunnel.ps1
# ============================================================================

param(
    [string]$ip = ""
)

$CONFIG_FILE = "$PSScriptRoot\mobile\constants\Config.ts"

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  FITNESS STORE - MODO LOCAL (mesma rede WiFi)" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# Detecta IP se nao fornecido
if (-not $ip) {
    $ip = (Get-NetIPAddress -AddressFamily IPv4 |
        Where-Object { $_.InterfaceAlias -match 'Wi-Fi|Ethernet|LAN' -and $_.IPAddress -notlike '127.*' } |
        Select-Object -First 1).IPAddress
}

if (-not $ip) {
    # Fallback: ipconfig parsing
    $ip = (ipconfig | Select-String 'IPv4.*: (\d+\.\d+\.\d+\.\d+)' |
        Where-Object { $_ -notmatch '127.0.0.1' } |
        ForEach-Object { $_.Matches[0].Groups[1].Value } |
        Select-Object -First 1)
}

if (-not $ip) {
    Write-Host "ERRO: Nao foi possivel detectar o IP local." -ForegroundColor Red
    Write-Host "Use: .\use_local.ps1 -ip SEU_IP" -ForegroundColor Yellow
    exit 1
}

Write-Host "IP detectado: $ip" -ForegroundColor Green
Write-Host "API URL     : http://${ip}:8000/api/v1" -ForegroundColor Green
Write-Host ""

# Atualiza Config.ts
Write-Host "Atualizando mobile/constants/Config.ts..." -ForegroundColor Yellow

$configContent = Get-Content $CONFIG_FILE -Raw

# Seta MODE para 'local'
$configContent = $configContent -replace "let MODE = '[^']*' as 'local' \| 'tunnel'", "let MODE = 'local' as 'local' | 'tunnel'"

# Atualiza LOCAL_IP
$configContent = $configContent -replace "let LOCAL_IP = '[^']*'", "let LOCAL_IP = '$ip'"

$configContent | Set-Content $CONFIG_FILE -Encoding UTF8 -NoNewline

Write-Host "Config.ts atualizado para modo LOCAL!" -ForegroundColor Green
Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  MODO: LOCAL (WiFi)" -ForegroundColor Green
Write-Host "  IP:   $ip" -ForegroundColor Green
Write-Host "  Expo vai recarregar automaticamente" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Certifique-se de que:" -ForegroundColor Yellow
Write-Host "  1. Backend rodando: uvicorn app.main:app --reload --host 0.0.0.0 --port 8000" -ForegroundColor Gray
Write-Host "  2. Celular na mesma rede WiFi" -ForegroundColor Gray
Write-Host "  3. Firewall permite porta 8000 (regra 'Backend FastAPI 8000' ja criada)" -ForegroundColor Gray
Write-Host ""
