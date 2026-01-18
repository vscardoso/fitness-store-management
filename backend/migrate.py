"""
Script automatizado para migrations - ZERO ERROS
Uso: python migrate.py "mensagem da migration"
"""
import sys
import subprocess
from datetime import datetime

def run(cmd):
    """Executa comando e retorna output"""
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True, encoding='utf-8')
    if result.returncode != 0:
        print(f"ERRO: {result.stderr}")
        sys.exit(1)
    return result.stdout

def main():
    if len(sys.argv) < 2:
        print("Uso: python migrate.py 'mensagem da migration'")
        sys.exit(1)

    # Garantir que está no diretório backend
    import os
    script_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(script_dir)

    msg = sys.argv[1]

    print("[1/3] Verificando estado atual...")
    run("alembic current")

    print("[2/3] Gerando migration...")
    run(f'alembic revision --autogenerate -m "{msg}"')

    print("[3/3] Aplicando migration...")
    run("alembic upgrade head")

    print(f"OK - Migration '{msg}' aplicada!")

if __name__ == "__main__":
    main()
