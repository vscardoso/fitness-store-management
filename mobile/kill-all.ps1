# KILL ALL - Solucao definitiva para processos travados
# Mata TODOS os processos Node/Expo/Metro de forma extremamente agressiva

Write-Host "[KILL ALL] Matando TODOS os processos Node/Expo/Metro..." -ForegroundColor Red

# 1. Matar via nome do processo (metodo padrao)
Write-Host "`n[1/4] Matando por nome do processo..." -ForegroundColor Yellow
$processNames = @("node", "expo", "expo-cli", "watchman", "metro")
foreach ($name in $processNames) {
    try {
        $processes = Get-Process $name -ErrorAction SilentlyContinue
        if ($processes) {
            $processes | Stop-Process -Force -ErrorAction SilentlyContinue
            Write-Host "  [OK] Matou $($processes.Count) processo(s) $name" -ForegroundColor Green
        }
    } catch {
        # Ignora erros
    }
}

# 2. Matar via porta (pega processos que estao usando as portas)
Write-Host "`n[2/4] Matando processos nas portas 8081, 19000-19006..." -ForegroundColor Yellow
$ports = @(8081) + (19000..19006)
foreach ($port in $ports) {
    try {
        $connections = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
        foreach ($conn in $connections) {
            $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
            if ($proc) {
                Write-Host "  [OK] Matando PID $($proc.Id) ($($proc.ProcessName)) na porta $port" -ForegroundColor Green
                Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
            }
        }
    } catch {
        # Ignora erros
    }
}

# 3. Matar via linha de comando (pega nodes rodando expo/metro)
Write-Host "`n[3/4] Matando Node.exe rodando Expo/Metro..." -ForegroundColor Yellow
try {
    $allNodes = Get-WmiObject Win32_Process -Filter "name='node.exe'" -ErrorAction SilentlyContinue
    foreach ($node in $allNodes) {
        $cmdLine = $node.CommandLine
        if ($cmdLine -match "expo|metro|react-native|@react-native") {
            $preview = $cmdLine.Substring(0, [Math]::Min(80, $cmdLine.Length))
            Write-Host "  [OK] Matando PID $($node.ProcessId): $preview..." -ForegroundColor Green
            Stop-Process -Id $node.ProcessId -Force -ErrorAction SilentlyContinue
        }
    }
} catch {
    Write-Host "  [AVISO] Nao foi possivel verificar linha de comando (requer admin)" -ForegroundColor DarkYellow
}

# 4. Limpar caches e arquivos temporarios
Write-Host "`n[4/4] Limpando caches..." -ForegroundColor Yellow
$cachePaths = @(
    ".expo",
    "node_modules\.cache",
    ".metro",
    "$env:LOCALAPPDATA\Temp\metro-*",
    "$env:LOCALAPPDATA\Temp\react-*",
    "$env:LOCALAPPDATA\Temp\haste-map-*"
)

foreach ($path in $cachePaths) {
    try {
        # Se contem wildcard, usa Get-Item
        if ($path -match '\*') {
            $items = Get-Item $path -ErrorAction SilentlyContinue
            if ($items) {
                Remove-Item $items -Recurse -Force -ErrorAction SilentlyContinue
                Write-Host "  [OK] Removeu: $path" -ForegroundColor Green
            }
        } else {
            # Caminho relativo, verifica se existe
            if (Test-Path $path) {
                Remove-Item $path -Recurse -Force -ErrorAction SilentlyContinue
                Write-Host "  [OK] Removeu: $path" -ForegroundColor Green
            }
        }
    } catch {
        # Ignora erros
    }
}

# 5. Verificacao final
Write-Host "`n[VERIFICACAO] Verificacao final..." -ForegroundColor Cyan
Start-Sleep -Seconds 1

$remainingNodes = Get-Process node -ErrorAction SilentlyContinue
if ($remainingNodes) {
    Write-Host "[AVISO] Ainda ha $($remainingNodes.Count) processo(s) Node rodando" -ForegroundColor Yellow
    Write-Host "   Pode ser do backend ou outro projeto. Verifique:" -ForegroundColor Gray
    $remainingNodes | Select-Object Id, CPU, @{Name="Memory(MB)";Expression={[math]::Round($_.WorkingSet64/1MB,2)}} | Format-Table
    Write-Host "   Execute novamente como ADMINISTRADOR para matar tudo:" -ForegroundColor Gray
    Write-Host "   Start-Process powershell -Verb RunAs -ArgumentList '-NoExit', '-File', '$PSCommandPath'" -ForegroundColor DarkGray
} else {
    Write-Host "[OK] TUDO LIMPO! Nenhum processo Node/Expo rodando" -ForegroundColor Green
}

Write-Host "`n[FINALIZADO] Terminal livre para usar." -ForegroundColor Green
Write-Host "   Execute: .\expo-dev.ps1 para iniciar com seguranca" -ForegroundColor Cyan
