# ============================================================================
# START TUNNEL - Inicia tunnel via SSH (localhost.run) sem conta necessaria
# ============================================================================
# Como usar:
#   .\start_tunnel.ps1
#
# Usa localhost.run via SSH - sem cadastro, sem instalacao extra
# ============================================================================

$PORT = 8000
$CONFIG_FILE = "$PSScriptRoot\mobile\constants\Config.ts"

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  FITNESS STORE - TUNNEL SETUP (localhost.run)" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Iniciando tunnel na porta $PORT..." -ForegroundColor Yellow
Write-Host "Aguarde a URL aparecer abaixo..." -ForegroundColor Gray
Write-Host ""
Write-Host "------------------------------------------------------------" -ForegroundColor DarkGray

# Roda SSH em background e captura a saida para pegar a URL
$stdoutFile = "$env:TEMP\tunnel_stdout.txt"
$stderrFile = "$env:TEMP\tunnel_stderr.txt"
if (Test-Path $stdoutFile) { Remove-Item $stdoutFile }
if (Test-Path $stderrFile) { Remove-Item $stderrFile }

$sshArgs = "-o StrictHostKeyChecking=no -R 80:localhost:$PORT nokey@localhost.run"
$sshProcess = Start-Process -FilePath "ssh" -ArgumentList $sshArgs `
    -RedirectStandardOutput $stdoutFile `
    -RedirectStandardError $stderrFile `
    -PassThru -NoNewWindow

# Aguardar URL aparecer no output (timeout 30s)
$maxWait = 30
$waited = 0
$tunnelUrl = $null

while ($waited -lt $maxWait) {
    Start-Sleep -Seconds 1
    $waited++

    # localhost.run escreve a URL tanto no stdout quanto no stderr
    foreach ($file in @($stdoutFile, $stderrFile)) {
        if (Test-Path $file) {
            $content = Get-Content $file -Raw -ErrorAction SilentlyContinue
            # localhost.run agora gera URLs no formato *.lhr.life
            if ($content -match 'https://[a-zA-Z0-9]+\.lhr\.life') {
                $tunnelUrl = $matches[0]
                break
            }
            # Fallback: formato antigo *.localhost.run (caso mude novamente)
            if ($content -match 'https://[a-zA-Z0-9\-]+\.localhost\.run') {
                $tunnelUrl = $matches[0]
                break
            }
        }
    }
    if ($tunnelUrl) { break }
}

Write-Host ""

if (-not $tunnelUrl) {
    Write-Host "ERRO: Nao foi possivel obter a URL do tunnel." -ForegroundColor Red
    Write-Host ""
    Write-Host "Saida do SSH (stdout):" -ForegroundColor Yellow
    if (Test-Path $stdoutFile) { Get-Content $stdoutFile }
    Write-Host "Saida do SSH (stderr):" -ForegroundColor Yellow
    if (Test-Path $stderrFile) { Get-Content $stderrFile }
    Write-Host ""
    Write-Host "Alternativa: autentique o ngrok e rode 'ngrok http 8000'" -ForegroundColor Yellow
    Write-Host "  ngrok config add-authtoken SEU_TOKEN" -ForegroundColor Gray
    Write-Host "  Token em: https://dashboard.ngrok.com/get-started/your-authtoken" -ForegroundColor Gray
    $sshProcess | Stop-Process -Force -ErrorAction SilentlyContinue
    exit 1
}

$apiUrl = "$tunnelUrl/api/v1"

Write-Host "Tunnel ativo!" -ForegroundColor Green
Write-Host "URL publica : $tunnelUrl" -ForegroundColor Green
Write-Host "API URL     : $apiUrl" -ForegroundColor Green
Write-Host ""

# Atualiza Config.ts
Write-Host "Atualizando mobile/constants/Config.ts..." -ForegroundColor Yellow

$lines = Get-Content $CONFIG_FILE
$newLines = $lines | ForEach-Object {
    if ($_ -match '^const LOCAL_API_URL\s*=') {
        "const LOCAL_API_URL = '$apiUrl'; // Tunnel localhost.run (redes diferentes)"
    } else {
        $_
    }
}
$newLines | Set-Content $CONFIG_FILE -Encoding UTF8

Write-Host "Config.ts atualizado!" -ForegroundColor Green
Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  TUNNEL RODANDO - nao feche esta janela" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Pressione CTRL+C para encerrar o tunnel." -ForegroundColor Gray
Write-Host ""

# Aguardar enquanto o tunnel estiver ativo
try {
    while (-not $sshProcess.HasExited) {
        Start-Sleep -Seconds 5
    }
    Write-Host "Tunnel encerrado inesperadamente." -ForegroundColor Red
} finally {
    if (-not $sshProcess.HasExited) {
        $sshProcess | Stop-Process -Force -ErrorAction SilentlyContinue
    }
    if (Test-Path $stdoutFile) { Remove-Item $stdoutFile -ErrorAction SilentlyContinue }
    if (Test-Path $stderrFile) { Remove-Item $stderrFile -ErrorAction SilentlyContinue }
    Write-Host "Tunnel encerrado." -ForegroundColor Gray
}
