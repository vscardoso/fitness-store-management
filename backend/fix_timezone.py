"""
Script para corrigir timezone em todos os arquivos do backend.
Substitui datetime.utcnow() e datetime.now() por now_brazil() e today_brazil()
"""

import os
import re
from pathlib import Path

# Arquivos a processar
BACKEND_DIR = Path(__file__).parent
FILES_TO_FIX = [
    # Services
    "app/services/sale_service.py",
    "app/services/stock_entry_service.py",
    "app/services/product_service.py",
    "app/services/conditional_shipment.py",
    "app/services/conditional_notification_service.py",
    "app/services/notification_service.py",
    "app/services/notification_scheduler.py",
    "app/services/signup_service.py",
]

def add_timezone_import(content: str) -> str:
    """Adiciona import do timezone se não existir."""
    if "from app.core.timezone import" in content:
        # Já tem import, garantir que tem os dois
        if "now_brazil" not in content:
            content = content.replace(
                "from app.core.timezone import",
                "from app.core.timezone import now_brazil, today_brazil,"
            )
        return content
    
    # Procurar onde inserir (após imports de datetime)
    lines = content.split("\n")
    insert_idx = 0
    
    for i, line in enumerate(lines):
        if "from datetime import" in line or "import datetime" in line:
            insert_idx = i + 1
        elif "from app" in line:
            # Já passou dos imports stdlib, inserir aqui
            if insert_idx == 0:
                insert_idx = i
            break
    
    # Inserir import
    lines.insert(insert_idx, "from app.core.timezone import now_brazil, today_brazil")
    return "\n".join(lines)

def fix_file(filepath: Path) -> tuple[bool, int]:
    """
    Corrige um arquivo.
    
    Returns:
        (changed, num_replacements)
    """
    if not filepath.exists():
        print(f"❌ Arquivo não existe: {filepath}")
        return False, 0
    
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()
    
    original = content
    replacements = 0
    
    # 1. datetime.utcnow() -> now_brazil()
    pattern1 = r'datetime\.utcnow\(\)'
    matches1 = len(re.findall(pattern1, content))
    content = re.sub(pattern1, 'now_brazil()', content)
    replacements += matches1
    
    # 2. datetime.utcnow().date() -> today_brazil()
    pattern2 = r'now_brazil\(\)\.date\(\)'
    matches2 = len(re.findall(pattern2, content))
    content = re.sub(pattern2, 'today_brazil()', content)
    # Corrigir contador (já foi contado no passo 1)
    replacements += matches2 - matches1 if matches2 > 0 else 0
    
    # 3. datetime.now() -> now_brazil()
    pattern3 = r'datetime\.now\(\)(?!\s*\+)'  # Não substituir se seguido de + (já é timezone-aware)
    matches3 = len(re.findall(pattern3, content))
    content = re.sub(pattern3, 'now_brazil()', content)
    replacements += matches3
    
    # 4. date.today() -> today_brazil()
    pattern4 = r'date\.today\(\)'
    matches4 = len(re.findall(pattern4, content))
    content = re.sub(pattern4, 'today_brazil()', content)
    replacements += matches4
    
    if replacements > 0:
        # Adicionar import
        content = add_timezone_import(content)
        
        # Salvar
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content)
        
        return True, replacements
    
    return False, 0

def main():
    print("🔄 Corrigindo timezone em arquivos do backend...\n")
    
    total_files = 0
    total_replacements = 0
    
    for rel_path in FILES_TO_FIX:
        filepath = BACKEND_DIR / rel_path
        changed, count = fix_file(filepath)
        
        if changed:
            total_files += 1
            total_replacements += count
            print(f"✅ {rel_path}: {count} substituições")
        else:
            print(f"⏭️  {rel_path}: nenhuma mudança")
    
    print(f"\n📊 Resumo:")
    print(f"   - Arquivos modificados: {total_files}")
    print(f"   - Total de substituições: {total_replacements}")
    print(f"\n✅ Concluído!")

if __name__ == "__main__":
    main()
