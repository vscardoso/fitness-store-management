# ============================================================================
# START TUNNEL - Inicia tunnel via localtunnel com SUBDOMINIO FIXO
# ============================================================================
# Como usar:
#   .\start_tunnel.ps1
#
# Usa localtunnel (npx lt) com subdominio fixo - a URL nunca muda!
# URL permanente: https://fitness-store-mgmt-api.loca.lt
#
# Prerequisito: Node.js instalado (para npx)
# ============================================================================

$PORT = 8000
$SUBDOMAIN = "fitness-store-mgmt-api"
$FIXED_URL = "https://$SUBDOMAIN.loca.lt"
$FIXED_API_URL = "$FIXED_URL/api/v1"

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  FITNESS STORE - TUNNEL SETUP (localtunnel subdominio fixo)" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Subdominio : $SUBDOMAIN" -ForegroundColor White
Write-Host "URL fixa   : $FIXED_URL" -ForegroundColor Green
Write-Host "API URL    : $FIXED_API_URL" -ForegroundColor Green
Write-Host ""
Write-Host "Iniciando tunnel na porta $PORT..." -ForegroundColor Yellow
Write-Host "(Pressione Ctrl+C para parar)" -ForegroundColor Gray
Write-Host ""
Write-Host "------------------------------------------------------------" -ForegroundColor DarkGray

# Verifica se npx esta disponivel
if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
    Write-Host "ERRO: npx nao encontrado. Instale o Node.js em https://nodejs.org" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Tunnel ativo! Mantenha este terminal aberto." -ForegroundColor Green
Write-Host ""

# Inicia localtunnel com subdominio fixo (foreground - mantem o terminal aberto)
npx localtunnel --port $PORT --subdomain $SUBDOMAIN

Write-Host ""
Write-Host "Tunnel encerrado." -ForegroundColor Yellow

