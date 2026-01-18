# Kill all Expo/Metro/Node processes forcefully
Write-Host "Killing all Expo/Metro/Node processes..." -ForegroundColor Yellow

# Kill node processes
try {
    Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
    Write-Host "Node processes killed" -ForegroundColor Green
} catch {
    Write-Host "No Node processes found" -ForegroundColor Gray
}

# Kill expo processes
try {
    Get-Process expo -ErrorAction SilentlyContinue | Stop-Process -Force
    Write-Host "Expo processes killed" -ForegroundColor Green
} catch {
    Write-Host "No Expo processes found" -ForegroundColor Gray
}

# Kill watchman if exists
try {
    Get-Process watchman -ErrorAction SilentlyContinue | Stop-Process -Force
} catch {
    # Ignore
}

# Free port 8081 (Metro)
try {
    $connections = Get-NetTCPConnection -LocalPort 8081 -ErrorAction SilentlyContinue
    foreach ($conn in $connections) {
        Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
    }
    Write-Host "Freed port 8081" -ForegroundColor Green
} catch {
    Write-Host "Port 8081 was not in use" -ForegroundColor Gray
}

# Free Expo ports (19000-19006)
Write-Host "Freeing Expo ports..." -ForegroundColor Yellow
for ($port = 19000; $port -le 19006; $port++) {
    try {
        $connections = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
        foreach ($conn in $connections) {
            Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
        }
    } catch {
        # Ignore
    }
}
Write-Host "Expo ports freed" -ForegroundColor Green

# Clear Metro cache
try {
    $metroCache = "$env:LOCALAPPDATA\Temp\metro-*"
    if (Test-Path $metroCache) {
        Remove-Item $metroCache -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "Cleared Metro cache" -ForegroundColor Green
    }
} catch {
    # Ignore
}

# Clear React Native cache
try {
    $rnCache = "$env:LOCALAPPDATA\Temp\react-*"
    if (Test-Path $rnCache) {
        Remove-Item $rnCache -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "Cleared React Native cache" -ForegroundColor Green
    }
} catch {
    # Ignore
}

Write-Host ""
Write-Host "All processes killed and caches cleared!" -ForegroundColor Green
Write-Host "You can now run 'npx expo start' safely." -ForegroundColor Cyan
