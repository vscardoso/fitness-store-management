"""
Script para executar todos os testes completos do sistema.
Testa todos os endpoints: Produtos, Clientes, Lotes, Vendas e Inventário.

IMPORTANTE: Execute este script de dentro do diretório backend/
    cd backend
    python run_all_tests.py
"""
import subprocess
import sys
import os


def run_tests():
    """Executa todos os testes completos."""
    print("=" * 80)
    print("🧪 EXECUTANDO TESTES COMPLETOS DO SISTEMA")
    print("=" * 80)
    
    # Verificar se está no diretório correto
    if not os.path.exists("tests"):
        print("\n❌ ERRO: Diretório 'tests' não encontrado!")
        print("Execute este script do diretório backend:")
        print("    cd backend")
        print("    python run_all_tests.py")
        sys.exit(1)
    
    test_files = [
        "tests/test_products_complete.py",
        "tests/test_customers_complete.py",
        "tests/test_batches_complete.py",
        "tests/test_sales_complete.py",
        "tests/test_inventory_complete.py"
    ]
    
    print(f"\n📋 Arquivos de teste a serem executados:")
    for test_file in test_files:
        print(f"   - {test_file}")
    
    print("\n" + "=" * 80)
    print("💡 Dica: Certifique-se de que o backend está rodando!")
    print("=" * 80)
    
    all_passed = True
    
    for test_file in test_files:
        print(f"\n🔍 Executando: {test_file}")
        print("-" * 80)
        
        result = subprocess.run(
            [sys.executable, "-m", "pytest", test_file, "-v", "--tb=short"],
            capture_output=False
        )
        
        if result.returncode != 0:
            print(f"\n❌ Falhas encontradas em {test_file}")
            all_passed = False
        else:
            print(f"\n✅ Todos os testes passaram em {test_file}")
    
    print("\n" + "=" * 80)
    print("📊 EXECUTANDO TESTES COM COBERTURA")
    print("=" * 80)
    
    subprocess.run([
        sys.executable, "-m", "pytest",
        "tests/test_products_complete.py",
        "tests/test_customers_complete.py",
        "tests/test_batches_complete.py",
        "tests/test_sales_complete.py",
        "tests/test_inventory_complete.py",
        "-v",
        "--cov=app",
        "--cov-report=term-missing",
        "--cov-report=html"
    ])
    
    print("\n" + "=" * 80)
    if all_passed:
        print("✅ TESTES COMPLETOS FINALIZADOS COM SUCESSO!")
    else:
        print("⚠️ TESTES FINALIZADOS COM ALGUMAS FALHAS!")
    print("📄 Relatório HTML de cobertura gerado em: htmlcov/index.html")
    print("=" * 80)


if __name__ == "__main__":
    run_tests()
