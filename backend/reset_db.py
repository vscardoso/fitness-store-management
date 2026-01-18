"""
Reset completo do banco - recria tudo do zero
Uso: python reset_db.py
"""
import os
import subprocess

def run(cmd):
    print(f"⚙️  {cmd}")
    subprocess.run(cmd, shell=True, check=True)

def main():
    print("⚠️  RESETANDO BANCO DE DADOS...")

    # 1. Backup se existir
    if os.path.exists("fitness_store.db"):
        import shutil
        shutil.copy("fitness_store.db", f"fitness_store.db.backup")
        print("✅ Backup criado")

    # 2. Deletar banco
    if os.path.exists("fitness_store.db"):
        os.remove("fitness_store.db")
        print("✅ Banco deletado")

    # 3. Recriar migrations do zero
    run("alembic upgrade head")
    print("✅ Banco recriado")

    # 4. Criar usuário admin
    run("python create_user.py")
    print("✅ Usuário admin criado")

    print("\n✅ BANCO RESETADO COM SUCESSO")
    print("📧 Email: admin@fitness.com")
    print("🔑 Senha: admin123")

if __name__ == "__main__":
    main()
