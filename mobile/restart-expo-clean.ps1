# Complete clean restart of Expo
Write-Host "🔄 Performing complete Expo clean restart..." -ForegroundColor Cyan

# Step 1: Kill all processes
Write-Host "`n[1/5] Killing processes..." -ForegroundColor Yellow
& "$PSScriptRoot\kill-expo.ps1"

# Step 2: Clear Expo cache
Write-Host "`n[2/5] Clearing Expo cache..." -ForegroundColor Yellow
if (Test-Path ".expo") {
    Remove-Item ".expo" -Recurse -Force
    Write-Host "✓ Cleared .expo folder" -ForegroundColor Green
}

# Step 3: Clear node_modules/.cache
Write-Host "`n[3/5] Clearing node_modules cache..." -ForegroundColor Yellow
if (Test-Path "node_modules\.cache") {
    Remove-Item "node_modules\.cache" -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "✓ Cleared node_modules/.cache" -ForegroundColor Green
}

# Step 4: Clear watchman (if installed)
Write-Host "`n[4/5] Clearing watchman..." -ForegroundColor Yellow
$watchmanExists = Get-Command watchman -ErrorAction SilentlyContinue
if ($watchmanExists) {
    watchman watch-del-all 2>$null
    Write-Host "✓ Cleared watchman watches" -ForegroundColor Green
} else {
    Write-Host "⊘ Watchman not installed (OK)" -ForegroundColor Gray
}

# Step 5: Start Expo fresh
Write-Host "`n[5/5] Starting Expo with clear cache..." -ForegroundColor Yellow
Write-Host "`n🚀 Expo starting clean..." -ForegroundColor Green
npx expo start --clear

Write-Host "`n✅ Clean restart complete!" -ForegroundColor Green
