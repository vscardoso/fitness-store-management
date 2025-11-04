import zipfile
import os
from datetime import datetime
from pathlib import Path

# Pastas/arquivos a ignorar
EXCLUDE = {
    'node_modules', '__pycache__', '.venv', 'venv', 
    '.git', '.expo', 'dist', 'build', '.pytest_cache',
    'htmlcov', '.coverage', '.DS_Store', 'nul',
    'fitness-store.zip'  # Não incluir o próprio zip
}

def should_exclude(path):
    """Verifica se deve excluir o arquivo/pasta"""
    parts = Path(path).parts
    name = os.path.basename(path)
    
    # Excluir por nome exato ou padrão
    if name in EXCLUDE:
        return True
    if any(exc in parts for exc in EXCLUDE):
        return True
    if path.endswith('.pyc') or path.endswith('.log'):
        return True
    if name.startswith('.env'):
        return True
    
    return False

# Nome do ZIP
zip_name = f"fitness-store-{datetime.now():%Y%m%d-%H%M%S}.zip"

print(f"🎯 Criando {zip_name}...")
print("=" * 50)

file_count = 0
skipped = []

try:
    with zipfile.ZipFile(zip_name, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk('.'):
            # Remover pastas excluídas
            dirs[:] = [d for d in dirs if not should_exclude(os.path.join(root, d))]
            
            for file in files:
                filepath = os.path.join(root, file)
                
                if should_exclude(filepath):
                    skipped.append(filepath)
                    continue
                
                try:
                    arcname = filepath[2:] if filepath.startswith('.\\') else filepath
                    zipf.write(filepath, arcname)
                    file_count += 1
                    if file_count % 10 == 0:
                        print(f"  ✓ {file_count} arquivos...")
                except Exception as e:
                    print(f"  ⚠️  Pulando {filepath}: {e}")
                    skipped.append(filepath)

    print("=" * 50)
    print(f"✅ ZIP criado com sucesso!")
    print(f"📦 Arquivo: {zip_name}")
    print(f"📊 Arquivos: {file_count}")
    print(f"💾 Tamanho: {os.path.getsize(zip_name) / 1024 / 1024:.2f} MB")
    
    if skipped:
        print(f"\n⚠️  {len(skipped)} arquivos ignorados:")
        for s in skipped[:10]:
            print(f"  - {s}")
        if len(skipped) > 10:
            print(f"  ... e mais {len(skipped) - 10}")

except Exception as e:
    print(f"❌ Erro: {e}")