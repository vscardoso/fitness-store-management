# EXPO START - Solução definitiva anti-travamento
# Executa Expo em modo totalmente não-interativo

$env:CI = "1"
$env:EXPO_NO_PROMPT = "1"
$env:EXPO_OFFLINE = "1"
$env:NONINTERACTIVE = "1"

Write-Host "`n[EXPO] Limpando ambiente..." -ForegroundColor Yellow
& "$PSScriptRoot\kill-all.ps1" 2>$null

Write-Host "`n[EXPO] Iniciando em modo CI (sem prompts)..." -ForegroundColor Green
Write-Host "       Ctrl+C para sair`n" -ForegroundColor Gray

npx expo start --offline --clear --max-workers 2 2>&1
