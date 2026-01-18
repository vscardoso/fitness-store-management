param(
    [switch]$Tunnel,
    [switch]$Clean
)

Write-Host "Iniciando Expo (modo seguro)..." -ForegroundColor Cyan

# Matar processos antigos
& "$PSScriptRoot\kill-expo-safe.ps1"

# Limpar cache se solicitado
if ($Clean) {
    Write-Host "Limpando cache..." -ForegroundColor Yellow
    if (Test-Path ".expo") { Remove-Item -Recurse -Force ".expo" -ErrorAction SilentlyContinue }
    if (Test-Path "node_modules\.cache") { Remove-Item -Recurse -Force "node_modules\.cache" -ErrorAction SilentlyContinue }
}

# Iniciar Expo
if ($Tunnel) {
    npx expo start --tunnel
} else {
    npx expo start
}
