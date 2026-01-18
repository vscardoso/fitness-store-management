Write-Host "Matando processos Expo..." -ForegroundColor Yellow

Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Get-Process -Name expo -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Get-Process -Name watchman -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

Start-Sleep -Seconds 1

Write-Host "Processos mortos!" -ForegroundColor Green
