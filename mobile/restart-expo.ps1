param(
    [switch]$Tunnel
)

Write-Host "Reiniciando Expo..." -ForegroundColor Magenta

if ($Tunnel) {
    & "$PSScriptRoot\start-expo-safe.ps1" -Clean -Tunnel
} else {
    & "$PSScriptRoot\start-expo-safe.ps1" -Clean
}
