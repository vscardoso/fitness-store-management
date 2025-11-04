# Script PowerShell para executar todos os testes completos
# Execute: .\run_tests.ps1

Write-Host "=" * 80 -ForegroundColor Cyan
Write-Host "🧪 EXECUTANDO TESTES COMPLETOS DO SISTEMA" -ForegroundColor Cyan
Write-Host "=" * 80 -ForegroundColor Cyan

# Ativar ambiente virtual
Write-Host "`n🔧 Ativando ambiente virtual..." -ForegroundColor Yellow
.\venv\Scripts\Activate.ps1

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Erro ao ativar ambiente virtual!" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Ambiente virtual ativado!" -ForegroundColor Green

# Lista de arquivos de teste
$testFiles = @(
    "tests/test_products_complete.py",
    "tests/test_customers_complete.py",
    "tests/test_batches_complete.py",
    "tests/test_sales_complete.py",
    "tests/test_inventory_complete.py"
)

Write-Host "`n📋 Arquivos de teste a serem executados:" -ForegroundColor Cyan
foreach ($file in $testFiles) {
    Write-Host "   - $file" -ForegroundColor Gray
}

Write-Host "`n" + "=" * 80 -ForegroundColor Cyan
Write-Host "💡 Dica: Certifique-se de que o backend está rodando!" -ForegroundColor Yellow
Write-Host "=" * 80 -ForegroundColor Cyan

$allPassed = $true

# Executar cada arquivo de teste
foreach ($testFile in $testFiles) {
    Write-Host "`n🔍 Executando: $testFile" -ForegroundColor Cyan
    Write-Host "-" * 80 -ForegroundColor Gray
    
    pytest $testFile -v --tb=short
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "`n❌ Falhas encontradas em $testFile" -ForegroundColor Red
        $allPassed = $false
    } else {
        Write-Host "`n✅ Todos os testes passaram em $testFile" -ForegroundColor Green
    }
}

# Executar com cobertura
Write-Host "`n" + "=" * 80 -ForegroundColor Cyan
Write-Host "📊 EXECUTANDO TESTES COM COBERTURA" -ForegroundColor Cyan
Write-Host "=" * 80 -ForegroundColor Cyan

pytest tests/test_products_complete.py tests/test_customers_complete.py tests/test_batches_complete.py tests/test_sales_complete.py tests/test_inventory_complete.py -v --cov=app --cov-report=term-missing --cov-report=html

Write-Host "`n" + "=" * 80 -ForegroundColor Cyan
if ($allPassed) {
    Write-Host "✅ TESTES COMPLETOS FINALIZADOS COM SUCESSO!" -ForegroundColor Green
} else {
    Write-Host "⚠️ TESTES FINALIZADOS COM ALGUMAS FALHAS!" -ForegroundColor Yellow
}
Write-Host "📄 Relatório HTML de cobertura gerado em: htmlcov/index.html" -ForegroundColor Cyan
Write-Host "=" * 80 -ForegroundColor Cyan
