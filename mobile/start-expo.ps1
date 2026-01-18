# Script PowerShell para iniciar Expo sem travamentos
# Como usar: .\start-expo.ps1

Write-Host "🚀 Iniciando Expo (modo otimizado)..." -ForegroundColor Green

# Limpar cache do Metro bundler
Write-Host "🧹 Limpando cache..." -ForegroundColor Yellow
npx expo start --clear

# Se quiser pular a pergunta de login automaticamente, use:
# npx expo start --clear --no-dev --tunnel
