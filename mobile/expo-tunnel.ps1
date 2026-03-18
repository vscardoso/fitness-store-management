# ============================================================================
# EXPO TUNNEL - Metro bundler via localhost.run (sem ngrok, sem conta)
# Uso: .\expo-tunnel.ps1
# Para redes diferentes (PC e celular em redes distintas)
#
# Como funciona:
#   1. Executa Metro na porta 80 (assim o QR code usa exp://HOST:80)
#   2. Cria tunnel SSH: remote:80 -> local:80  (localhost.run so expoe porta 80)
#   3. Celular conecta em HOST:80 -> tunnel -> Metro local:80  [funciona!]
#   4. Abre Expo em NOVA JANELA (sem travar este terminal)
#   5. Esta janela mantém o tunnel ativo - nao feche!
#
# POR QUE porta 80?
#   localhost.run SEMPRE expoe a porta 80 no servidor remoto.
#   Se o Metro rodar em 8081, o QR code gera exp://HOST:8081 e o celular
#   tenta porta 8081 no host remoto - que nao esta tunelada. Com porta 80,
#   o QR code gera exp://HOST:80 e o celular encontra o tunnel. 
# ============================================================================

$PORT = 80
$stdoutFile = "$env:TEMP\expo_metro_stdout.txt"
$stderrFile  = "$env:TEMP\expo_metro_stderr.txt"
$scriptDir = $PSScriptRoot

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  EXPO TUNNEL - Metro via localhost.run" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# Limpar arquivos temporarios
foreach ($f in @($stdoutFile, $stderrFile)) {
    if (Test-Path $f) { Remove-Item $f }
}

# Verificar se porta 80 esta disponivel
$port80InUse = Get-NetTCPConnection -LocalPort 80 -State Listen -ErrorAction SilentlyContinue
if ($port80InUse) {
    Write-Host "ERRO: Porta 80 ja esta em uso!" -ForegroundColor Red
    Write-Host "Verifique se IIS ou outro servidor web esta rodando." -ForegroundColor Yellow
    Write-Host "Execute: Get-Process -Id (Get-NetTCPConnection -LocalPort 80).OwningProcess" -ForegroundColor Gray
    exit 1
}

Write-Host "Iniciando tunnel SSH para Metro (porta $PORT)..." -ForegroundColor Yellow

$sshArgs = "-o StrictHostKeyChecking=no -R 80:localhost:$PORT nokey@localhost.run"
$sshProcess = Start-Process -FilePath "ssh" -ArgumentList $sshArgs `
    -RedirectStandardOutput $stdoutFile `
    -RedirectStandardError $stderrFile `
    -PassThru -NoNewWindow

# Aguardar URL do tunnel (timeout 30s)
$tunnelUrl = $null
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    foreach ($file in @($stdoutFile, $stderrFile)) {
        if (Test-Path $file) {
            $content = Get-Content $file -Raw -ErrorAction SilentlyContinue
            if ($content -match 'https://[a-zA-Z0-9]+\.lhr\.life') {
                $tunnelUrl = $matches[0]
                break
            }
        }
    }
    if ($tunnelUrl) { break }
}

if (-not $tunnelUrl) {
    Write-Host ""
    Write-Host "ERRO: Nao foi possivel obter URL do tunnel Metro." -ForegroundColor Red
    Write-Host ""
    Write-Host "Saida SSH (stderr):" -ForegroundColor Yellow
    if (Test-Path $stderrFile) { Get-Content $stderrFile }
    $sshProcess | Stop-Process -Force -ErrorAction SilentlyContinue
    exit 1
}

$hostname = ([System.Uri]$tunnelUrl).Host

Write-Host ""
Write-Host "Tunnel Metro ativo!" -ForegroundColor Green
Write-Host "URL publica : $tunnelUrl" -ForegroundColor Green
Write-Host "Hostname    : $hostname" -ForegroundColor Green
Write-Host ""

# Abre Expo em NOVA JANELA para nao travar este terminal
# Esta janela precisa ficar aberta para manter o tunnel SSH ativo
Write-Host "Abrindo Expo em nova janela..." -ForegroundColor Yellow

$expoCmd = "cd '$scriptDir'; `$env:REACT_NATIVE_PACKAGER_HOSTNAME='$hostname'; Write-Host 'Metro tunnel: $tunnelUrl' -ForegroundColor Green; Write-Host 'QR code usara: exp://$hostname`:80' -ForegroundColor Cyan; Write-Host ''; npx expo start --port 80 --clear"

Start-Process powershell -ArgumentList "-NoExit", "-Command", $expoCmd

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  Expo aberto em nova janela!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  IMPORTANTE: Nao feche ESTA janela!" -ForegroundColor Red
Write-Host "  O tunnel SSH ficara ativo enquanto esta janela existir." -ForegroundColor Gray
Write-Host ""
Write-Host "  Pressione CTRL+C para encerrar o tunnel e o Expo." -ForegroundColor Gray
Write-Host ""

# Manter tunnel vivo ate CTRL+C
try {
    while (-not $sshProcess.HasExited) {
        Start-Sleep -Seconds 5
    }
    Write-Host "Tunnel encerrado inesperadamente." -ForegroundColor Red
} finally {
    $sshProcess | Stop-Process -Force -ErrorAction SilentlyContinue
    foreach ($f in @($stdoutFile, $stderrFile)) {
        if (Test-Path $f) { Remove-Item $f -ErrorAction SilentlyContinue }
    }
    Write-Host "Tunnel encerrado." -ForegroundColor Gray
}
