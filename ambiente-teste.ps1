# Ambiente de teste local (SIT na máquina): backend descartável + app web com o código ATUAL, para validar antes de produção.
# Nada aqui toca no servidor de produção. Detalhes em docs/AMBIENTE_TESTE.md.
#
#   .\ambiente-teste.ps1                 sobe (refaz o app com o código atual; cria a loja de exemplo na primeira vez)
#   .\ambiente-teste.ps1 -SemBuild       sobe reaproveitando o app já gerado (rápido)
#   .\ambiente-teste.ps1 -Recriar        apaga o banco de teste e refaz a loja de exemplo
#   .\ambiente-teste.ps1 parar           desliga tudo
#   .\ambiente-teste.ps1 status          mostra o que está no ar
param(
  [ValidateSet('subir', 'parar', 'status')][string]$Acao = 'subir',
  [switch]$SemBuild,
  [switch]$Recriar
)
$ErrorActionPreference = 'Stop'
$Raiz = $PSScriptRoot
$Backend = Join-Path $Raiz 'backend'
$Mobile = Join-Path $Raiz 'mobile'
$Dist = Join-Path $Mobile 'dist-teste'
$Py = Join-Path $Backend 'venv\Scripts\python.exe'
$Banco = Join-Path $Backend 'ambiente_teste.db'
$Acesso = Join-Path $Backend 'ambiente_teste_acesso.local.txt'
$Logs = Join-Path $Raiz 'ambiente-teste-logs'
$Api = 'http://127.0.0.1:8000'
$App = 'http://127.0.0.1:8081'

function Parar-Servidores {
  $alvos = Get-CimInstance Win32_Process | Where-Object {
    $_.CommandLine -and (
      $_.CommandLine -match 'uvicorn app\.main:app --host 127\.0\.0\.1 --port 8000' -or
      $_.CommandLine -match 'spa[-_]server\.py'
    )
  }
  foreach ($p in $alvos) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Seconds 2
}

function No-Ar([string]$url) {
  try { (Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5).StatusCode -eq 200 } catch { $false }
}

if ($Acao -eq 'parar') { Parar-Servidores; Write-Host 'Ambiente de teste desligado.'; return }
if ($Acao -eq 'status') {
  Write-Host ("API  {0}: {1}" -f $Api, $(if (No-Ar "$Api/health") { 'no ar' } else { 'fora' }))
  Write-Host ("App  {0}: {1}" -f $App, $(if (No-Ar $App) { 'no ar' } else { 'fora' }))
  return
}

if (-not (Test-Path $Py)) { throw "Python do backend não encontrado em $Py (crie o venv do backend primeiro)." }
New-Item -ItemType Directory -Force $Logs | Out-Null
Parar-Servidores

# 1) backend com banco descartável
$primeiraVez = $Recriar -or -not (Test-Path $Banco)
if ($Recriar) { Remove-Item "$Banco*" -Force -ErrorAction SilentlyContinue }
$env:CORS_ORIGINS = '["http://127.0.0.1:8081","http://localhost:8081"]'
$env:DATABASE_URL = 'sqlite+aiosqlite:///./ambiente_teste.db'
$env:ENVIRONMENT = 'development'
$env:SECRET_KEY = 'ambiente-teste-local-0123456789abcdefghij'
Start-Process -FilePath $Py -ArgumentList '-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8000' `
  -WorkingDirectory $Backend -WindowStyle Hidden -RedirectStandardOutput (Join-Path $Logs 'backend.log') -RedirectStandardError (Join-Path $Logs 'backend.err.log')
Write-Host 'Ligando o backend...'
$ok = $false
for ($i = 0; $i -lt 40 -and -not $ok; $i++) { Start-Sleep -Seconds 2; $ok = No-Ar "$Api/health" }
if (-not $ok) { throw "Backend não respondeu. Veja $Logs\backend.err.log" }

# 2) loja de exemplo (só na primeira vez ou com -Recriar)
if ($primeiraVez -or -not (Test-Path $Acesso)) {
  Write-Host 'Criando a loja de exemplo...'
  & $Py -I -X utf8 (Join-Path $Backend 'scripts\ambiente_teste.py')
  if ($LASTEXITCODE -ne 0) { throw 'Não consegui criar a loja de exemplo.' }
}

# 3) app web com o código atual
if (-not $SemBuild -or -not (Test-Path (Join-Path $Dist 'index.html'))) {
  Write-Host 'Gerando o app com o código atual (uns 3 a 5 minutos)...'
  $env:EXPO_PUBLIC_API_URL = "$Api/api/v1"
  $env:EXPO_PUBLIC_FEATURES = 'receberCompra'   # só no ambiente de teste: liga a tela nova Receber compra (em produção a chave é falsa)
  $env:CI = '1'
  Push-Location $Mobile
  try {
    if (Test-Path $Dist) { Remove-Item $Dist -Recurse -Force }
    & node node_modules/expo/bin/cli export --platform web --output-dir $Dist --clear *> (Join-Path $Logs 'build.log')
    if ($LASTEXITCODE -ne 0) { throw "O build falhou. Veja $Logs\build.log" }
  } finally { Pop-Location }
}

# 4) servir o app
Start-Process -FilePath $Py -ArgumentList '-I', '-X', 'utf8', (Join-Path $Mobile 'scripts\spa-server.py'), $Dist, '8081' `
  -WindowStyle Hidden -RedirectStandardOutput (Join-Path $Logs 'app.log') -RedirectStandardError (Join-Path $Logs 'app.err.log')
Start-Sleep -Seconds 3
if (-not (No-Ar $App)) { throw "O app não respondeu em $App. Veja $Logs\app.err.log" }

Write-Host ''
Write-Host "Ambiente de teste no ar: $App   (a API em $Api não tem tela)"
Write-Host "E-mail e senha: $Acesso"
